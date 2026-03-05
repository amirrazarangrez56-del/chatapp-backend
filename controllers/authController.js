const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Group = require('../models/Group');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Check if this is the admin user (first user or admin email)
    const isAdmin = email === process.env.ADMIN_EMAIL;
    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      isAdmin: isAdmin || isFirstUser,
    });

    // If admin, add them to the group automatically
    const group = await Group.getInstance();
    if (group && (isAdmin || isFirstUser)) {
      if (!group.members.includes(user._id)) {
        group.members.push(user._id);
        // Make sure admin field is set
        if (isAdmin || isFirstUser) group.admin = user._id;
        await group.save();
      }
    }

    // If this is the very first user, create the group
    if (isFirstUser) {
      const existingGroup = await Group.getInstance();
      if (!existingGroup) {
        await Group.create({
          name: 'General Chat',
          description: 'Welcome to the group! Connect and chat with everyone.',
          admin: user._id,
          members: [user._id],
        });
      }
    }

    const token = generateToken(user._id);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update online status
    user.isOnline = true;
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false,
      lastSeen: new Date(),
    });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { register, login, getMe, logout };
