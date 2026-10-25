import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler, paginate } from '../utils/http.js';
import { today, nowHHMM, minutes, isValidMonth, isValidDate, currentMonth, monthRange } from '../utils/dates.js';
import { audit } from '../services/log.js';

const r = Router();
r.use(protect);

r.get('/today', asyncHandler(async (req, res) =>
  res.json({ record: await Attendance.findOne({ user: req.user._id, date: today() }) })));

r.post('/check-in', asyncHandler(async (req, res) => {
  const date = today();
  if (await Attendance.exists({ user: req.user._id, date })) throw new HttpError(409, 'You have already checked in today.');
  const c = (await Company.findOne()) || {};
  const limit = minutes(c.workStart || '09:00') + (c.graceMinutes ?? 15);
  const status = minutes(nowHHMM()) > limit ? 'late' : 'present';
  const record = await Attendance.create({ user: req.user._id, date, checkIn: new Date(), status });
  await audit(req, 'CHECK_IN', 'Attendance', record._id, status);
  res.status(201).json({ record });
}));

r.post('/check-out', asyncHandler(async (req, res) => {
  const record = await Attendance.findOne({ user: req.user._id, date: today() });
  if (!record) throw new HttpError(400, 'You have not checked in today.');
  if (record.checkOut) throw new HttpError(409, 'You have already checked out today.');
  record.checkOut = new Date();
  record.hours = Math.round(((record.checkOut - record.checkIn) / 36e5) * 100) / 100;
  await record.save();
  await audit(req, 'CHECK_OUT', 'Attendance', record._id, `${record.hours}h`);
  res.json({ record });
}));

r.get('/my', asyncHandler(async (req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : currentMonth();
  const { first, last } = monthRange(month);
  const items = await Attendance.find({ user: req.user._id, date: { $gte: first, $lte: last } }).sort({ date: -1 });
  res.json({ items, month, summary: { present: items.filter((i) => i.status === 'present').length, late: items.filter((i) => i.status === 'late').length,
    hours: Math.round(items.reduce((t, i) => t + i.hours, 0) * 10) / 10 } });
}));

// Admin report. ?date=YYYY-MM-DD or ?month=YYYY-MM, optional ?userId=
r.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { date, month, userId } = req.query;
  const { page, limit, skip } = paginate({ ...req.query, limit: req.query.limit || 20 });
  const f = {};
  if (userId) f.user = userId;
  if (date) { if (!isValidDate(date)) throw new HttpError(400, 'Invalid date.'); f.date = date; }
  else { const m = isValidMonth(month) ? month : currentMonth(); const { first, last } = monthRange(m); f.date = { $gte: first, $lte: last }; }
  const [items, total] = await Promise.all([
    Attendance.find(f).populate('user', 'name employeeId department').sort({ date: -1 }).skip(skip).limit(limit),
    Attendance.countDocuments(f)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

export default r;
