const Group = require('../models/Group');
const User = require('../models/User');

// @desc    Get the single group details
// @route   GET /api/group
// @access  Private
const getGroup = async (req, res) => {
  try {
    const group = await Group.findOne()
      .populate('admin', 'name email')
      .populate('members', 'name email isOnline lastSeen')
      .populate('joinRequests.user', 'name email');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Request to join the group
// @route   POST /api/group/request-join
// @access  Private
const requestJoin = async (req, res) => {
  try {
    const group = await Group.findOne();

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const userId = req.user._id;

    // Check if already a member
    if (group.members.includes(userId)) {
      return res.status(400).json({ message: 'You are already a member of this group' });
    }

    // Check if already requested
    const alreadyRequested = group.joinRequests.some(
      (jr) => jr.user.toString() === userId.toString()
    );
    if (alreadyRequested) {
      return res.status(400).json({ message: 'You have already sent a join request' });
    }

    // Add join request
    group.joinRequests.push({ user: userId, requestedAt: new Date() });
    await group.save();

    // Return populated group for admin notification
    const updatedGroup = await Group.findOne()
      .populate('joinRequests.user', 'name email');

    // Emit socket event to admin (handled in socket handler)
    req.app.get('io').to('admin-room').emit('new-join-request', {
      user: { _id: req.user._id, name: req.user.name, email: req.user.email },
      requestedAt: new Date(),
    });

    res.json({ message: 'Join request sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Approve a join request (admin only)
// @route   POST /api/group/approve/:userId
// @access  Private + Admin
const approveJoinRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const group = await Group.findOne();

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check if the request exists
    const requestIndex = group.joinRequests.findIndex(
      (jr) => jr.user.toString() === userId
    );

    if (requestIndex === -1) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    // Remove from joinRequests and add to members
    group.joinRequests.splice(requestIndex, 1);
    if (!group.members.includes(userId)) {
      group.members.push(userId);
    }
    await group.save();

    // Notify the approved user via socket
    const io = req.app.get('io');
    io.to(`user-${userId}`).emit('join-request-approved', {
      groupId: group._id,
      groupName: group.name,
    });

    // Notify all members about new member
    const newUser = await User.findById(userId).select('name email');
    io.to(`group-${group._id}`).emit('member-joined', { user: newUser });

    res.json({ message: `${newUser?.name || 'User'} approved and added to group` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Reject a join request (admin only)
// @route   DELETE /api/group/reject/:userId
// @access  Private + Admin
const rejectJoinRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const group = await Group.findOne();

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const requestIndex = group.joinRequests.findIndex(
      (jr) => jr.user.toString() === userId
    );

    if (requestIndex === -1) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    group.joinRequests.splice(requestIndex, 1);
    await group.save();

    // Notify the rejected user
    const io = req.app.get('io');
    io.to(`user-${userId}`).emit('join-request-rejected', {
      message: 'Your join request was rejected by the admin.',
    });

    res.json({ message: 'Join request rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Remove a member from the group (admin only)
// @route   DELETE /api/group/remove/:userId
// @access  Private + Admin
const removeMember = async (req, res) => {
  try {
    const { userId } = req.params;
    const group = await Group.findOne();

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Cannot remove admin
    if (group.admin.toString() === userId) {
      return res.status(400).json({ message: 'Cannot remove the admin from the group' });
    }

    group.members = group.members.filter((m) => m.toString() !== userId);
    await group.save();

    // Notify removed user
    const io = req.app.get('io');
    io.to(`user-${userId}`).emit('removed-from-group', {
      message: 'You have been removed from the group by the admin.',
    });

    res.json({ message: 'Member removed from group' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Check user's membership status
// @route   GET /api/group/status
// @access  Private
const getMembershipStatus = async (req, res) => {
  try {
    const group = await Group.findOne();

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const userId = req.user._id.toString();
    const isMember = group.members.some((m) => m.toString() === userId);
    const hasPendingRequest = group.joinRequests.some(
      (jr) => jr.user.toString() === userId
    );

    res.json({
      isMember,
      hasPendingRequest,
      groupName: group.name,
      groupDescription: group.description,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getGroup,
  requestJoin,
  approveJoinRequest,
  rejectJoinRequest,
  removeMember,
  getMembershipStatus,
};
