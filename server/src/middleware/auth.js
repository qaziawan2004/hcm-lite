import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/http.js';

export const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

export const protect = asyncHandler(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please sign in to continue.');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
  const user = await User.findById(payload.id);
  if (!user || user.status !== 'active') throw new HttpError(401, 'This account is not active.');
  req.user = user;
  next();
});

export const authorize = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do this.'));
