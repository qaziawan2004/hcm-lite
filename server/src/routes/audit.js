import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler, paginate } from '../utils/http.js';

const r = Router();
r.use(protect, authorize('admin'));

r.get('/', asyncHandler(async (req, res) => {
  const { action, q } = req.query;
  const { page, limit, skip } = paginate({ ...req.query, limit: req.query.limit || 20 });
  const f = {};
  if (action) f.action = action;
  if (q) { const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ actorName: rx }, { details: rx }, { action: rx }]; }
  const [items, total, actions] = await Promise.all([
    AuditLog.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), AuditLog.countDocuments(f), AuditLog.distinct('action')]);
  res.json({ items, total, page, pages: Math.ceil(total / limit), actions: actions.sort() });
}));

export default r;
