import mongoose from 'mongoose';
const s = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  checkIn: Date,
  checkOut: Date,
  status: { type: String, enum: ['present', 'late'], default: 'present' },
  hours: { type: Number, default: 0 },
}, { timestamps: true });
s.index({ user: 1, date: 1 }, { unique: true });
export default mongoose.model('Attendance', s);
