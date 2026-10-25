import { Router } from 'express';
import Leave from '../models/Leave.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler, paginate } from '../utils/http.js';
import { isValidDate, workingDays, today } from '../utils/dates.js';
import { audit, notify, notifyRoles } from '../services/log.js';

const r = Router();
r.use(protect);
const TYPES = ['annual', 'sick', 'casual', 'unpaid'];

r.get('/balance', asyncHandler(async (req, res) => res.json({ balance: req.user.leaveBalance })));

r.post('/', asyncHandler(async (req, res) => {
  const { type, from, to, reason } = req.body;
  if (!TYPES.includes(type)) throw new HttpError(400, 'Choose a valid leave type.');
  if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, 'Enter valid start and end dates.');
  if (to < from) throw new HttpError(400, 'End date cannot be before the start date.');
  if (from < today() && type !== 'sick') throw new HttpError(400, 'Only sick leave can start in the past.');
  if (typeof reason !== 'string' || reason.trim().length < 3) throw new HttpError(400, 'Add a short reason.');
  const days = workingDays(from, to);
  if (days < 1) throw new HttpError(400, 'The selected dates have no working days (weekends excluded).');
  if (type !== 'unpaid' && days > req.user.leaveBalance[type]) throw new HttpError(400, `Not enough ${type} leave. You have ${req.user.leaveBalance[type]} day(s) left.`);
  const overlap = await Leave.exists({ user: req.user._id, status: { $in: ['pending', 'approved'] }, from: { $lte: to }, to: { $gte: from } });
  if (overlap) throw new HttpError(409, 'You already have a leave request overlapping these dates.');
  const leave = await Leave.create({ user: req.user._id, type, from, to, days, reason: reason.trim() });
  await audit(req, 'LEAVE_APPLIED', 'Leave', leave._id, `${type} ${from}→${to} (${days}d)`);
  // HR approves employees; only admins approve HR/admin requests.
  await notifyRoles(req.user.role === 'employee' ? ['hr', 'admin'] : ['admin'], 'New leave request',
    `${req.user.name} requested ${days} day(s) of ${type} leave.`, '/leaves?tab=approvals', req.user._id);
  res.status(201).json({ leave });
}));

r.get('/my', asyncHandler(async (req, res) =>
  res.json({ items: await Leave.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('reviewedBy', 'name') })));

r.get('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit, skip } = paginate(req.query);
  const f = status ? { status } : {};
  const [items, total] = await Promise.all([
    Leave.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name employeeId department role').populate('reviewedBy', 'name'),
    Leave.countDocuments(f)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

r.patch('/:id/decision', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'Decision must be approved or rejected.');
  if (note !== undefined && typeof note !== 'string') throw new HttpError(400, 'Review note must be text.');
  const leave = await Leave.findById(req.params.id);
  if (!leave) throw new HttpError(404, 'Leave request not found.');
  if (leave.status !== 'pending') throw new HttpError(409, `This request is already ${leave.status}.`);
  if (String(leave.user) === String(req.user._id)) throw new HttpError(403, 'You cannot review your own leave request.');
  const owner = await User.findById(leave.user);
  if (!owner) throw new HttpError(404, 'Leave request owner not found.');
  if (owner.role !== 'employee' && req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can review HR or admin leave requests.');
  if (decision === 'approved' && leave.type !== 'unpaid') {
    if (owner.leaveBalance[leave.type] < leave.days) throw new HttpError(400, `${owner.name} only has ${owner.leaveBalance[leave.type]} ${leave.type} day(s) left.`);
    owner.leaveBalance[leave.type] -= leave.days; await owner.save();
  }
  Object.assign(leave, { status: decision, reviewedBy: req.user._id, reviewNote: note || '', reviewedAt: new Date() });
  await leave.save();
  await audit(req, decision === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', 'Leave', leave._id, `${owner.name} ${leave.type} ${leave.from}→${leave.to}`);
  await notify(owner._id, `Leave ${decision}`, `Your ${leave.type} leave (${leave.from} to ${leave.to}) was ${decision}.${note ? ' Note: ' + note : ''}`, '/leaves');
  res.json({ leave });
}));

r.patch('/:id/cancel', asyncHandler(async (req, res) => {
  const leave = await Leave.findById(req.params.id);
  if (!leave || String(leave.user) !== String(req.user._id)) throw new HttpError(404, 'Leave request not found.');
  if (leave.status !== 'pending') throw new HttpError(409, 'Only pending requests can be cancelled.');
  leave.status = 'cancelled'; await leave.save();
  await audit(req, 'LEAVE_CANCELLED', 'Leave', leave._id);
  res.json({ leave });
}));

export default r;
