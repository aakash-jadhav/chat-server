import mongoose from 'mongoose';

const THREE_HOURS_SECONDS = 3 * 60 * 60;

const requestLogSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'rejected'],
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

requestLogSchema.index({ senderId: 1, receiverId: 1, status: 1 });
requestLogSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: THREE_HOURS_SECONDS,
    partialFilterExpression: { status: 'rejected' },
  }
);

export default mongoose.model('RequestLog', requestLogSchema);
