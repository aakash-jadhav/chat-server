import mongoose from 'mongoose';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const messageSchema = new mongoose.Schema({
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
  messageText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 4096,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

messageSchema.index({ timestamp: 1 }, { expireAfterSeconds: THIRTY_DAYS_SECONDS });
messageSchema.index({ senderId: 1, receiverId: 1, timestamp: -1 });

export default mongoose.model('Message', messageSchema);
