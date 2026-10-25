import User from '../models/User.js';
import Salary from '../models/Salary.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import { monthRange, workingDays, today } from '../utils/dates.js';

const sum = (arr = []) => arr.reduce((t, i) => t + (i.amount || 0), 0);
const round = (n) => Math.round(n * 100) / 100;

/** Creates payroll rows for every active employee that has a salary and no row for the month yet. */
export async function runPayroll(month, actorId) {
  const { first, last } = monthRange(month);
  const users = await User.find({ status: 'active', joinDate: { $lte: last } });
  const out = { created: 0, skippedExisting: 0, skippedNoSalary: [] };
  const elapsedEnd = today() < last ? today() : last;

  for (const u of users) {
    if (await Payroll.exists({ user: u._id, month })) { out.skippedExisting++; continue; }
    const salary = await Salary.findOne({ user: u._id, effectiveFrom: { $lte: last } })
      .sort({ effectiveFrom: -1, createdAt: -1, _id: -1 });
    if (!salary) { out.skippedNoSalary.push(u.name); continue; }

    const start = u.joinDate > first ? u.joinDate : first;
    const totalWorking = workingDays(start, last);
    const elapsedWorking = elapsedEnd >= start ? workingDays(start, elapsedEnd) : 0;
    const presentDays = await Attendance.countDocuments({ user: u._id, date: { $gte: start, $lte: last } });

    const leaves = await Leave.find({ user: u._id, status: 'approved', from: { $lte: last }, to: { $gte: start } });
    let paidLeaveDays = 0, unpaidLeaveDays = 0;
    for (const l of leaves) {
      const d = workingDays(l.from > start ? l.from : start, l.to < last ? l.to : last);
      if (l.type === 'unpaid') unpaidLeaveDays += d; else paidLeaveDays += d;
    }
    const absent = Math.max(0, elapsedWorking - presentDays - paidLeaveDays - unpaidLeaveDays);
    const unpaidDays = absent + unpaidLeaveDays;

    const gross = salary.basic + sum(salary.allowances);
    const attendanceDeduction = totalWorking ? round((gross / totalWorking) * unpaidDays) : 0;
    const totalDeductions = sum(salary.deductions) + attendanceDeduction;

    await Payroll.create({
      user: u._id, month, workingDays: totalWorking, presentDays, paidLeaveDays, unpaidDays,
      basic: salary.basic, allowances: salary.allowances, deductions: salary.deductions,
      gross, attendanceDeduction, totalDeductions, netPay: Math.max(0, round(gross - totalDeductions)),
      generatedBy: actorId,
    });
    out.created++;
  }
  return out;
}

export async function refreshGeneratedPayroll(userId, effectiveFrom) {
  const payrolls = await Payroll.find({
    user: userId,
    status: 'generated',
    month: { $gte: effectiveFrom.slice(0, 7) },
  });
  let updated = 0;

  for (const payroll of payrolls) {
    const { last } = monthRange(payroll.month);
    const salary = await Salary.findOne({ user: userId, effectiveFrom: { $lte: last } })
      .sort({ effectiveFrom: -1, createdAt: -1, _id: -1 });
    if (!salary) continue;

    const gross = salary.basic + sum(salary.allowances);
    const attendanceDeduction = payroll.workingDays
      ? round((gross / payroll.workingDays) * payroll.unpaidDays)
      : 0;
    const totalDeductions = sum(salary.deductions) + attendanceDeduction;

    payroll.basic = salary.basic;
    payroll.allowances = salary.allowances;
    payroll.deductions = salary.deductions;
    payroll.gross = gross;
    payroll.attendanceDeduction = attendanceDeduction;
    payroll.totalDeductions = totalDeductions;
    payroll.netPay = Math.max(0, round(gross - totalDeductions));
    await payroll.save();
    updated++;
  }

  return updated;
}
