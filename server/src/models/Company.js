import mongoose from 'mongoose';
const s = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  address: String,
  currency: { type: String, default: 'PKR' },
  workStart: { type: String, default: '09:00' },
  workEnd: { type: String, default: '18:00' },
  graceMinutes: { type: Number, default: 15 },
  departments: { type: [String], default: ['Engineering', 'Human Resources', 'Finance', 'Sales', 'Operations'] },
  designations: { type: [String], default: ['Manager', 'Senior Associate', 'Associate', 'Intern'] },
  leaveQuota: {
    annual: { type: Number, default: 14 },
    sick: { type: Number, default: 10 },
    casual: { type: Number, default: 8 },
  },
}, { timestamps: true });
export default mongoose.model('Company', s);
