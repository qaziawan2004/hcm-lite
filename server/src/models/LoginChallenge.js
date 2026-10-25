import mongoose from 'mongoose';

const loginChallengeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challengeHash: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true, select: false },
  codeExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
}, { timestamps: true });

export default mongoose.model('LoginChallenge', loginChallengeSchema);
