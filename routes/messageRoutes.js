const express = require('express');
const router = express.Router();
const { getMessages, markAsSeen, sendMessage } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/messages?page=1&limit=50
router.get('/', protect, getMessages);

// POST /api/messages - send message (REST fallback)
router.post('/', protect, sendMessage);

// POST /api/messages/seen - mark messages as seen
router.post('/seen', protect, markAsSeen);

module.exports = router;
