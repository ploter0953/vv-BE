const express = require('express');
const Collab = require('../models/Collab');
const User = require('../models/User');
const { requireAuth } = require('@clerk/express');
const youtubeService = require('../services/youtubeService');
const mongoose = require('mongoose');
const { createCollabLimiter, matchCollabLimiter, youtubeApiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Helper function to update stream_info_1 for existing collabs
async function updateStreamInfoForCollab(collabId) {
  try {
    const collab = await Collab.findById(collabId);
    if (!collab || !collab.youtube_link_1) return false;
    
    const videoId = youtubeService.extractVideoId(collab.youtube_link_1);
    if (!videoId) return false;
    
    const streamStatus = await youtubeService.checkStreamStatus(videoId, 5 * 60 * 1000);
    if (!streamStatus.isValid) return false;
    
    await Collab.findByIdAndUpdate(collabId, {
      stream_info_1: {
        isLive: streamStatus.isLive,
        viewCount: streamStatus.viewCount || 0,
        title: streamStatus.title || '',
        thumbnail: streamStatus.thumbnail || '',
        scheduledStartTime: streamStatus.scheduledStartTime || null
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error updating stream_info_1 for collab:', error);
    return false;
  }
}

// Helper function to get current partner count
function getCurrentPartnerCount(collab) {
  let count = 0;
  // Count all partners (partner_1, partner_2, partner_3)
  if (collab.partner_1) count++;
  if (collab.partner_2) count++;
  if (collab.partner_3) count++;
  return count;
}

// Helper function to get next available partner slot
function getNextPartnerSlot(collab) {
  const currentPartners = getCurrentPartnerCount(collab);
  
  if (currentPartners >= collab.maxPartners) {
    return null; // No slots available
  }
  
  if (!collab.partner_1) return 1;
  if (!collab.partner_2) return 2;
  if (!collab.partner_3) return 3;
  return null; // No slots available
}

// Helper function to calculate check interval based on time remaining
function getCheckInterval(scheduledStartTime) {
  if (!scheduledStartTime) return 10 * 60 * 1000; // Default 10 minutes
  
  const now = new Date();
  const startTime = new Date(scheduledStartTime);
  const timeRemaining = startTime - now;
  
  if (timeRemaining <= 0) return 5 * 60 * 1000; // Stream already started/ended, check every 5 minutes
  
  const hoursRemaining = timeRemaining / (1000 * 60 * 60);
  
  if (hoursRemaining > 24) {
    return 2 * 60 * 60 * 1000; // > 24 hours: check every 2 hours
  } else if (hoursRemaining >= 12) {
    return 60 * 60 * 1000; // 12-24 hours: check every 1 hour
  } else if (hoursRemaining >= 1) {
    return 10 * 60 * 1000; // 1-12 hours: check every 10 minutes
  } else {
    return 5 * 60 * 1000; // < 1 hour: check every 5 minutes
  }
}

// Helper function to update collab status based on conditions
async function updateCollabStatus(collabId) {
  try {
    const collab = await Collab.findById(collabId).populate('creator');
    if (!collab) return;

    const currentPartners = getCurrentPartnerCount(collab);
    const hasAtLeastOnePartner = currentPartners >= 1;
    
    // Check each partner's YouTube link
    const partners = [
      { link: collab.youtube_link_1, field: 'stream_info_1' }, // Creator
      { link: collab.youtube_link_1_partner, field: 'stream_info_1_partner' }, // Partner 1
      { link: collab.youtube_link_2, field: 'stream_info_2' }, // Partner 2
      { link: collab.youtube_link_3, field: 'stream_info_3' }  // Partner 3
    ];
    
    let hasLiveStream = false;
    let hasWaitingRoom = false;
    let allStreamsEnded = true;
    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;

    // Nếu đang open, chỉ check link của creator với thời gian check động
    if (collab.status === 'open') {
      const link = collab.youtube_link_1;
      if (link) {
        try {
          const videoId = youtubeService.extractVideoId(link);
          if (videoId) {
            // Lấy scheduledStartTime từ stream_info_1 nếu có
            const scheduledStartTime = collab.stream_info_1?.scheduledStartTime;
            const checkInterval = getCheckInterval(scheduledStartTime);
            
            const streamStatus = await youtubeService.checkStreamStatus(videoId, checkInterval);
            // Nếu link không hợp lệ hoặc không phải phòng chờ/đang live thì huỷ collab
            if (!streamStatus.isValid || (!streamStatus.isWaitingRoom && !streamStatus.isLive)) {
              await Collab.findByIdAndUpdate(collabId, {
                status: 'cancelled',
                endedAt: new Date(),
                lastStatusCheck: new Date()
              });
              return;
            }
            
            // Cập nhật stream_info_1 với thông tin mới nhất
            await Collab.findByIdAndUpdate(collabId, {
              stream_info_1: {
                isLive: streamStatus.isLive,
                viewCount: streamStatus.viewCount || 0,
                title: streamStatus.title || '',
                thumbnail: streamStatus.thumbnail || '',
                scheduledStartTime: streamStatus.scheduledStartTime || null
              },
              lastStatusCheck: new Date()
            });
            
            if (streamStatus.isValid && streamStatus.isLive) {
              hasLiveStream = true;
              allStreamsEnded = false;
            } else if (streamStatus.isValid && streamStatus.isWaitingRoom) {
              hasWaitingRoom = true;
              allStreamsEnded = false;
            }
            // Cập nhật time_remaining nếu có scheduledStartTime
            if (streamStatus.scheduledStartTime) {
              const now = new Date();
              const scheduledStart = new Date(streamStatus.scheduledStartTime);
              const time_remaining = scheduledStart.getTime() - now.getTime();
              await Collab.findByIdAndUpdate(collabId, {
                time_remaining: time_remaining > 0 ? time_remaining : null,
                lastStatusCheck: new Date()
              });
            }
          }
        } catch (error) {
          console.error(`Error checking stream for creator:`, error.message);
        }
      }
    } else {
      // Các trạng thái khác: check tất cả link với thời gian check cố định
      for (const partner of partners) {
        if (partner.link) {
          try {
            const videoId = youtubeService.extractVideoId(partner.link);
            if (videoId) {
              const streamStatus = await youtubeService.checkStreamStatus(videoId, 5 * 60 * 1000);
              if (streamStatus.isValid && streamStatus.isLive) {
                hasLiveStream = true;
                allStreamsEnded = false;
              } else if (streamStatus.isValid && streamStatus.isWaitingRoom) {
                hasWaitingRoom = true;
                allStreamsEnded = false;
              } else if (streamStatus.isValid) {
                // Đã kết thúc
                totalViews += streamStatus.viewCount || 0;
                totalLikes += streamStatus.likeCount || 0;
                totalComments += streamStatus.commentCount || 0;
              }
            }
          } catch (error) {
            console.error(`Error checking stream for ${partner.field}:`, error.message);
          }
        }
      }
    }

    // 1. Nếu không có partner nào và stream đã bắt đầu hoặc kết thúc -> cancelled
    if (currentPartners === 0 && (hasLiveStream || allStreamsEnded)) {
      await Collab.findByIdAndUpdate(collabId, {
        status: 'cancelled',
        endedAt: new Date(),
        lastStatusCheck: new Date()
      });
      return;
    }

    // 2. Nếu stream đã kết thúc (tất cả đều ended)
    if (allStreamsEnded) {
      await Collab.findByIdAndUpdate(collabId, {
        status: 'ended',
        endedAt: new Date(),
        lastStatusCheck: new Date(),
        totalViews,
        totalLikes,
        totalComments
      });
      return;
    }

    // 3. Nếu stream đang live và có ít nhất 1 partner -> in_progress
    if (hasLiveStream && currentPartners >= 1) {
      await Collab.findByIdAndUpdate(collabId, {
        status: 'in_progress',
        startedAt: collab.startedAt || new Date(),
        lastStatusCheck: new Date()
      });
      return;
    }

    // 4. Nếu đủ số người (currentPartners >= maxPartners) và stream chưa bắt đầu -> setting_up
    if (hasWaitingRoom && currentPartners >= collab.maxPartners) {
      await Collab.findByIdAndUpdate(collabId, {
        status: 'setting_up',
        lastStatusCheck: new Date()
      });
      return;
    }

    // 5. Nếu chưa đủ số người và stream chưa bắt đầu -> open
    if (hasWaitingRoom && currentPartners < collab.maxPartners) {
      await Collab.findByIdAndUpdate(collabId, {
        status: 'open',
        lastStatusCheck: new Date()
      });
      return;
    }

    // Nếu collab đang open và KHÔNG có stream nào hợp lệ (không waiting room, không live)
    if (collab.status === 'open' && !hasWaitingRoom && !hasLiveStream) {
      await Collab.findByIdAndUpdate(collabId, {
        status: 'cancelled',
        endedAt: new Date(),
        lastStatusCheck: new Date()
      });
      return;
    }
  } catch (error) {
    console.error('Error updating collab status:', error);
  }
}

// Get all collabs
router.get('/', async (req, res) => {
  try {
    const { status, type } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status && ['open', 'in_progress', 'ended', 'cancelled'].includes(status)) {
      query.status = status;
    }
    
    // Filter by type
    if (type && ['Stream bình thường', 'Chơi game', 'Cosplay', 'Karaoke/Talkshow'].includes(type)) {
      query.type = type;
    }
    
    const collabs = await Collab.find(query)
      .populate('creator', 'username avatar')
      .populate('partner_1', 'username avatar')
      .populate('partner_2', 'username avatar')
      .populate('partner_3', 'username avatar')
      .sort({ createdAt: -1 });
    
    res.json({ collabs });
  } catch (error) {
    console.error('Error getting collabs:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách collab' });
  }
});

// GET /api/collabs/featured - 6 collab in_progress có tổng view cao nhất
router.get('/featured', async (req, res) => {
  try {
    // Lấy collab in_progress, sort theo tổng view giảm dần
    const collabs = await Collab.find({ status: 'in_progress' })
      .sort({ totalViews: -1, updatedAt: -1 })
      .limit(6)
      .populate('creator', 'username avatar')
      .populate('partner_1', 'username avatar')
      .populate('partner_2', 'username avatar')
      .populate('partner_3', 'username avatar');
    res.json({ collabs });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi lấy collab nổi bật' });
  }
});

// Get collab by ID
router.get('/:id', async (req, res) => {
  try {
    const collab = await Collab.findById(req.params.id)
      .populate('creator', 'username avatar')
      .populate('partner_1', 'username avatar')
      .populate('partner_2', 'username avatar')
      .populate('partner_3', 'username avatar')
      .populate('partner_waiting_for_confirm.user', 'username avatar');
    
    if (!collab) {
      return res.status(404).json({ error: 'Collab không tồn tại' });
    }
    
    res.json({ collab });
  } catch (error) {
    console.error('Error getting collab:', error);
    res.status(500).json({ error: 'Lỗi khi lấy thông tin collab' });
  }
});

// Create new collab
router.post('/', requireAuth(), createCollabLimiter, async (req, res) => {
  try {
    const { title, description, type, maxPartners, youtubeLink } = req.body;
    
    // Validation
    if (!title || !description || !type || !maxPartners || !youtubeLink) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }
    
    if (maxPartners < 1 || maxPartners > 2) {
      return res.status(400).json({ error: 'Số partner tối đa phải từ 1-2' });
    }
    
    // Validate YouTube URL
    if (!youtubeService.validateYouTubeUrl(youtubeLink)) {
      return res.status(400).json({ error: 'Link YouTube không hợp lệ' });
    }
    
    // Check stream status
    const videoId = youtubeService.extractVideoId(youtubeLink);
    const streamStatus = await youtubeService.checkStreamStatus(videoId, 5 * 60 * 1000); // 5 min cache for validation
    
    if (!streamStatus.isValid) {
      return res.status(400).json({ 
        error: 'Lỗi khi đăng collab. Link không hợp lệ hoặc stream đã bắt đầu' 
      });
    }
    
    if (!streamStatus.isWaitingRoom) {
      return res.status(400).json({ 
        error: 'Lỗi khi đăng collab. Link không hợp lệ hoặc stream đã bắt đầu' 
      });
    }


    
    // Get user
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    if (!user) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }
    // Kiểm tra đủ YouTube và Facebook
    if (!user.youtube || !user.facebook) {
      return res.status(400).json({ error: 'Bạn cần cập nhật đủ link YouTube và Facebook trong profile để sử dụng chức năng này.' });
    }
    
    // Check if user already has an active collab (open or in_progress)
    const existingCollab = await Collab.findOne({
      creator: user._id,
      status: { $in: ['open', 'in_progress'] }
    });
    
    if (existingCollab) {
      return res.status(400).json({ 
        error: 'Bạn đã có một collab đang hoạt động',
        message: 'Chỉ được phép tạo 1 collab tại một thời điểm. Vui lòng kết thúc collab hiện tại trước khi tạo mới.',
        existingCollabId: existingCollab._id
      });
    }
    
    // Tính thời gian còn lại đến khi stream bắt đầu
    let time_remaining = null;
    if (streamStatus.scheduledStartTime) {
      const now = new Date();
      const scheduledStart = new Date(streamStatus.scheduledStartTime);
      time_remaining = scheduledStart.getTime() - now.getTime();
      if (time_remaining <= 0) {
        time_remaining = null; // Stream đã bắt đầu
      }
    }
    
    // Create collab
    const collab = new Collab({
      creator: user._id,
      title,
      description,
      type,
      maxPartners,
      youtube_link_1: youtubeLink,
      time_remaining: time_remaining,
      // Lưu thông tin stream của creator
      stream_info_1: {
        isLive: streamStatus.isLive,
        viewCount: streamStatus.viewCount || 0,
        title: streamStatus.title || '',
        thumbnail: streamStatus.thumbnail || '',
        scheduledStartTime: streamStatus.scheduledStartTime || null
      },
      // Không lưu creator vào partner_1 để tránh nhầm lẫn
      partner_1_description: description
    });
    
    await collab.save();
    
    // Populate user info for response
    await collab.populate('creator', 'username avatar');
    await collab.populate('partner_2', 'username avatar');
    await collab.populate('partner_3', 'username avatar');
    
    res.status(201).json({ 
      collab,
      message: 'Tạo collab thành công' 
    });
  } catch (error) {
    console.error('Error creating collab:', error);
    res.status(500).json({ error: 'Lỗi khi tạo collab' });
  }
});

// Match with collab
router.post('/:id/match', requireAuth(), matchCollabLimiter, async (req, res) => {
  try {
    const { description, youtubeLink } = req.body;
    const collabId = req.params.id;
    
    // Validation
    if (!description || !youtubeLink) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }
    
    // Validate YouTube URL
    if (!youtubeService.validateYouTubeUrl(youtubeLink)) {
      return res.status(400).json({ error: 'Link YouTube không hợp lệ' });
    }
    
    // Check stream status
    const videoId = youtubeService.extractVideoId(youtubeLink);
    const streamStatus = await youtubeService.checkStreamStatus(videoId, 5 * 60 * 1000); // 5 min cache for validation
    
    if (!streamStatus.isValid) {
      return res.status(400).json({ 
        error: 'Lỗi khi match collab. Link không hợp lệ hoặc stream đã bắt đầu' 
      });
    }
    
    if (!streamStatus.isWaitingRoom) {
      return res.status(400).json({ 
        error: 'Lỗi khi match collab. Link không hợp lệ hoặc stream đã bắt đầu' 
      });
    }
    
    // Get user
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    if (!user) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }
    // Kiểm tra đủ YouTube và Facebook
    if (!user.youtube || !user.facebook) {
      return res.status(400).json({ error: 'Bạn cần cập nhật đủ link YouTube và Facebook trong profile để sử dụng chức năng này.' });
    }
    
    // Get collab
    const collab = await Collab.findById(collabId);
    if (!collab) {
      return res.status(404).json({ error: 'Collab không tồn tại' });
    }
    
    // Check if collab is open
    if (collab.status !== 'open') {
      return res.status(400).json({ error: 'Collab không còn mở để match' });
    }
    
    // Check if user is already a partner
    if (collab.partner_1?.equals(user._id) ||
        collab.partner_2?.equals(user._id) || 
        collab.partner_3?.equals(user._id)) {
      return res.status(400).json({ error: 'Bạn đã là partner trong collab này' });
    }
    
    // Check if user is the creator
    if (collab.creator.equals(user._id)) {
      return res.status(400).json({ error: 'Bạn không thể match với collab của chính mình' });
    }

    // Check if partner's videoId trùng với creator's videoId
    const creatorVideoId = youtubeService.extractVideoId(collab.youtube_link_1);
    if (videoId === creatorVideoId) {
      return res.status(400).json({ error: 'Link stream của bạn trùng với chủ collab, vui lòng chọn stream khác.' });
    }
    
    // Get next available slot
    const nextSlot = getNextPartnerSlot(collab);
    if (!nextSlot) {
      return res.status(400).json({ error: 'Collab đã đủ số người' });
    }
    
    // Update collab with new partner
    const updateData = {};
    updateData[`partner_${nextSlot}`] = user._id;
    updateData[`partner_${nextSlot}_description`] = description;
    
    // Use different field names for partner_1
    if (nextSlot === 1) {
      updateData['youtube_link_1_partner'] = youtubeLink;
    } else {
      updateData[`youtube_link_${nextSlot}`] = youtubeLink;
    }
    
    const updatedCollab = await Collab.findByIdAndUpdate(
      collabId,
      updateData,
      { new: true }
    ).populate('creator', 'username avatar')
     .populate('partner_1', 'username avatar')
     .populate('partner_2', 'username avatar')
     .populate('partner_3', 'username avatar');
    
    // Update status
    await updateCollabStatus(collabId);
    
    res.json({ 
      collab: updatedCollab,
      message: 'Match collab thành công' 
    });
  } catch (error) {
    console.error('Error matching collab:', error);
    res.status(500).json({ error: 'Lỗi khi match collab' });
  }
});

// User gửi yêu cầu match collab (thêm vào mảng chờ, tối đa 10)
router.post('/:id/request-match', requireAuth(), async (req, res) => {
  try {
    const { description, youtubeLink } = req.body;
    const collab = await Collab.findById(req.params.id);
    console.log('[request-match] collab:', collab);
    console.log('[request-match] request body:', { description, youtubeLink });
    
    if (!collab) return res.status(404).json({ error: 'Collab không tồn tại' });
    if (collab.partner_waiting_for_confirm.length >= 10) {
      return res.status(400).json({ error: 'Danh sách yêu cầu đã đầy, bạn khám phá các phiên collab khác bên dưới nhé!' });
    }
    // Không cho gửi trùng user
    const userId = req.auth?.userId || req.auth?.user?.id;
    console.log('[request-match] userId:', userId);
    let user = await User.findOne({ clerkId: userId });
    if (!user && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });
    if (collab.partner_waiting_for_confirm.some(w => w.user.toString() === user._id.toString())) {
      return res.status(400).json({ error: 'Bạn đã gửi yêu cầu rồi, vui lòng chờ chủ collab xác nhận!' });
    }
    // Không cho gửi nếu đã là partner chính thức
    if ([collab.partner_1, collab.partner_2, collab.partner_3].some(p => p && p.toString() === user._id.toString())) {
      return res.status(400).json({ error: 'Bạn đã là partner của collab này!' });
    }
    
    // Kiểm tra link YouTube của partner
    if (!youtubeService.validateYouTubeUrl(youtubeLink)) {
      return res.status(400).json({ error: 'Link YouTube không hợp lệ' });
    }
    
    // Check stream status của partner
    const partnerVideoId = youtubeService.extractVideoId(youtubeLink);
    console.log('[request-match] partnerVideoId:', partnerVideoId);
    const partnerStreamStatus = await youtubeService.checkStreamStatus(partnerVideoId, 5 * 60 * 1000);
    console.log('[request-match] partnerStreamStatus:', partnerStreamStatus);
    
    if (!partnerStreamStatus.isValid) {
      return res.status(400).json({ 
        error: 'Link YouTube của bạn không hợp lệ hoặc stream đã bắt đầu' 
      });
    }
    
    if (!partnerStreamStatus.isWaitingRoom) {
      return res.status(400).json({ 
        error: 'Link YouTube của bạn phải là phòng chờ (waiting room)' 
      });
    }
    
    // Kiểm tra thời gian diễn ra stream có trùng khớp với chủ phòng không
    let creatorScheduledTime = collab.stream_info_1?.scheduledStartTime;
    const partnerScheduledTime = partnerStreamStatus.scheduledStartTime;
    
    console.log('[request-match] creatorScheduledTime:', creatorScheduledTime);
    console.log('[request-match] partnerScheduledTime:', partnerScheduledTime);
    console.log('[request-match] collab.stream_info_1:', collab.stream_info_1);
    
    // Nếu creatorScheduledTime không có, thử update stream_info_1
    if (!creatorScheduledTime && collab.youtube_link_1) {
      console.log('[request-match] Attempting to update stream_info_1 for collab');
      const updated = await updateStreamInfoForCollab(collab._id);
      if (updated) {
        // Reload collab data
        const updatedCollab = await Collab.findById(collab._id);
        creatorScheduledTime = updatedCollab.stream_info_1?.scheduledStartTime;
        console.log('[request-match] Updated creatorScheduledTime:', creatorScheduledTime);
      }
    }
    
    if (!creatorScheduledTime || !partnerScheduledTime) {
      console.log('[request-match] ERROR: Missing scheduled time - creator:', !!creatorScheduledTime, 'partner:', !!partnerScheduledTime);
      return res.status(400).json({ 
        error: 'Không thể xác định thời gian diễn ra stream. Vui lòng thử lại sau.' 
      });
    }
    
    // So sánh thời gian (cho phép sai lệch 5 phút)
    const creatorTime = new Date(creatorScheduledTime).getTime();
    const partnerTime = new Date(partnerScheduledTime).getTime();
    const timeDiff = Math.abs(creatorTime - partnerTime);
    const maxTimeDiff = 5 * 60 * 1000; // 5 phút
    
    console.log('[request-match] time comparison:', {
      creatorTime: new Date(creatorTime).toISOString(),
      partnerTime: new Date(partnerTime).toISOString(),
      timeDiff: timeDiff / 1000 / 60, // minutes
      maxTimeDiff: maxTimeDiff / 1000 / 60 // minutes
    });
    
    if (timeDiff > maxTimeDiff) {
      return res.status(400).json({ 
        error: 'Thời gian diễn ra stream của bạn không trùng khớp với thời gian của chủ phòng. Vui lòng kiểm tra lại.' 
      });
    }
    
    collab.partner_waiting_for_confirm.push({
      user: user._id,
      description,
      youtubeLink
    });
    await collab.save();
    console.log('[request-match] SUCCESS: Request added to waiting list');
    res.json({ message: 'Gửi yêu cầu thành công!' });
  } catch (error) {
    console.error('[request-match] ERROR:', error);
    res.status(500).json({ error: 'Lỗi khi gửi yêu cầu match', details: error.message });
  }
});

// Chủ collab lấy danh sách chờ
router.get('/:id/waiting-list', requireAuth(), async (req, res) => {
  try {
    const collab = await Collab.findById(req.params.id).populate('partner_waiting_for_confirm.user', 'username avatar');
    if (!collab) return res.status(404).json({ error: 'Collab không tồn tại' });
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user = await User.findOne({ clerkId: userId });
    if (!user && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });
    if (collab.creator.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Chỉ chủ collab mới xem được danh sách này' });
    }
    res.json({ waitingList: collab.partner_waiting_for_confirm });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi lấy danh sách chờ' });
  }
});

// Chủ collab chấp nhận yêu cầu (chuyển sang partner chính thức, xoá khỏi mảng chờ)
router.post('/:id/accept-waiting/:waitingId', requireAuth(), async (req, res) => {
  try {
    const collab = await Collab.findById(req.params.id);
    if (!collab) return res.status(404).json({ error: 'Collab không tồn tại' });
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user = await User.findOne({ clerkId: userId });
    if (!user && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });
    if (collab.creator.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Chỉ chủ collab mới có quyền này' });
    }
    if (getCurrentPartnerCount(collab) >= collab.maxPartners) {
      collab.partner_waiting_for_confirm = [];
      await collab.save();
      return res.status(400).json({ error: 'Collab đã đủ người, không thể chấp nhận thêm!' });
    }
    const waitingIndex = collab.partner_waiting_for_confirm.findIndex(w => w._id.toString() === req.params.waitingId);
    if (waitingIndex === -1) return res.status(404).json({ error: 'Yêu cầu không tồn tại' });
    const waiting = collab.partner_waiting_for_confirm[waitingIndex];
    // Thêm vào partner chính thức
    const slot = getNextPartnerSlot(collab);
    if (!slot) return res.status(400).json({ error: 'Collab đã đủ người!' });
    collab[`partner_${slot}`] = waiting.user;
    collab[`partner_${slot}_description`] = waiting.description;
    if (slot === 1) collab['youtube_link_1_partner'] = waiting.youtubeLink;
    else collab[`youtube_link_${slot}`] = waiting.youtubeLink;
    // Xoá khỏi mảng chờ
    collab.partner_waiting_for_confirm.splice(waitingIndex, 1);
    // Nếu đã đủ người, xoá hết mảng chờ
    if (getCurrentPartnerCount(collab) >= collab.maxPartners) {
      collab.partner_waiting_for_confirm = [];
    }
    await collab.save();
    await updateCollabStatus(collab._id);
    res.json({ message: 'Đã thêm partner vào collab!' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi chấp nhận yêu cầu' });
  }
});

// Chủ collab từ chối yêu cầu (xoá khỏi mảng chờ)
router.post('/:id/reject-waiting/:waitingId', requireAuth(), async (req, res) => {
  try {
    const collab = await Collab.findById(req.params.id);
    if (!collab) return res.status(404).json({ error: 'Collab không tồn tại' });
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user = await User.findOne({ clerkId: userId });
    if (!user && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });
    if (collab.creator.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Chỉ chủ collab mới có quyền này' });
    }
    const waitingIndex = collab.partner_waiting_for_confirm.findIndex(w => w._id.toString() === req.params.waitingId);
    if (waitingIndex === -1) return res.status(404).json({ error: 'Yêu cầu không tồn tại' });
    collab.partner_waiting_for_confirm.splice(waitingIndex, 1);
    await collab.save();
    await updateCollabStatus(collab._id);
    res.json({ message: 'Đã từ chối yêu cầu!' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi từ chối yêu cầu' });
  }
});

// Get user's collabs
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    let user;
    if (userId.startsWith('user_')) {
      user = await User.findOne({ clerkId: userId });
    } else if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }
    
    const collabs = await Collab.find({
      $or: [
        { creator: user._id },
        { partner_1: user._id },
        { partner_2: user._id },
        { partner_3: user._id }
      ]
    })
    .populate('creator', 'username avatar')
    .populate('partner_1', 'username avatar')
    .populate('partner_2', 'username avatar')
    .populate('partner_3', 'username avatar')
    .sort({ createdAt: -1 });
    
    res.json({ collabs });
  } catch (error) {
    console.error('Error getting user collabs:', error);
    res.status(500).json({ error: 'Lỗi khi lấy collab của user' });
  }
});

// Get current user's active collab
router.get('/my/active', requireAuth(), async (req, res) => {
  try {
    // Get user
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }
    
    // Get user's active collab (as creator)
    const activeCollab = await Collab.findOne({
      creator: user._id,
      status: { $in: ['open', 'in_progress'] }
    }).populate('creator', 'username avatar')
      .populate('partner_1', 'username avatar')
      .populate('partner_2', 'username avatar')
      .populate('partner_3', 'username avatar');
    
    res.json({ 
      hasActiveCollab: !!activeCollab,
      activeCollab 
    });
  } catch (error) {
    console.error('Error getting user active collab:', error);
    res.status(500).json({ error: 'Lỗi khi lấy collab đang hoạt động' });
  }
});

// Update stream info (for real-time updates)
router.put('/:id/stream-info', youtubeApiLimiter, async (req, res) => {
  try {
    const collab = await Collab.findById(req.params.id);
    if (!collab) {
      return res.status(404).json({ error: 'Collab không tồn tại' });
    }
    
    const updateData = { lastStatusCheck: new Date() };
    
    // Check each partner's YouTube link and update their stream info
    const partners = [
      { link: collab.youtube_link_1, field: 'stream_info_1' },
      { link: collab.youtube_link_2, field: 'stream_info_2' },
      { link: collab.youtube_link_3, field: 'stream_info_3' }
    ];
    
    for (const partner of partners) {
      if (partner.link) {
        try {
          const videoId = youtubeService.extractVideoId(partner.link);
          if (videoId) {
            const streamInfo = await youtubeService.getStreamInfo(videoId);
            
            if (streamInfo) {
              updateData[partner.field] = {
                isLive: streamInfo.isLive,
                viewCount: streamInfo.viewCount || 0,
                title: streamInfo.title || '',
                thumbnail: streamInfo.thumbnail || '',
                scheduledStartTime: streamInfo.scheduledStartTime || null
              };
              
              // Cập nhật time_remaining nếu đây là stream của creator (stream_info_1)
              if (partner.field === 'stream_info_1' && streamInfo.scheduledStartTime) {
                const now = new Date();
                const scheduledStart = new Date(streamInfo.scheduledStartTime);
                const time_remaining = scheduledStart.getTime() - now.getTime();
                updateData.time_remaining = time_remaining > 0 ? time_remaining : null;
              }
            }
          }
        } catch (error) {
          console.error(`Error checking stream for ${partner.field}:`, error.message);
        }
      }
    }
    
    // Update all stream info at once
    await Collab.findByIdAndUpdate(req.params.id, updateData);
    
    res.json({ message: 'Cập nhật stream info thành công' });
  } catch (error) {
    console.error('Error updating stream info:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật stream info' });
  }
});

// Delete collab (only creator can delete, only when status is 'open')
router.delete('/:id', requireAuth(), async (req, res) => {
  try {
    const collabId = req.params.id;
    
    // Get user
    const userId = req.auth?.userId || req.auth?.user?.id;
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }
    
    // Get collab
    const collab = await Collab.findById(collabId);
    if (!collab) {
      return res.status(404).json({ error: 'Collab không tồn tại' });
    }
    
    // Check if user is the creator
    if (!collab.creator.equals(user._id)) {
      return res.status(403).json({ 
        error: 'Không có quyền xóa collab này',
        message: 'Chỉ người tạo collab mới có thể xóa'
      });
    }
    
    // Check if collab status is 'open'
    if (collab.status !== 'open') {
      return res.status(400).json({ 
        error: 'Không thể xóa collab này',
        message: 'Chỉ có thể xóa collab khi đang ở trạng thái "Đang mở"'
      });
    }
    
    // Delete collab and all related data
    await Collab.findByIdAndDelete(collabId);
    
    res.json({ 
      message: 'Xóa collab thành công',
      deletedCollabId: collabId
    });
  } catch (error) {
    console.error('Error deleting collab:', error);
    res.status(500).json({ error: 'Lỗi khi xóa collab' });
  }
});

module.exports = router;