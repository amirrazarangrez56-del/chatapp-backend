const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    messageText: {
      type: String,
      required: [true, 'Message text is required'],
      trim: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    // Users who have received this message (socket delivery confirmation)
    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Users who have opened the chat and seen this message
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for faster queries
messageSchema.index({ groupId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
