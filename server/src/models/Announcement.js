import mongoose from 'mongoose';
const s = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  audience: { type: String, enum: ['all', 'hr', 'employee'], default: 'all' },
  pinned: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
export default mongoose.model('Announcement', s);
