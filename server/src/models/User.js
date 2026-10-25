import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['admin', 'hr', 'employee'], default: 'employee' },
  employeeId: { type: String, unique: true, sparse: true },
  department: { type: String, default: '' },
  designation: { type: String, default: '' },
  phone: { type: String, default: '' },
  joinDate: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  mustChangePassword: { type: Boolean, default: false },
  leaveBalance: {
    annual: { type: Number, default: 14 },
    sick: { type: Number, default: 10 },
    casual: { type: Number, default: 8 },
  },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.matchPassword = function (plain) { return bcrypt.compare(plain, this.password); };
userSchema.set('toJSON', { transform: (_d, r) => { delete r.password; delete r.__v; return r; } });

export default mongoose.model('User', userSchema);
