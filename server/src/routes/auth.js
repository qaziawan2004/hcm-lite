import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { protect, signToken } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { audit } from '../services/log.js';
// import dotenv from dotenv;
// dotenv.config()
import cors from "cors";
// 
const r = Router();
r.use(cors());
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', message: { message: 'Too many attempts. Try again in a few minutes.' } });

// First-run setup: only works while there are no users.
r.get('/setup-status', asyncHandler(async (_req, res) => res.json({ needsSetup: (await User.countDocuments()) === 0 })));

r.post('/setup', asyncHandler(async (req, res) => {
  if (await User.countDocuments()) throw new HttpError(403, 'Setup is already complete.');
  const { companyName, name, email, password } = req.body;
  if (!companyName || !name || !email || !password) throw new HttpError(400, 'Company name, your name, email and password are required.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const company = await Company.create({ name: companyName });
  const user = await User.create({ name, email, password, role: 'admin', employeeId: 'EMP-0001', department: 'Management', designation: 'Administrator',
    leaveBalance: { annual: company.leaveQuota.annual, sick: company.leaveQuota.sick, casual: company.leaveQuota.casual } });
  req.user = user; await audit(req, 'COMPANY_SETUP', 'Company', company._id, `Created ${companyName}`);
  res.status(201).json({ token: signToken(user._id), user });
}));

r.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) throw new HttpError(401, 'Incorrect email or password.');
  if (user.status !== 'active') throw new HttpError(403, 'This account has been deactivated. Contact HR.');
  req.user = user; await audit(req, 'LOGIN', 'User', user._id);
  res.json({ token: signToken(user._id), user });
}));

r.get('/me', protect, (req, res) => res.json({ user: req.user }));

r.post('/change-password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) throw new HttpError(400, 'New password must be at least 8 characters.');
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword || ''))) throw new HttpError(400, 'Current password is incorrect.');
  user.password = newPassword; user.mustChangePassword = false; await user.save();
  await audit(req, 'PASSWORD_CHANGED', 'User', user._id);
  res.json({ message: 'Password updated.', user });
}));

export default r;
