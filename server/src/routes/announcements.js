import { Router } from 'express';
import Announcement from '../models/Announcement.js';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { audit, notify } from '../services/log.js';

const r = Router();
r.use(protect);

r.get('/', asyncHandler(async (req, res) => {
  const f = req.user.role === 'employee' ? { audience: { $in: ['all', 'employee'] } } : {};
  res.json({ items: await Announcement.find(f).sort({ pinned: -1, createdAt: -1 }).limit(50).populate('createdBy', 'name') });
}));

r.post('/', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const { title, body, audience = 'all', pinned = false } = req.body;
  if (!title || !body) throw new HttpError(400, 'Title and message are required.');
  if (!['all', 'hr', 'employee'].includes(audience)) throw new HttpError(400, 'Invalid audience.');
  const a = await Announcement.create({ title, body, audience, pinned, createdBy: req.user._id });
  const roles = audience === 'all' ? ['admin', 'hr', 'employee'] : audience === 'hr' ? ['admin', 'hr'] : ['employee'];
  const users = await User.find({ role: { $in: roles }, status: 'active', _id: { $ne: req.user._id } }).select('_id');
  await notify(users.map((u) => u._id), `Announcement: ${title}`, body.slice(0, 120), '/announcements');
  await audit(req, 'ANNOUNCEMENT_CREATED', 'Announcement', a._id, title);
  res.status(201).json({ announcement: a });
}));

r.delete('/:id', authorize('admin', 'hr'), asyncHandler(async (req, res) => {
  const a = await Announcement.findByIdAndDelete(req.params.id);
  if (!a) throw new HttpError(404, 'Announcement not found.');
  await audit(req, 'ANNOUNCEMENT_DELETED', 'Announcement', a._id, a.title);
  res.json({ message: 'Deleted.' });
}));

export default r;
