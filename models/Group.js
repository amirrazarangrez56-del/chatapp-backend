const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    joinRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    avatar: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Ensure there's only one group in the system
groupSchema.statics.getInstance = async function () {
  let group = await this.findOne();
  return group;
};

const Group = mongoose.model('Group', groupSchema);
module.exports = Group;
