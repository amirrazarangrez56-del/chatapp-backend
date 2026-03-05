const express = require('express');
const router = express.Router();
const {
  getGroup,
  requestJoin,
  approveJoinRequest,
  rejectJoinRequest,
  removeMember,
  getMembershipStatus,
} = require('../controllers/groupController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// GET /api/group  - get group info
router.get('/', protect, getGroup);

// GET /api/group/status - check user's membership status
router.get('/status', protect, getMembershipStatus);

// POST /api/group/request-join - request to join
router.post('/request-join', protect, requestJoin);

// POST /api/group/approve/:userId - approve join request (admin)
router.post('/approve/:userId', protect, adminOnly, approveJoinRequest);

// DELETE /api/group/reject/:userId - reject join request (admin)
router.delete('/reject/:userId', protect, adminOnly, rejectJoinRequest);

// DELETE /api/group/remove/:userId - remove member (admin)
router.delete('/remove/:userId', protect, adminOnly, removeMember);

module.exports = router;
