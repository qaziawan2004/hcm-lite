import { Router } from 'express';
import PDFDocument from 'pdfkit';
import Payroll from '../models/Payroll.js';
import Company from '../models/Company.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { isValidMonth, currentMonth } from '../utils/dates.js';
import { runPayroll, refreshPayrollMonth, refreshPayrollRecord } from '../services/payroll.js';
import { audit, notify } from '../services/log.js';

const r = Router();
r.use(protect);

r.post('/run', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { month } = req.body;
  if (!isValidMonth(month)) throw new HttpError(400, 'Choose a month in YYYY-MM format.');
  if (month > currentMonth()) throw new HttpError(400, 'You cannot run payroll for a future month.');
  const result = await runPayroll(month, req.user._id);
  await audit(req, 'PAYROLL_RUN', 'Payroll', month, `${result.created} created, ${result.skippedExisting} existing, ${result.skippedNoSalary.length} without salary`);
  res.json(result);
}));

r.get('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : currentMonth();
  await refreshPayrollMonth(month);
  const items = await Payroll.find({ month }).populate('user', 'name employeeId department').sort({ createdAt: 1 });
  const totals = items.reduce((t, p) => ({ gross: t.gross + p.gross, deductions: t.deductions + p.totalDeductions, net: t.net + p.netPay }), { gross: 0, deductions: 0, net: 0 });
  res.json({ items, month, totals });
}));

r.get('/my', asyncHandler(async (req, res) =>
  res.json({ items: await Payroll.find({ user: req.user._id }).sort({ month: -1 }) })));

r.post('/mark-paid', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { month } = req.body;
  if (!isValidMonth(month)) throw new HttpError(400, 'Choose a valid month.');
  const rows = await Payroll.find({ month, status: 'generated' });
  await Payroll.updateMany({ month, status: 'generated' }, { status: 'paid', paidAt: new Date() });
  await notify(rows.map((p) => p.user), 'Payslip ready', `Your payslip for ${month} is available.`, '/payslips');
  await audit(req, 'PAYROLL_PAID', 'Payroll', month, `${rows.length} payslips`);
  res.json({ updated: rows.length });
}));

r.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const p = await Payroll.findById(req.params.id);
  if (!p) throw new HttpError(404, 'Payroll record not found.');
  if (p.status === 'paid') throw new HttpError(409, 'Paid payroll cannot be deleted.');
  await p.deleteOne();
  await audit(req, 'PAYROLL_DELETED', 'Payroll', p._id, p.month);
  res.json({ message: 'Deleted. Run payroll again to regenerate it.' });
}));

r.get('/:id/payslip', asyncHandler(async (req, res) => {
  let p = await Payroll.findById(req.params.id).populate('user');
  if (!p) throw new HttpError(404, 'Payslip not found.');
  const own = String(p.user._id) === String(req.user._id);
  if (!own && !['admin', 'hr'].includes(req.user.role)) throw new HttpError(403, 'You can only download your own payslips.');
  if (own && req.user.role === 'employee' && p.status !== 'paid') throw new HttpError(403, 'This payslip is not published yet.');
  await refreshPayrollRecord(p._id);
  p = await Payroll.findById(p._id).populate('user');
  const c = (await Company.findOne()) || { name: 'HCM Lite', currency: 'PKR' };
  const money = (n) => `${c.currency} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${p.user.employeeId}-${p.month}.pdf"`);
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(res);
  doc.fontSize(20).font('Helvetica-Bold').text(c.name);
  doc.fontSize(11).font('Helvetica').fillColor('#555').text(`Payslip for ${p.month}`).moveDown(1);
  doc.fillColor('#000').fontSize(11);
  [['Employee', p.user.name], ['Employee ID', p.user.employeeId], ['Department', p.user.department || '-'], ['Designation', p.user.designation || '-'],
   ['Working days', p.workingDays], ['Present days', p.presentDays], ['Paid leave days', p.paidLeaveDays], ['Unpaid days', p.unpaidDays]]
    .forEach(([k, v]) => doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v)));
  doc.moveDown();
  const row = (label, amt, bold) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, 48, y, { width: 300 }).text(money(amt), 348, y, { width: 200, align: 'right' });
    doc.moveDown(0.4);
  };
  doc.font('Helvetica-Bold').fontSize(13).text('Earnings').moveDown(0.3); doc.fontSize(11);
  row('Basic salary', p.basic); p.allowances.forEach((a) => row(a.name, a.amount)); row('Gross pay', p.gross, true);
  doc.moveDown().font('Helvetica-Bold').fontSize(13).text('Deductions').moveDown(0.3); doc.fontSize(11);
  p.deductions.forEach((d) => row(d.name, d.amount)); row('Unpaid days deduction', p.attendanceDeduction); row('Total deductions', p.totalDeductions, true);
  doc.moveDown().fontSize(14); row('Net pay', p.netPay, true);
  doc.moveDown(2).fontSize(9).fillColor('#777').font('Helvetica').text('This is a system-generated payslip and does not require a signature.');
  doc.end();
  await audit(req, 'PAYSLIP_DOWNLOADED', 'Payroll', p._id, p.month);
}));

export default r;
