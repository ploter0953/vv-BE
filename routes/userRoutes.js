const express = require('express');
const User = require('../models/User');
const mongoose = require('mongoose');
const { requireAuth } = require('@clerk/express');
const youtubeService = require('../services/youtubeService');

const router = express.Router();

// Get users - handles both search and getAll
router.get('/', async (req, res) => {
  try {
    const { username, getAll } = req.query;
    
    // If explicitly requesting all users (for backward compatibility)
    if (getAll === 'true') {
      const users = await User.find({}).sort({ username: 1 });
      return res.json({ users });
    }
    
    // Search users by username
    if (username && username.trim()) {
      const searchTerm = username.trim();
      
      // Search with priority: exact match first, then partial match
      const searchQuery = {
        $or: [
          // Exact match on username (highest priority)
          { username: { $regex: `^${searchTerm}$`, $options: 'i' } },
          // Partial match on username (second priority)
          { username: { $regex: searchTerm, $options: 'i' } },
          // Exact match on email (if username not found)
          { email: { $regex: `^${searchTerm}$`, $options: 'i' } },
          // Partial match on email (if username not found)
          { email: { $regex: searchTerm, $options: 'i' } }
        ]
      };
      
      const users = await User.find(searchQuery).sort({ username: 1 });
      return res.json({ users });
    }
    
    // If no query parameters, return empty array (not all users for security)
    return res.json({ users: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy user theo clerkId (PHẢI đặt trước route /:id)
router.get('/clerk/:clerkId', async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.params.clerkId });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy commissions của user (hỗ trợ cả ObjectId và ClerkId)
router.get('/:id/commissions', async (req, res) => {
  const { id } = req.params;
  let user;
  const mongoose = require('mongoose');
  if (id.startsWith('user_')) {
    user = await User.findOne({ clerkId: id });
  } else if (mongoose.Types.ObjectId.isValid(id)) {
    user = await User.findById(id);
  }
  if (!user) return res.status(404).json({ message: 'User not found' });
  const commissions = await require('../models/Commission').find({ user: user._id });
  res.json({ commissions });
});

// Lấy user theo id (hỗ trợ cả ObjectId và ClerkId)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  let user;
  const mongoose = require('mongoose');
  
  try {
    if (id.startsWith('user_')) {
      // Clerk ID
      user = await User.findOne({ clerkId: id });
    } else if (mongoose.Types.ObjectId.isValid(id)) {
      // MongoDB ObjectId
      user = await User.findById(id);
    } else {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Xóa user
router.delete('/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Clerk sync endpoint
router.post('/clerk-sync-test', async (req, res) => {
  try {
    const { clerkId, email, username, avatar } = req.body;
    if (!clerkId || !email) {
      return res.status(400).json({ error: 'clerkId và email là bắt buộc' });
    }
    
    let user = await User.findOne({ clerkId });
    if (user) {
      return res.json({
        user,
        message: 'User đã tồn tại, trả về profile.'
      });
    }
    
    // Create new user object
    const newUserObj = {
      clerkId,
      email,
      username: username || '',
      avatar: avatar || '',
      banner: '',
      role: 'user',
      badges: ['member'],
      bio: '',
      description: '',
      facebook: '',
      website: '',
      profile_email: '',
      vtuber_description: '',
      artist_description: '',
      twitch: '',
      youtube: '',
      tiktok: ''
    };
    
    user = await User.create(newUserObj);
    return res.status(201).json({
      user,
      message: 'Tạo user mới thành công.'
    });
  } catch (error) {
    console.error('Clerk sync error:', error);
    res.status(500).json({ error: 'Lỗi server khi đồng bộ user với Clerk.' });
  }
});

// Update user online status
router.post('/online', requireAuth(), async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    // Get user ID from Clerk auth or fallback
    const userId = req.auth?.userId || req.auth?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Try to find user by Clerk ID first, then by MongoDB ID
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndUpdate(user._id, {
      isOnline: true,
      lastSeen: new Date()
    });
    
    res.json({ message: 'Online status updated' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating online status' });
  }
});

// Update user offline status
router.post('/offline', requireAuth(), async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    // Get user ID from Clerk auth or fallback
    const userId = req.auth?.userId || req.auth?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Try to find user by Clerk ID first, then by MongoDB ID
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndUpdate(user._id, {
      isOnline: false,
      lastSeen: new Date()
    });
    
    res.json({ message: 'Offline status updated' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating offline status' });
  }
});


// Get user online status
router.get('/:id/status', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const user = await User.findById(req.params.id).select('isOnline lastSeen');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Calculate if user is considered online (within last 3 minutes for better responsiveness)
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const lastSeenDate = user.lastSeen ? new Date(user.lastSeen) : new Date(0);
    const isRecentlyActive = lastSeenDate > threeMinutesAgo;
    
    res.json({
      isOnline: Boolean(user.isOnline) && isRecentlyActive,
      lastSeen: user.lastSeen || null,
      isRecentlyActive: Boolean(isRecentlyActive)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error getting user status' });
  }
});

// ==================== STREAM SCHEDULE ENDPOINTS ====================

// Get user's stream schedule
router.get('/:id/stream-schedule', async (req, res) => {
  try {
    const { id } = req.params;
    let user;
    
    if (id.startsWith('user_')) {
      user = await User.findOne({ clerkId: id });
    } else if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id);
    } else {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ 
      streamSchedule: user.streamSchedule || [],
      success: true 
    });
  } catch (error) {
    console.error('Error getting stream schedule:', error);
    res.status(500).json({ message: 'Error getting stream schedule' });
  }
});

// Add/Update stream schedule
router.post('/:id/stream-schedule', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const { streamLink } = req.body;
    
    // Validate user authentication
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user;
    if (id.startsWith('user_')) {
      user = await User.findOne({ clerkId: id });
    } else if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id);
    } else {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // So sánh cả ObjectId và ClerkId
    if (user.clerkId !== userId && String(user._id) !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    // Validate YouTube URL
    if (!streamLink || !youtubeService.isValidYouTubeUrl(streamLink)) {
      return res.status(400).json({ message: 'Invalid YouTube URL' });
    }
    
    // Extract video ID and get stream info
    const videoId = youtubeService.extractVideoId(streamLink);
    if (!videoId) {
      return res.status(400).json({ message: 'Could not extract video ID from URL' });
    }
    
    // Get stream status and info
    const streamInfo = await youtubeService.checkStreamStatus(videoId);
    if (!streamInfo.isValid) {
      return res.status(400).json({ message: 'Invalid or private stream' });
    }
    
    // If no scheduled time, return error
    if (!streamInfo.scheduledStartTime) {
      return res.status(400).json({ message: 'Stream must have a scheduled start time' });
    }
    
    // Convert to Vietnam timezone (UTC+7)
    const scheduledTime = new Date(streamInfo.scheduledStartTime);
    const vietnamTime = new Date(scheduledTime.getTime() + (7 * 60 * 60 * 1000));

    // Kiểm tra nếu stream thuộc tuần sau
    const now = new Date();
    const nowVN = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    // Lấy thứ (0=CN, 1=Thứ 2,...) và số tuần trong năm
    const getWeek = (d) => {
      d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
      const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
      return weekNo;
    };
    const weekNow = getWeek(nowVN);
    const weekStream = getWeek(vietnamTime);
    if (weekStream > weekNow) {
      return res.status(400).json({ error: 'next_week', message: 'Buổi stream này có lịch vào tuần sau, bạn vui lòng đợi tuần sau để thêm lịch' });
    }
    
    // Get day of week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = vietnamTime.getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];
    
    // Get time slot (HH:mm format)
    const timeSlot = vietnamTime.toTimeString().slice(0, 5);
    
    // Check if slot already exists for this day
    const existingSlotIndex = user.streamSchedule.findIndex(slot => slot.dayOfWeek === dayName);
    
    const newSlot = {
      dayOfWeek: dayName,
      timeSlot: timeSlot,
      title: streamInfo.title || '',
      streamLink: streamLink,
      isActive: true,
      status: streamInfo.isLive ? 'live' : streamInfo.isWaitingRoom ? 'upcoming' : 'none',
      updatedAt: new Date()
    };
    
    if (existingSlotIndex >= 0) {
      // Update existing slot
      user.streamSchedule[existingSlotIndex] = {
        ...user.streamSchedule[existingSlotIndex],
        ...newSlot
      };
    } else {
      // Add new slot
      user.streamSchedule.push(newSlot);
    }
    
    await user.save();
    
    res.json({ 
      message: 'Stream schedule updated successfully',
      slot: newSlot,
      success: true 
    });
  } catch (error) {
    console.error('Error updating stream schedule:', error);
    res.status(500).json({ message: 'Error updating stream schedule' });
  }
});

// Delete stream schedule slot
router.delete('/:id/stream-schedule/:dayOfWeek', requireAuth(), async (req, res) => {
  try {
    const { id, dayOfWeek } = req.params;
    
    // Validate user authentication
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user;
    if (id.startsWith('user_')) {
      user = await User.findOne({ clerkId: id });
    } else if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id);
    } else {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // So sánh cả ObjectId và ClerkId
    if (user.clerkId !== userId && String(user._id) !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    // Remove slot for the specified day
    user.streamSchedule = user.streamSchedule.filter(slot => slot.dayOfWeek !== dayOfWeek);
    await user.save();
    
    res.json({ 
      message: 'Stream schedule slot deleted successfully',
      success: true 
    });
  } catch (error) {
    console.error('Error deleting stream schedule slot:', error);
    res.status(500).json({ message: 'Error deleting stream schedule slot' });
  }
});

// Update stream status (called by cron job)
router.put('/:id/stream-schedule/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { dayOfWeek, status } = req.body;
    
    let user;
    if (id.startsWith('user_')) {
      user = await User.findOne({ clerkId: id });
    } else if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id);
    } else {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const slotIndex = user.streamSchedule.findIndex(slot => slot.dayOfWeek === dayOfWeek);
    if (slotIndex >= 0) {
      user.streamSchedule[slotIndex].status = status;
      user.streamSchedule[slotIndex].updatedAt = new Date();
      await user.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating stream status:', error);
    res.status(500).json({ message: 'Error updating stream status' });
  }
});

module.exports = router; 