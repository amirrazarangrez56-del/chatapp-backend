const Message = require('../models/Message');
const Group = require('../models/Group');

// @desc    Get messages for the group (paginated)
// @route   GET /api/messages?page=1&limit=50
// @access  Private (members only)
const getMessages = async (req, res) => {
  try {
    const group = await Group.findOne();

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Verify user is a member
    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({ groupId: group._id, isDeleted: false })
      .populate('senderId', 'name email')
      .sort({ createdAt: -1 }) // newest first
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ groupId: group._id, isDeleted: false });

    // Mark all unread messages as delivered for this user
    await Message.updateMany(
      {
        groupId: group._id,
        senderId: { $ne: req.user._id },
        deliveredTo: { $ne: req.user._id },
      },
      { $addToSet: { deliveredTo: req.user._id } }
    );

    res.json({
      messages: messages.reverse(), // oldest first for display
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Mark messages as seen
// @route   POST /api/messages/seen
// @access  Private
const markAsSeen = async (req, res) => {
  try {
    const group = await Group.findOne();
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const userId = req.user._id;

    // Mark all messages in group as seen by this user (that aren't from them)
    const result = await Message.updateMany(
      {
        groupId: group._id,
        senderId: { $ne: userId },
        seenBy: { $ne: userId },
      },
      {
        $addToSet: {
          seenBy: userId,
          deliveredTo: userId, // also mark as delivered
        },
      }
    );

    // Emit to senders that their messages were seen
    const io = req.app.get('io');
    io.to(`group-${group._id}`).emit('messages-seen', {
      seenBy: userId,
      seenByName: req.user.name,
    });

    res.json({ message: 'Messages marked as seen', updated: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Send a message (REST fallback - main is via socket)
// @route   POST /api/messages
// @access  Private (members only)
const sendMessage = async (req, res) => {
  try {
    const { messageText } = req.body;
    const group = await Group.findOne();

    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const message = await Message.create({
      senderId: req.user._id,
      groupId: group._id,
      messageText,
      deliveredTo: [req.user._id],
      seenBy: [req.user._id],
    });

    const populated = await Message.findById(message._id).populate(
      'senderId',
      'name email'
    );

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getMessages, markAsSeen, sendMessage };
