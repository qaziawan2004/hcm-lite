import mongoose from 'mongoose';

export const CANDIDATE_STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Joined', 'Rejected', 'Dropped'];

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  source: { type: String, default: '', trim: true, maxlength: 100 },
  opening: { type: mongoose.Schema.Types.ObjectId, ref: 'JobOpening', required: true },
  stage: { type: String, enum: CANDIDATE_STAGES, default: 'Applied' },
  notes: { type: String, default: '', trim: true, maxlength: 3000 },
  convertedEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ stage: 1, updatedAt: -1 });
schema.index({ email: 1 });

export default mongoose.model('Candidate', schema);
