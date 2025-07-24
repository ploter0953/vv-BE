const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  commission: { type: mongoose.Schema.Types.ObjectId, ref: 'Commission', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // MongoDB ObjectId of the customer
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // MongoDB ObjectId of the artist
  buyer: { type: String, required: true }, // ClerkId of the customer (keep for backward compatibility)
  status: { 
    type: String, 
    enum: [
      'pending', 
      'confirmed', 
      'in_progress', 
      'waiting_customer_confirmation', 
      'completed', 
      'cancelled', 
      'customer_rejected', 
      'artist_rejected'
    ], 
    default: 'pending' 
  },
  rejection_reason: { type: String },
  confirmed_at: { type: Date },
  completed_at: { type: Date },
  customer_confirmed: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema); 