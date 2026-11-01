import { Router } from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler, paginate } from '../utils/http.js';
import { audit, notify } from '../services/log.js';
import { ensureEmailConfigured, sendWelcomeEmail } from '../services/email.js';
import { today } from '../utils/dates.js';
import Leave from '../models/Leave.js';
import multer from 'multer';
import { cloudinaryConfigured, uploadProfilePhoto } from '../services/cloudinary.js';

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
const employeeFilter = (query) => {
  const f = {};
  if (query.department) f.department = query.department;
  if (query.status) f.status = query.status;
  if (query.role) f.role = query.role;
  if (query.q) {
    const rx = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ name: rx }, { email: rx }, { employeeId: rx }];
  }
  return f;
};
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new HttpError(400, 'Choose a JPEG, PNG or WebP image.'));
      return;
    }
    callback(null, true);
  },
});
const isValidImage = ({ buffer, mimetype }) => {
  if (mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimetype === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mimetype === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
};
const parsePhoto = (req, res, next) => photoUpload.single('photo')(req, res, (error) => {
  if (error instanceof multer.MulterError) {
    next(new HttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
      error.code === 'LIMIT_FILE_SIZE' ? 'Profile photos must be 4 MB or smaller.' : 'Upload one profile photo at a time.'));
    return;
  }
  next(error);
});

r.get('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  await assignMissingEmployeeIds();
  const { page, limit, skip } = paginate(req.query);
  const f = employeeFilter(req.query);
  const sort = req.query.sort === 'joined-asc'
    ? { role: 1, joinDate: 1, _id: 1 }
    : req.query.sort === 'joined-desc'
      ? { role: 1, joinDate: -1, _id: 1 }
      : { role: 1, employeeId: 1 };
  const [items, total] = await Promise.all([
    User.find(f).populate('statusHistory.changedBy', 'name').sort(sort).skip(skip).limit(limit),
    User.countDocuments(f),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

r.get('/summary', authorize('admin', 'hr'), asyncHandler(async (_req, res) => {
  const currentDate = today();
  const onLeaveIds = await Leave.distinct('user', {
    status: 'approved',
    from: { $lte: currentDate },
    to: { $gte: currentDate },
  });
  const [total, active, inactive, onLeave] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'inactive' }),
    User.countDocuments({ _id: { $in: onLeaveIds }, status: 'active' }),
  ]);
  res.json({ total, active, inactive, onLeave });
}));

// Lightweight list for dropdowns
r.get('/options', authorize('admin', 'hr'), asyncHandler(async (_req, res) =>
  res.json({ items: await User.find({ status: 'active' }).select('name employeeId department role').sort({ name: 1 }) })));

r.get('/export.csv', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  await assignMissingEmployeeIds();
  const sort = req.query.sort === 'joined-asc'
    ? { role: 1, joinDate: 1, _id: 1 }
    : req.query.sort === 'joined-desc'
      ? { role: 1, joinDate: -1, _id: 1 }
      : { role: 1, employeeId: 1 };
  const users = await User.find(employeeFilter(req.query)).sort(sort);
  const columns = ['employeeId', 'name', 'email', 'department', 'designation', 'phone', 'joinDate', 'status', 'terminationDate'];
  const rows = [columns, ...users.map((user) => columns.map((key) => user[key]))];
  res.type('text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  res.send(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
}));

r.post('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { name, email, role = 'employee', department, designation, phone, gender = '', joinDate, password } = req.body;
  if (!name || !email) throw new HttpError(400, 'Name and email are required.');
  if (!['hr', 'employee'].includes(role)) throw new HttpError(400, 'Role must be HR or employee.');
  if (!['', 'male', 'female', 'prefer_not_to_say'].includes(gender)) throw new HttpError(400, 'Choose a valid gender option.');
  if (role === 'hr' && req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can create HR accounts.');
  ensureEmailConfigured();
  const company = await Company.findOne();
  const temp = password || tempPassword();
  const user = await User.create({
    name, email, role, department, designation, phone, gender, joinDate: joinDate || undefined, password: temp,
    employeeId: await nextEmployeeId(), mustChangePassword: true, leaveBalance: company ? { annual: company.leaveQuota.annual, sick: company.leaveQuota.sick, casual: company.leaveQuota.casual } : undefined,
  });
  await sendWelcomeEmail(user);
  await audit(req, 'EMPLOYEE_CREATED', 'User', user._id, `${user.name} (${user.role})`);
  await notify(user._id, 'Welcome to HCM Lite', 'Your account is ready. Please change your password.', '/profile');
  res.status(201).json({ user, temporaryPassword: temp });
}));

r.put('/me/profile', asyncHandler(async (req, res) => {
  const { phone, name, gender } = req.body;
  if (gender !== undefined && !['', 'male', 'female', 'prefer_not_to_say'].includes(gender)) throw new HttpError(400, 'Choose a valid gender option.');
  if (phone !== undefined) req.user.phone = phone;
  if (name) req.user.name = name;
  if (gender !== undefined) req.user.gender = gender;
  await req.user.save();
  await audit(req, 'PROFILE_UPDATED', 'User', req.user._id);
  res.json({ user: req.user });
}));

r.post('/me/profile/photo', parsePhoto, asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a profile photo to upload.');
  if (!isValidImage(req.file)) throw new HttpError(400, 'The selected file is not a valid JPEG, PNG or WebP image.');
  if (!cloudinaryConfigured()) throw new HttpError(503, 'Profile photo uploads are unavailable. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on the server, then restart or redeploy.');

  const uploaded = await uploadProfilePhoto(req.file.buffer, req.user._id);
  req.user.avatarUrl = uploaded.url;
  req.user.avatarPublicId = uploaded.publicId;
  await req.user.save();
  await audit(req, 'PROFILE_PHOTO_UPDATED', 'User', req.user._id);
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
  if (b.gender !== undefined && !['', 'male', 'female', 'prefer_not_to_say'].includes(b.gender)) throw new HttpError(400, 'Choose a valid gender option.');
  for (const k of ['name', 'department', 'designation', 'phone', 'gender', 'joinDate']) if (b[k] !== undefined) user[k] = b[k];
  if (b.email) user.email = b.email;
  if (b.role && b.role !== user.role) {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Only an admin can change roles.');
    if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot change your own role.');
    if (user.role === 'admin') throw new HttpError(400, 'The owner role cannot be changed.');
    if (!['hr', 'employee'].includes(b.role)) throw new HttpError(400, 'Role must be HR or employee.');
    user.role = b.role;
  }
  if (b.leaveBalance && req.user.role) for (const k of ['annual', 'sick', 'casual']) if (b.leaveBalance[k] !== undefined) user.leaveBalance[k] = Number(b.leaveBalance[k]);
  await user.save();
  await audit(req, 'EMPLOYEE_UPDATED', 'User', user._id, user.name);
  res.json({ user });
}));

r.patch('/:id/status', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { status, reason = '' } = req.body;
  if (!['active', 'inactive', 'terminated'].includes(status)) throw new HttpError(400, 'Status must be active, inactive or terminated.');
  if (typeof reason !== 'string' || reason.length > 300) throw new HttpError(400, 'Status reason must be 300 characters or fewer.');
  if (status === 'terminated' && !reason.trim()) throw new HttpError(400, 'Add a reason when terminating an employee.');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Employee not found.');
  if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot deactivate your own account.');
  if (!canManage(req.user, user)) throw new HttpError(403, 'Only an admin can change HR or admin accounts.');
  if (user.status === status) throw new HttpError(409, `This employee is already ${status}.`);
  const previousStatus = user.status;
  user.status = status;
  user.terminationDate = status === 'terminated' ? today() : null;
  user.statusHistory.push({ from: previousStatus, to: status, date: today(), reason: reason.trim(), changedBy: req.user._id });
  await user.save();
  const action = status === 'terminated' ? 'EMPLOYEE_TERMINATED' : status === 'active' ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED';
  await audit(req, action, 'User', user._id, `${user.name}: ${previousStatus} → ${status}${reason ? ` (${reason.trim()})` : ''}`);
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
