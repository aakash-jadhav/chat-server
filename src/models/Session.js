import mongoose from 'mongoose';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const sessionSchema = new mongoose.Schema(
  {
    sixDigitCode: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{6}$/,
    },
    name: {
      type: String,
      default: 'Anonymous User',
      trim: true,
      maxlength: 64,
    },
    socketId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

sessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: THIRTY_DAYS_SECONDS });

export default mongoose.model('Session', sessionSchema);
