const mongoose = require('mongoose');

const collabSchema = new mongoose.Schema({
  // Người tạo collab
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Thông tin cơ bản
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Stream bình thường', 'Chơi game', 'Cosplay', 'Karaoke/Talkshow'],
    required: true 
  },
  
  // Số người collab mong muốn
  maxPartners: { type: Number, min: 1, max: 3, required: true },
  
  // Creator's stream info (luôn có)
  youtube_link_1: { type: String, default: '' },
  stream_info_1: {
    isLive: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    title: { type: String, default: '' },
    thumbnail: { type: String, default: '' }
  },
  
  // Partner 1 (người match đầu tiên)
  partner_1: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  partner_1_description: { type: String, default: '' },
  youtube_link_1_partner: { type: String, default: '' },
  stream_info_1_partner: {
    isLive: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    title: { type: String, default: '' },
    thumbnail: { type: String, default: '' }
  },
  
  // Partner 2 (optional)
  partner_2: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  partner_2_description: { type: String, default: '' },
  youtube_link_2: { type: String, default: '' },
  stream_info_2: {
    isLive: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    title: { type: String, default: '' },
    thumbnail: { type: String, default: '' }
  },
  
  // Partner 3 (optional)
  partner_3: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  partner_3_description: { type: String, default: '' },
  youtube_link_3: { type: String, default: '' },
  stream_info_3: {
    isLive: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    title: { type: String, default: '' },
    thumbnail: { type: String, default: '' }
  },
  
  // Danh sách chờ xác nhận partner
  partner_waiting_for_confirm: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      description: String,
      youtubeLink: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  
  // Trạng thái
  status: { 
    type: String, 
    enum: ['open', 'setting_up', 'in_progress', 'ended', 'cancelled'],
    default: 'open' 
  },
  
  // Timestamps cho tracking
  startedAt: { type: Date },
  endedAt: { type: Date },
  lastStatusCheck: { type: Date, default: Date.now },
  
  // Thời gian còn lại đến khi stream bắt đầu (tính từ stream của chủ phòng)
  time_remaining: { type: Number, default: null }, // milliseconds
  
  // Tổng quan khi ended
  totalViews: { type: Number, default: 0 },
  totalLikes: { type: Number, default: 0 },
  totalComments: { type: Number, default: 0 },
}, { 
  timestamps: true 
});

// Index để tối ưu query
collabSchema.index({ status: 1, createdAt: -1 });
collabSchema.index({ creator: 1 });
collabSchema.index({ 'stream_info_1.isLive': 1 });
collabSchema.index({ 'stream_info_2.isLive': 1 });
collabSchema.index({ 'stream_info_3.isLive': 1 });

module.exports = mongoose.model('Collab', collabSchema);