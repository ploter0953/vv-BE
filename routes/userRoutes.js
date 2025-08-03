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
    console.log('[GET USER BY CLERK ID] Requesting user with clerkId:', req.params.clerkId);
    const user = await User.findOne({ clerkId: req.params.clerkId });
    
    if (!user) {
      console.log('[GET USER BY CLERK ID] User not found');
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log('[GET USER BY CLERK ID] User found:', {
      _id: user._id,
      clerkId: user.clerkId,
      username: user.username,
      avatar: user.avatar ? 'Has avatar' : 'No avatar'
    });
    
    res.json({ user });
  } catch (err) {
    console.error('[GET USER BY CLERK ID] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Sync Clerk user with backend
router.post('/sync-clerk', async (req, res) => {
  try {
    const { clerkId, email, username, avatar } = req.body;
    
    if (!clerkId) {
      return res.status(400).json({ message: 'Clerk ID is required' });
    }
    
    // Try to find existing user by clerkId
    let user = await User.findOne({ clerkId });
    
    if (user) {
      // Update existing user with Clerk data
      const updateData = {
        email: email || user.email,
        username: username || user.username
      };
      
      // Only update avatar if user doesn't have a custom avatar
      const hasCustomAvatar = user.avatar && !user.avatar.includes('clerk.com');
      const isClerkDefaultAvatar = user.avatar && user.avatar.includes('clerk.com');
      
      if (avatar && (!hasCustomAvatar || isClerkDefaultAvatar)) {
        updateData.avatar = avatar;
      }
      
      // Update user
      Object.assign(user, updateData);
      await user.save();
    } else {
      // Create new user
      const userData = {
        clerkId,
        email,
        username,
        badges: ['member']
      };
      
      // Set avatar only if provided
      if (avatar) {
        userData.avatar = avatar;
      }
      
      user = new User(userData);
      await user.save();
    }
    
    res.json({ user });
  } catch (err) {
    console.error('Error syncing Clerk user:', err);
    res.status(500).json({ message: err.message });
  }
});

// Lấy user theo username (PHẢI đặt trước route /:id)
router.get('/username/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
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
    console.log('[USER PROFILE] Query:', { id, time: new Date().toISOString() });
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
    console.error('[USER PROFILE] Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update user profile
router.put('/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    

    
    // Validate user authentication
    const userId = req.auth?.userId || req.auth?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    // Find user by ID or Clerk ID
    let user;
    console.log('Looking for user with ID:', id);
    if (id.startsWith('user_')) {
      user = await User.findOne({ clerkId: id });
      console.log('Found user by clerkId:', user ? user._id : 'Not found');
    } else if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id);
      console.log('Found user by ObjectId:', user ? user._id : 'Not found');
    } else {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    
    if (!user) {
      console.log('User not found for ID:', id);
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user is updating their own profile
    if (user.clerkId !== userId && String(user._id) !== userId) {
      return res.status(403).json({ message: 'Unauthorized to update this profile' });
    }
    
    // Define allowed fields that can be updated
    const allowedFields = [
      'username', 'bio', 'avatar', 'banner', 'description', 'socialLinks', 
      'commissionRates', 'portfolio', 'badges', 'facebook', 'website', 
      'profile_email', 'vtuber_description', 'artist_description', 
      'twitch', 'youtube', 'tiktok', 'discord', 'discord_id'
    ];
    
    // Filter out non-allowed fields
    const filteredData = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredData[key] = updateData[key];
      }
    });
    
    console.log('=== UPDATING USER PROFILE ===');
    console.log('User ID:', user._id);
    console.log('Original avatar:', user.avatar);
    console.log('Original banner:', user.banner);
    console.log('Update data:', updateData);
    console.log('Filtered data:', filteredData);
    console.log('Avatar change:', user.avatar !== filteredData.avatar ? 'YES' : 'NO');
    console.log('Banner change:', user.banner !== filteredData.banner ? 'YES' : 'NO');
    console.log('New avatar is Clerk default:', filteredData.avatar?.includes('clerk.com') ? 'YES' : 'NO');
    console.log('New banner is empty:', filteredData.banner === '' ? 'YES' : 'NO');
    
    // Check if avatar is being updated and delete old avatar from Cloudinary
    // Handle both cases: new avatar upload and avatar deletion (set to Clerk default)
    if (user.avatar && user.avatar.includes('cloudinary.com') && 
        filteredData.avatar !== user.avatar && 
        !filteredData.avatar.includes('clerk.com')) {
      try {
        console.log('[UPDATE PROFILE] Deleting old avatar:', user.avatar);
        const cloudinary = require('cloudinary').v2;
        
        // Extract public ID from old avatar URL
        const extractPublicIdFromCloudinaryUrl = (url) => {
          if (!url || !url.includes('cloudinary.com')) return null;
          try {
            const urlParts = url.split('/');
            const uploadIndex = urlParts.findIndex(part => part === 'upload');
            if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
              const publicIdParts = urlParts.slice(uploadIndex + 2);
              return publicIdParts.join('/').split('.')[0];
            }
          } catch (error) {
            console.error('[UPDATE PROFILE] Error extracting public ID:', error);
          }
          return null;
        };
        
        const publicId = extractPublicIdFromCloudinaryUrl(user.avatar);
        if (publicId) {
          const result = await cloudinary.uploader.destroy(publicId);
          console.log('[UPDATE PROFILE] Old avatar deletion result:', result);
        }
      } catch (error) {
        console.error('[UPDATE PROFILE] Error deleting old avatar:', error);
        // Continue with update even if delete fails
      }
    }
    
    // Check if banner is being updated and delete old banner from Cloudinary
    // Handle both cases: new banner upload and banner deletion (empty string)
    if (user.banner && user.banner.includes('cloudinary.com') && 
        filteredData.banner !== user.banner && 
        filteredData.banner === '') {
      try {
        console.log('[UPDATE PROFILE] Deleting old banner:', user.banner);
        const cloudinary = require('cloudinary').v2;
        
        // Extract public ID from old banner URL
        const extractPublicIdFromCloudinaryUrl = (url) => {
          if (!url || !url.includes('cloudinary.com')) return null;
          try {
            const urlParts = url.split('/');
            const uploadIndex = urlParts.findIndex(part => part === 'upload');
            if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
              const publicIdParts = urlParts.slice(uploadIndex + 2);
              return publicIdParts.join('/').split('.')[0];
            }
          } catch (error) {
            console.error('[UPDATE PROFILE] Error extracting public ID:', error);
          }
          return null;
        };
        
        const publicId = extractPublicIdFromCloudinaryUrl(user.banner);
        if (publicId) {
          const result = await cloudinary.uploader.destroy(publicId);
          console.log('[UPDATE PROFILE] Old banner deletion result:', result);
        }
      } catch (error) {
        console.error('[UPDATE PROFILE] Error deleting old banner:', error);
        // Continue with update even if delete fails
      }
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { ...filteredData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    console.log('Updated user avatar:', updatedUser.avatar);
    console.log('Updated user banner:', updatedUser.banner);
    
    res.json({ 
      message: 'Profile updated successfully',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Error updating profile' });
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
    const userId = req.auth?.userId || req.auth?.user?.id;
    console.log('[STREAM SCHEDULE] Add/Update request:', { id, userId, streamLink, time: new Date().toISOString() });
    
    // Validate user authentication
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
    
    // Kiểm tra badge vtuber
    if (!user.badges || !user.badges.includes('vtuber')) {
      return res.status(403).json({ message: 'Chỉ user có badge vtuber mới có thể thêm lịch stream' });
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

    // Kiểm tra nếu stream vượt quá tuần hiện tại
    const now = new Date();
    const nowVN = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    
    // Tính tuần hiện tại (bắt đầu từ thứ 2)
    const getCurrentWeekStart = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Thứ 2 là ngày đầu tuần
      return new Date(d.setDate(diff));
    };
    
    const getCurrentWeekEnd = (date) => {
      const weekStart = getCurrentWeekStart(date);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // Thêm 6 ngày để có chủ nhật
      weekEnd.setHours(23, 59, 59, 999); // Cuối ngày chủ nhật
      return weekEnd;
    };
    
    const currentWeekStart = getCurrentWeekStart(nowVN);
    const currentWeekEnd = getCurrentWeekEnd(nowVN);
    
    // Kiểm tra nếu stream không thuộc tuần hiện tại
    if (vietnamTime < currentWeekStart || vietnamTime > currentWeekEnd) {
      return res.status(400).json({ 
        error: 'out_of_week', 
        message: 'Thời gian stream bạn vừa nhập vượt quá tuần hiện tại' 
      });
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
      isActive: true
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

// Stream status update endpoint removed - no longer needed

module.exports = router; 