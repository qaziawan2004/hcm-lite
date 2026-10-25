import { Router } from 'express';
import Company from '../models/Company.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { audit } from '../services/log.js';

const r = Router();
r.use(protect);
const clean = (a) => [...new Set((a || []).map((s) => String(s).trim()).filter(Boolean))];

r.get('/', asyncHandler(async (_req, res) => res.json({ company: await Company.findOne() })));

r.put('/', authorize('admin'), asyncHandler(async (req, res) => {
  const c = await Company.findOne();
  if (!c) throw new HttpError(404, 'Company not set up yet.');
  const b = req.body;
  for (const k of ['name', 'email', 'phone', 'address', 'currency', 'workStart', 'workEnd']) if (b[k] !== undefined) c[k] = b[k];
  if (b.graceMinutes !== undefined) c.graceMinutes = Math.max(0, Number(b.graceMinutes) || 0);
  if (b.departments) c.departments = clean(b.departments);
  if (b.designations) c.designations = clean(b.designations);
  if (b.leaveQuota) for (const k of ['annual', 'sick', 'casual']) if (b.leaveQuota[k] !== undefined) c.leaveQuota[k] = Math.max(0, Number(b.leaveQuota[k]) || 0);
  await c.save();
  await audit(req, 'COMPANY_UPDATED', 'Company', c._id);
  res.json({ company: c });
}));

export default r;
