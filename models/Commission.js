const mongoose = require('mongoose');

// Commission types mapping
const COMMISSION_TYPES = {
  1: 'Rig Model',
  2: 'Vẽ Model',
  3: 'Vẽ Chibi',
  4: 'Vẽ Chân Dung',
  5: 'Vẽ Background',
  6: 'Vẽ Concept Art',
  7: 'Vẽ Fanart',
  8: 'Vẽ OC',
  9: 'Vẽ Logo',
  10: 'Vẽ Banner',
  11: 'Vẽ Thumbnail',
  12: 'Vẽ Emote',
  13: 'Vẽ Badge',
  14: 'Vẽ Sticker',
  15: 'Vẽ Poster',
  16: 'Vẽ Card',
  17: 'Vẽ Icon',
  18: 'Vẽ Mascot',
  19: 'Vẽ Character Sheet',
  20: 'Vẽ Storyboard',
  21: 'Vẽ Comic',
  22: 'Vẽ Manga',
  23: 'Vẽ Illustration',
  24: 'Vẽ Digital Art',
  25: 'Vẽ Traditional Art',
  26: 'Vẽ Pixel Art',
  27: 'Vẽ Vector Art',
  28: 'Vẽ 3D Model',
  29: 'Vẽ Animation',
  30: 'Vẽ Motion Graphics',
  31: 'Nhạc Original',
  32: 'Nhạc Cover',
  33: 'Nhạc Remix',
  34: 'Nhạc Background',
  35: 'Voice Acting',
  36: 'Voice Over',
  37: 'Voice Edit',
  38: 'Video Edit',
  39: 'Video Animation',
  40: 'Video Motion',
  41: 'Video Intro',
  42: 'Video Outro',
  43: 'Video Trailer',
  44: 'Video Promo',
  45: 'Writing Script',
  46: 'Writing Story',
  47: 'Writing Lyrics',
  48: 'Writing Content',
  49: 'Writing Translation',
  50: 'Other'
};

const commissionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  type: { 
    type: String,
    validate: {
      validator: function(v) {
        // Allow both numeric IDs (1-50) and string names
        if (typeof v === 'string') {
          // If it's a number string, validate it's in range
          if (/^\d+$/.test(v)) {
            const num = parseInt(v);
            return num >= 1 && num <= 50;
          }
          // If it's a name, check if it exists in our mapping
          return Object.values(COMMISSION_TYPES).includes(v);
        }
        return false;
      },
      message: 'Commission type must be a valid ID (1-50) or type name'
    }
  },
  price: { type: Number, required: true },
  currency: { type: String, default: 'VND' },
  deadline: { type: Date },
  requirements: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  'media-img': { type: [String], default: [] }, // Array of image URLs
  'media-vid': { type: [String], default: [] }, // Array of video URLs (max 40MB each)
  status: { 
    type: String, 
    enum: [
      'open', 
      'pending', 
      'in_progress', 
      'waiting_customer_confirmation', 
      'completed', 
      'cancelled'
    ], 
    default: 'open' 
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  feedback: [{ 
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, required: true, maxlength: 200 },
    createdAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

// Add static method to get commission type name by ID
commissionSchema.statics.getTypeName = function(typeId) {
  return COMMISSION_TYPES[typeId] || 'Unknown';
};

// Add static method to get all commission types
commissionSchema.statics.getAllTypes = function() {
  return COMMISSION_TYPES;
};

module.exports = mongoose.model('Commission', commissionSchema); 