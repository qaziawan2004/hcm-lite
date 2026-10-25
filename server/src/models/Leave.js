import mongoose from 'mongoose';
const s = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['annual', 'sick', 'casual', 'unpaid'], required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  days: { type: Number, required: true },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNote: String,
  reviewedAt: Date,
}, { timestamps: true });
s.index({ user: 1, from: 1 });
export default mongoose.model('Leave', s);
