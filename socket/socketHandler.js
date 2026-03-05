const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Group = require('../models/Group');
const Message = require('../models/Message');

/**
 * SOCKET EVENTS:
 *
 * CLIENT → SERVER:
 *  - authenticate        : { token }  → verify JWT, join rooms
 *  - send-message        : { messageText } → save & broadcast
 *  - typing              : { isTyping } → broadcast typing indicator
 *  - mark-seen           : {} → mark all messages as seen
 *  - disconnect          : built-in
 *
 * SERVER → CLIENT:
 *  - authenticated       : { user, group } → confirm auth success
 *  - auth-error          : { message } → auth failure
 *  - new-message         : { message } → broadcast to group
 *  - message-delivered   : { messageId, userId } → update delivery status
 *  - messages-seen       : { seenBy, seenByName } → update seen status
 *  - user-typing         : { userId, userName, isTyping }
 *  - user-online         : { userId, isOnline }
 *  - new-join-request    : { user, requestedAt } → notify admin
 *  - join-request-approved : { groupId, groupName }
 *  - join-request-rejected : { message }
 *  - removed-from-group  : { message }
 *  - member-joined       : { user }
 */

const socketHandler = (io) => {
  // Middleware: verify JWT on connection
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`🔌 User connected: ${user.name} (${socket.id})`);

    try {
      // Update user online status
      await User.findByIdAndUpdate(user._id, { isOnline: true });

      // Join personal room (for direct notifications)
      socket.join(`user-${user._id}`);

      // Join admin room if admin
      if (user.isAdmin) {
        socket.join('admin-room');
        console.log(`👑 Admin ${user.name} joined admin-room`);
      }

      // Get group and join group room if member
      const group = await Group.findOne();
      if (group) {
        const isMember = group.members.some(
          (m) => m.toString() === user._id.toString()
        );

        if (isMember) {
          socket.join(`group-${group._id}`);
          console.log(`✅ ${user.name} joined group room`);

          // Mark pending messages as delivered for this user
          await Message.updateMany(
            {
              groupId: group._id,
              senderId: { $ne: user._id },
              deliveredTo: { $ne: user._id },
            },
            { $addToSet: { deliveredTo: user._id } }
          );

          // Notify others in group that user is online
          socket.to(`group-${group._id}`).emit('user-online', {
            userId: user._id,
            userName: user.name,
            isOnline: true,
          });
        }
      }

      // ─── EVENT: Send Message ──────────────────────────────
      socket.on('send-message', async ({ messageText }) => {
        try {
          if (!messageText?.trim()) return;

          const group = await Group.findOne();
          if (!group) return socket.emit('error', { message: 'Group not found' });

          const isMember = group.members.some(
            (m) => m.toString() === user._id.toString()
          );
          if (!isMember) {
            return socket.emit('error', { message: 'You are not a member' });
          }

          // Get all currently online members (who are in the group room)
          const socketsInRoom = await io.in(`group-${group._id}`).fetchSockets();
          const onlineMemberIds = socketsInRoom.map((s) => s.user._id);

          // Create message — mark as delivered to all currently online members
          const message = await Message.create({
            senderId: user._id,
            groupId: group._id,
            messageText: messageText.trim(),
            deliveredTo: onlineMemberIds, // all online users get delivery tick immediately
            seenBy: [user._id], // sender has "seen" their own message
          });

          const populated = await Message.findById(message._id).populate(
            'senderId',
            'name email'
          );

          // Broadcast to ALL members in group room (including sender for consistency)
          io.to(`group-${group._id}`).emit('new-message', populated);

          console.log(`💬 Message from ${user.name}: ${messageText.substring(0, 50)}`);
        } catch (err) {
          console.error('send-message error:', err);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // ─── EVENT: Typing Indicator ──────────────────────────
      socket.on('typing', ({ isTyping }) => {
        const group_room = socket.rooms;
        // Broadcast to group room (excluding sender)
        Group.findOne().then((group) => {
          if (group) {
            socket.to(`group-${group._id}`).emit('user-typing', {
              userId: user._id,
              userName: user.name,
              isTyping: !!isTyping,
            });
          }
        });
      });

      // ─── EVENT: Mark Messages as Seen ─────────────────────
      socket.on('mark-seen', async () => {
        try {
          const group = await Group.findOne();
          if (!group) return;

          const isMember = group.members.some(
            (m) => m.toString() === user._id.toString()
          );
          if (!isMember) return;

          // Update all unseen messages in group
          await Message.updateMany(
            {
              groupId: group._id,
              senderId: { $ne: user._id },
              seenBy: { $ne: user._id },
            },
            {
              $addToSet: {
                seenBy: user._id,
                deliveredTo: user._id,
              },
            }
          );

          // Notify group members that this user has seen messages
          io.to(`group-${group._id}`).emit('messages-seen', {
            seenBy: user._id,
            seenByName: user.name,
          });
        } catch (err) {
          console.error('mark-seen error:', err);
        }
      });

      // ─── EVENT: Disconnect ────────────────────────────────
      socket.on('disconnect', async () => {
        console.log(`🔴 User disconnected: ${user.name}`);

        await User.findByIdAndUpdate(user._id, {
          isOnline: false,
          lastSeen: new Date(),
        });

        const group = await Group.findOne();
        if (group) {
          socket.to(`group-${group._id}`).emit('user-online', {
            userId: user._id,
            userName: user.name,
            isOnline: false,
            lastSeen: new Date(),
          });
        }
      });
    } catch (err) {
      console.error('Socket connection error:', err);
    }
  });
};

module.exports = socketHandler;
