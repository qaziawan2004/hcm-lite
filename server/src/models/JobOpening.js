import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  department: { type: String, default: '', trim: true, maxlength: 80 },
  location: { type: String, default: '', trim: true, maxlength: 120 },
  employmentType: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship'], default: 'full-time' },
  description: { type: String, default: '', trim: true, maxlength: 3000 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ status: 1, createdAt: -1 });

export default mongoose.model('JobOpening', schema);
