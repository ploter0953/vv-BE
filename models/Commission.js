const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  type: { type: String },
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

module.exports = mongoose.model('Commission', commissionSchema); 