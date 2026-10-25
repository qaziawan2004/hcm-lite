import mongoose from 'mongoose';
const item = new mongoose.Schema({ name: { type: String, required: true }, amount: { type: Number, required: true, min: 0 } }, { _id: false });
const s = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  basic: { type: Number, required: true, min: 0 },
  allowances: [item],
  deductions: [item],
  effectiveFrom: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
s.index({ user: 1, effectiveFrom: -1 });
export default mongoose.model('Salary', s);
