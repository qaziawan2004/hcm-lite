import mongoose from 'mongoose';
const s = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  role: String,
  action: { type: String, required: true },
  entity: String,
  entityId: String,
  details: String,
  ip: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
s.index({ createdAt: -1 });
export default mongoose.model('AuditLog', s);
