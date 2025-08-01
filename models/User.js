const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  clerkId: { type: String, unique: true, required: true }, // Liên kết với user trên Clerk
  email: String, // Sync từ Clerk
  username: String, // Sync từ Clerk
  avatar: String, // Sync từ Clerk
  banner: String, // Banner image URL
  role: { type: String, enum: ['user', 'admin', 'artist'], default: 'user' },
  bio: String,
  description: String,
  badges: { type: [String], default: ['member'] },
  facebook: String,
  website: String,
  profile_email: String,
  vtuber_description: String,
  artist_description: String,
  twitch: String,
  youtube: String,
  tiktok: String,
  lastSeen: { type: Date, default: Date.now }, // Track online status
  isOnline: { type: Boolean, default: false }, // Real-time online status
  
  // Donate fields
  balance: { type: Number, default: 0 }, // Số dư từ nạp tiền
  donated: { type: Number, default: 0 }, // Số tiền đã donate
  discord_id: { type: String, default: '' }, // Discord ID của user
  is_discord_verified: { type: Boolean, default: false }, // Trạng thái xác minh Discord
  
  // Stream Schedule
  streamSchedule: [{
    dayOfWeek: { 
      type: String, 
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      required: true 
    },
    timeSlot: { 
      type: String, 
      required: true,
      validate: {
        validator: function(v) {
          // Validate time format HH:mm
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Time slot must be in HH:mm format (e.g., 20:00)'
      }
    },
    title: { type: String, default: '' },
    streamLink: { 
      type: String, 
      default: '',
      validate: {
        validator: function(v) {
          if (!v) return true; // Allow empty
          // Basic YouTube URL validation
          return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(v);
        },
        message: 'Stream link must be a valid YouTube URL'
      }
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('User', userSchema); 