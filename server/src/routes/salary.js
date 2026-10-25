import { Router } from 'express';
import Salary from '../models/Salary.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { isValidDate, today } from '../utils/dates.js';
import { audit } from '../services/log.js';
import { refreshGeneratedPayroll } from '../services/payroll.js';

const r = Router();
r.use(protect);
const latestFirst = { effectiveFrom: -1, createdAt: -1, _id: -1 };
const items = (a) => (Array.isArray(a) ? a : []).filter((i) => i && i.name && Number(i.amount) >= 0).map((i) => ({ name: String(i.name).trim(), amount: Number(i.amount) }));

r.get('/my', asyncHandler(async (req, res) =>
  res.json({ salary: await Salary.findOne({ user: req.user._id, effectiveFrom: { $lte: today() } }).sort(latestFirst) })));

// Current salary for all active employees (HR/admin)
r.get('/', authorize('admin', 'hr'), asyncHandler(async (_req, res) => {
  const users = await User.find({ status: 'active' }).select('name employeeId department designation').sort({ employeeId: 1 });
  const rows = await Promise.all(users.map(async (u) => ({
    user: u, salary: await Salary.findOne({ user: u._id, effectiveFrom: { $lte: today() } }).sort(latestFirst) })));
  res.json({ items: rows });
}));

r.get('/history/:userId', authorize('admin', 'hr'), asyncHandler(async (req, res) =>
  res.json({ items: await Salary.find({ user: req.params.userId }).sort(latestFirst).populate('createdBy', 'name') })));

r.post('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { userId, basic, allowances, deductions, effectiveFrom } = req.body;
  const user = await User.findById(userId);
  if (!user) throw new HttpError(404, 'Employee not found.');
  if (!(Number(basic) >= 0) || basic === '' || basic === undefined) throw new HttpError(400, 'Enter a valid basic salary.');
  if (!isValidDate(effectiveFrom)) throw new HttpError(400, 'Enter a valid effective date.');
  const s = await Salary.create({ user: userId, basic: Number(basic), allowances: items(allowances), deductions: items(deductions), effectiveFrom, createdBy: req.user._id });
  const refreshedPayroll = await refreshGeneratedPayroll(user._id, effectiveFrom);
  await audit(req, 'SALARY_SET', 'Salary', s._id, `${user.name}: basic ${s.basic} from ${effectiveFrom}`);
  res.status(201).json({ salary: s, refreshedPayroll });
}));

export default r;
