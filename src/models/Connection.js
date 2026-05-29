import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema({
  userA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  userB: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  establishedAt: {
    type: Date,
    default: Date.now,
  },
});

connectionSchema.index({ userA: 1, userB: 1 }, { unique: true });

export default mongoose.model('Connection', connectionSchema);
