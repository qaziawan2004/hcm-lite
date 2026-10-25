import mongoose from 'mongoose';
const item = new mongoose.Schema({ name: String, amount: Number }, { _id: false });
const s = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: String, required: true },
  workingDays: Number, presentDays: Number, paidLeaveDays: Number, unpaidDays: Number,
  basic: Number, allowances: [item], deductions: [item],
  gross: Number, totalDeductions: Number, attendanceDeduction: Number, netPay: Number,
  status: { type: String, enum: ['generated', 'paid'], default: 'generated' },
  paidAt: Date,
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
s.index({ user: 1, month: 1 }, { unique: true });
export default mongoose.model('Payroll', s);
