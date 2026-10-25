import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import User from '../models/User.js';
import Company from '../models/Company.js';
import LoginChallenge from '../models/LoginChallenge.js';
import { protect, signToken } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { audit } from '../services/log.js';
import { ensureEmailConfigured, sendEmail, sendWelcomeEmail } from '../services/email.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', message: { message: 'Too many attempts. Try again in a few minutes.' } });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', message: { message: 'Too many verification attempts. Try again later.' } });
const otpLifetimeMs = 60 * 1000;
const challengeLifetimeMs = 10 * 60 * 1000;
const maxOtpAttempts = 5;
const resendCooldownMs = 30 * 1000;
const hashChallenge = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashCode = (challengeId, code) => crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(`${challengeId}:${code}`)
  .digest('hex');
const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

async function issueCode(challenge, challengeId, user) {
  const code = newCode();
  const now = new Date();
  const codeHash = hashCode(challengeId, code);
  const update = await LoginChallenge.updateOne(
    { _id: challenge._id, codeHash: challenge.codeHash, attempts: { $lt: maxOtpAttempts } },
    {
      $set: {
        codeHash,
        codeExpiresAt: new Date(now.getTime() + otpLifetimeMs),
        lastSentAt: now,
      },
    }
  );
  if (!update.modifiedCount) throw new HttpError(409, 'This sign-in code was already replaced. Check your email for the latest code.');
  challenge.codeHash = codeHash;
  challenge.codeExpiresAt = new Date(now.getTime() + otpLifetimeMs);
  challenge.lastSentAt = now;
  await sendEmail({
    to: user.email,
    subject: 'Your HCM Lite sign-in code',
    text: `Your HCM Lite verification code is ${code}. It expires in one minute. If you did not request it, you can ignore this email.`,
    html: `<p>Your HCM Lite verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in one minute. If you did not request it, you can ignore this email.</p>`,
  });
}

async function createChallenge(user) {
  const challengeId = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const challenge = await LoginChallenge.create({
    user: user._id,
    challengeHash: hashChallenge(challengeId),
    codeHash: hashCode(challengeId, newCode()),
    codeExpiresAt: new Date(now.getTime() + otpLifetimeMs),
    expiresAt: new Date(now.getTime() + challengeLifetimeMs),
    lastSentAt: now,
  });
  await issueCode(challenge, challengeId, user);
  return { challengeId, email: user.email };
}

// First-run setup: only works while there are no users.
r.get('/setup-status', asyncHandler(async (_req, res) => res.json({ needsSetup: (await User.countDocuments()) === 0 })));

r.post('/setup', asyncHandler(async (req, res) => {
  if (await User.countDocuments()) throw new HttpError(403, 'Setup is already complete.');
  const { companyName, name, email, password } = req.body;
  if (!companyName || !name || !email || !password) throw new HttpError(400, 'Company name, your name, email and password are required.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  ensureEmailConfigured();
  const company = await Company.create({ name: companyName });
  const user = await User.create({ name, email, password, role: 'admin', employeeId: 'EMP-0001', department: 'Management', designation: 'Administrator',
    leaveBalance: { annual: company.leaveQuota.annual, sick: company.leaveQuota.sick, casual: company.leaveQuota.casual } });
  req.user = user; await audit(req, 'COMPANY_SETUP', 'Company', company._id, `Created ${companyName}`);
  await sendWelcomeEmail(user);
  const challenge = await createChallenge(user);
  res.status(201).json({ message: 'Verification code sent.', ...challenge });
}));

r.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) throw new HttpError(401, 'Incorrect email or password.');
  if (user.status !== 'active') throw new HttpError(403, 'This account has been deactivated. Contact HR.');
  const challenge = await createChallenge(user);
  res.json({ message: 'Verification code sent.', ...challenge });
}));

r.post('/otp/verify', otpLimiter, asyncHandler(async (req, res) => {
  const { challengeId, code } = req.body;
  if (typeof challengeId !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new HttpError(400, 'Enter the six-digit code from your email.');
  }
  const challenge = await LoginChallenge.findOne({
    challengeHash: hashChallenge(challengeId),
    expiresAt: { $gt: new Date() },
  }).select('+codeHash');
  if (!challenge) throw new HttpError(410, 'This sign-in request has expired. Please sign in again.');
  if (challenge.codeExpiresAt <= new Date()) {
    throw new HttpError(410, 'This code has expired. Request a new code to continue.');
  }
  if (challenge.attempts >= maxOtpAttempts) {
    await challenge.deleteOne();
    throw new HttpError(429, 'Too many incorrect codes. Please sign in again.');
  }

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(hashCode(challengeId, code), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    const updatedChallenge = await LoginChallenge.findOneAndUpdate(
      { _id: challenge._id, codeHash: challenge.codeHash, attempts: { $lt: maxOtpAttempts } },
      { $inc: { attempts: 1 } },
      { new: true }
    ).select('+codeHash');
    if (!updatedChallenge) throw new HttpError(409, 'This code was already used or replaced. Check your email for the latest code.');
    const user = await User.findById(challenge.user);
    if (!user || user.status !== 'active') {
      await updatedChallenge.deleteOne();
      throw new HttpError(401, 'This account is not active.');
    }
    if (updatedChallenge.attempts >= maxOtpAttempts) {
      await updatedChallenge.deleteOne();
      throw new HttpError(429, 'Too many incorrect codes. Please sign in again.');
    }
    await issueCode(updatedChallenge, challengeId, user);
    throw new HttpError(401, 'Incorrect code. A new verification code has been sent to your email.');
  }

  const consumed = await LoginChallenge.deleteOne({ _id: challenge._id, codeHash: challenge.codeHash });
  if (!consumed.deletedCount) throw new HttpError(401, 'This code has already been used. Please sign in again.');

  const user = await User.findById(challenge.user);
  if (!user || user.status !== 'active') throw new HttpError(401, 'This account is not active.');
  req.user = user;
  await audit(req, 'LOGIN', 'User', user._id);
  res.json({ token: signToken(user._id), user });
}));

r.post('/otp/resend', otpLimiter, asyncHandler(async (req, res) => {
  const { challengeId } = req.body;
  if (typeof challengeId !== 'string' || challengeId.length > 100) {
    throw new HttpError(400, 'Sign-in request is invalid. Please sign in again.');
  }
  const challenge = await LoginChallenge.findOne({
    challengeHash: hashChallenge(challengeId),
    expiresAt: { $gt: new Date() },
  }).select('+codeHash');
  if (!challenge) throw new HttpError(410, 'This sign-in request has expired. Please sign in again.');
  if (Date.now() - challenge.lastSentAt.getTime() < resendCooldownMs) {
    throw new HttpError(429, 'Please wait before requesting another code.');
  }
  if (challenge.attempts >= maxOtpAttempts) {
    await challenge.deleteOne();
    throw new HttpError(429, 'Too many incorrect codes. Please sign in again.');
  }
  const user = await User.findById(challenge.user);
  if (!user || user.status !== 'active') {
    await challenge.deleteOne();
    throw new HttpError(401, 'This account is not active.');
  }
  await issueCode(challenge, challengeId, user);
  res.json({ message: 'A new verification code has been sent.' });
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
