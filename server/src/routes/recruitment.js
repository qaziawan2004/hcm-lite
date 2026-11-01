import { Router } from 'express';
import crypto from 'crypto';
import Candidate, { CANDIDATE_STAGES } from '../models/Candidate.js';
import JobOpening from '../models/JobOpening.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { protect, authorize } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { audit } from '../services/log.js';
import { ensureEmailConfigured, sendWelcomeEmail } from '../services/email.js';

const r = Router();
r.use(protect, authorize('admin', 'hr'));

r.get('/openings', asyncHandler(async (req, res) => {
  const filter = req.query.status === 'all' ? {} : { status: req.query.status === 'closed' ? 'closed' : 'open' };
  const openings = await JobOpening.find(filter).sort({ status: 1, createdAt: -1 }).lean();
  const counts = await Candidate.aggregate([
    { $group: { _id: '$opening', count: { $sum: 1 } } },
  ]);
  const countByOpening = new Map(counts.map(({ _id, count }) => [String(_id), count]));
  res.json({ items: openings.map((opening) => ({ ...opening, candidateCount: countByOpening.get(String(opening._id)) || 0 })) });
}));

r.post('/openings', asyncHandler(async (req, res) => {
  const { title, department = '', location = '', employmentType = 'full-time', description = '' } = req.body;
  if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, 'Job title is required.');
  if (!['full-time', 'part-time', 'contract', 'internship'].includes(employmentType)) throw new HttpError(400, 'Choose a valid employment type.');
  const opening = await JobOpening.create({ title, department, location, employmentType, description, createdBy: req.user._id });
  await audit(req, 'JOB_OPENING_CREATED', 'JobOpening', opening._id, opening.title);
  res.status(201).json({ opening });
}));

r.patch('/openings/:id/status', asyncHandler(async (req, res) => {
  if (!['open', 'closed'].includes(req.body.status)) throw new HttpError(400, 'Status must be open or closed.');
  const opening = await JobOpening.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
  if (!opening) throw new HttpError(404, 'Job opening not found.');
  await audit(req, 'JOB_OPENING_STATUS_UPDATED', 'JobOpening', opening._id, `${opening.title}: ${opening.status}`);
  res.json({ opening });
}));

r.get('/pipeline', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.opening) filter.opening = req.query.opening;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchingOpenings = await JobOpening.find({ title: rx }).distinct('_id');
    filter.$or = [{ name: rx }, { email: rx }, { source: rx }, { opening: { $in: matchingOpenings } }];
  }
  const [total, items, grouped] = await Promise.all([
    Candidate.countDocuments(filter),
    Candidate.find(filter).populate('opening', 'title department location').sort({ updatedAt: -1 }).limit(500).lean(),
    Candidate.aggregate([{ $match: filter }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(CANDIDATE_STAGES.map((stage) => [stage, 0]));
  grouped.forEach(({ _id, count }) => { counts[_id] = count; });
  res.json({ items, counts, total, truncated: total > items.length, stages: CANDIDATE_STAGES });
}));

r.post('/candidates', asyncHandler(async (req, res) => {
  const { name, email, phone = '', source = '', opening, notes = '' } = req.body;
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Candidate name is required.');
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new HttpError(400, 'Enter a valid candidate email.');
  if (!opening) throw new HttpError(400, 'Choose an open job position.');
  const job = await JobOpening.findOne({ _id: opening, status: 'open' });
  if (!job) throw new HttpError(400, 'Choose an open job position.');
  const candidate = await Candidate.create({ name, email, phone, source, opening, notes, createdBy: req.user._id });
  await audit(req, 'CANDIDATE_CREATED', 'Candidate', candidate._id, `${candidate.name} applied for ${job.title}`);
  res.status(201).json({ candidate });
}));

r.patch('/candidates/:id/stage', asyncHandler(async (req, res) => {
  if (!CANDIDATE_STAGES.includes(req.body.stage)) throw new HttpError(400, 'Choose a valid recruitment stage.');
  const candidate = await Candidate.findById(req.params.id);
  if (!candidate) throw new HttpError(404, 'Candidate not found.');
  const previous = candidate.stage;
  candidate.stage = req.body.stage;
  await candidate.save();
  await audit(req, 'CANDIDATE_STAGE_CHANGED', 'Candidate', candidate._id, `${candidate.name}: ${previous} → ${candidate.stage}`);
  res.json({ candidate });
}));

r.post('/candidates/:id/convert', asyncHandler(async (req, res) => {
  const candidate = await Candidate.findById(req.params.id).populate('opening');
  if (!candidate) throw new HttpError(404, 'Candidate not found.');
  if (candidate.convertedEmployee) throw new HttpError(409, 'This candidate has already been converted to an employee.');
  if (candidate.stage !== 'Hired') throw new HttpError(409, 'Move the candidate to Hired before converting them.');
  if (await User.exists({ email: candidate.email })) throw new HttpError(409, 'An account already exists for this email.');

  ensureEmailConfigured();
  const temporaryPassword = `${crypto.randomBytes(9).toString('base64url')}#9`;
  const company = await Company.findOne();
  const last = await User.findOne({ employeeId: /^EMP-\d+$/ }).sort({ employeeId: -1 }).select('employeeId');
  const nextId = `EMP-${String(last ? parseInt(last.employeeId.slice(4), 10) + 1 : 1).padStart(4, '0')}`;
  const employee = await User.create({
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    department: candidate.opening?.department || '',
    designation: candidate.opening?.title || '',
    role: 'employee',
    employeeId: nextId,
    joinDate: new Date().toISOString().slice(0, 10),
    password: temporaryPassword,
    mustChangePassword: true,
    leaveBalance: company ? {
      annual: company.leaveQuota.annual,
      sick: company.leaveQuota.sick,
      casual: company.leaveQuota.casual,
    } : undefined,
  });
  await sendWelcomeEmail(employee);
  candidate.convertedEmployee = employee._id;
  candidate.stage = 'Joined';
  await candidate.save();
  await audit(req, 'CANDIDATE_CONVERTED', 'Candidate', candidate._id, `${candidate.name} → ${employee.employeeId}`);
  res.status(201).json({ employee, temporaryPassword });
}));

export default r;
