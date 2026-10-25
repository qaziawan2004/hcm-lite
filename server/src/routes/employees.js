import { Router } from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler, paginate } from '../utils/http.js';
import { audit, notify } from '../services/log.js';
import { ensureEmailConfigured, sendWelcomeEmail } from '../services/email.js';

const r = Router();
r.use(protect);

const tempPassword = () => crypto.randomBytes(5).toString('base64url') + '#9';
const nextEmployeeId = async () => {
  const last = await User.findOne({ employeeId: /^EMP-\d+$/ }).sort({ employeeId: -1 }).select('employeeId');
  const n = last ? parseInt(last.employeeId.slice(4)) + 1 : 1;
  return `EMP-${String(n).padStart(4, '0')}`;
};
const assignMissingEmployeeIds = async () => {
  const missing = await User.find({ employeeId: { $in: [null, ''] } })
    .select('_id')
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  for (const { _id } of missing) {
    let assigned = false;
    while (!assigned) {
      const employeeId = await nextEmployeeId();
      try {
        const result = await User.updateOne(
          { _id, employeeId: { $in: [null, ''] } },
          { $set: { employeeId } }
        );
        assigned = result.matchedCount === 0 || result.modifiedCount === 1;
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }
  }
};
// HR may only manage plain employees; admins manage everyone.
const canManage = (actor, target) => actor.role === 'admin' || target.role === 'employee';

r.get('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  await assignMissingEmployeeIds();
  const { q, department, status, role } = req.query;
  const { page, limit, skip } = paginate(req.query);
  const f = {};
  if (department) f.department = department;
  if (status) f.status = status;
  if (role) f.role = role;
  if (q) { const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ name: rx }, { email: rx }, { employeeId: rx }]; }
  const [items, total] = await Promise.all([User.find(f).sort({ employeeId: 1 }).skip(skip).limit(limit), User.countDocuments(f)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

// Lightweight list for dropdowns
r.get('/options', authorize('admin', 'hr'), asyncHandler(async (_req, res) =>
  res.json({ items: await User.find({ status: 'active' }).select('name employeeId department role').sort({ name: 1 }) })));

r.post('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { name, email, role = 'employee', department, designation, phone, joinDate, password } = req.body;
  if (!name || !email) throw new HttpError(400, 'Name and email are required.');
  if (!['admin', 'hr', 'employee'].includes(role)) throw new HttpError(400, 'Invalid role.');
  if (role !== 'employee' && req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can create HR or admin accounts.');
  ensureEmailConfigured();
  const company = await Company.findOne();
  const temp = password || tempPassword();
  const user = await User.create({
    name, email, role, department, designation, phone, joinDate: joinDate || undefined, password: temp,
    employeeId: await nextEmployeeId(), mustChangePassword: true, leaveBalance: company ? { annual: company.leaveQuota.annual, sick: company.leaveQuota.sick, casual: company.leaveQuota.casual } : undefined,
  });
  await sendWelcomeEmail(user);
  await audit(req, 'EMPLOYEE_CREATED', 'User', user._id, `${user.name} (${user.role})`);
  await notify(user._id, 'Welcome to HCM Lite', 'Your account is ready. Please change your password.', '/profile');
  res.status(201).json({ user, temporaryPassword: temp });
}));

r.put('/me/profile', asyncHandler(async (req, res) => {
  const { phone, name } = req.body;
  if (phone !== undefined) req.user.phone = phone;
  if (name) req.user.name = name;
  await req.user.save();
  await audit(req, 'PROFILE_UPDATED', 'User', req.user._id);
  res.json({ user: req.user });
}));

r.get('/:id', asyncHandler(async (req, res) => {
  if (!['admin', 'hr'].includes(req.user.role) && String(req.user._id) !== req.params.id) throw new HttpError(403, 'You can only view your own profile.');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Employee not found.');
  res.json({ user });
}));

r.put('/:id', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Employee not found.');
  if (!canManage(req.user, user)) throw new HttpError(403, 'Only an admin can edit HR or admin accounts.');
  const b = req.body;
  for (const k of ['name', 'department', 'designation', 'phone', 'joinDate']) if (b[k] !== undefined) user[k] = b[k];
  if (b.email) user.email = b.email;
  if (b.role && b.role !== user.role) {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can change roles.');
    if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot change your own role.');
    user.role = b.role;
  }
  if (b.leaveBalance && req.user.role) for (const k of ['annual', 'sick', 'casual']) if (b.leaveBalance[k] !== undefined) user.leaveBalance[k] = Number(b.leaveBalance[k]);
  await user.save();
  await audit(req, 'EMPLOYEE_UPDATED', 'User', user._id, user.name);
  res.json({ user });
}));

r.patch('/:id/status', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) throw new HttpError(400, 'Status must be active or inactive.');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Employee not found.');
  if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot deactivate your own account.');
  if (!canManage(req.user, user)) throw new HttpError(403, 'Only an admin can change HR or admin accounts.');
  user.status = status; await user.save();
  await audit(req, status === 'active' ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED', 'User', user._id, user.name);
  res.json({ user });
}));

r.post('/:id/reset-password', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Employee not found.');
  if (!canManage(req.user, user)) throw new HttpError(403, 'Only an admin can reset HR or admin passwords.');
  const temp = tempPassword();
  user.password = temp; user.mustChangePassword = true; await user.save();
  await audit(req, 'PASSWORD_RESET', 'User', user._id, user.name);
  res.json({ temporaryPassword: temp });
}));

export default r;
