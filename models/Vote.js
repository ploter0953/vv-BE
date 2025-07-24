const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
  voter_id: { type: String, required: true },
  voted_vtuber_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For VTuber votes
  voted_artist_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For Artist votes
  vote_type: { type: String, enum: ['vtuber', 'artist'], required: true }, // Type of vote
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for performance
voteSchema.index({ voter_id: 1, vote_type: 1, created_at: -1 });
voteSchema.index({ voted_vtuber_id: 1 });
voteSchema.index({ voted_artist_id: 1 });
voteSchema.index({ created_at: -1 });

// Validation: Either voted_vtuber_id or voted_artist_id must be present
voteSchema.pre('save', function(next) {
  if (this.vote_type === 'vtuber' && !this.voted_vtuber_id) {
    return next(new Error('voted_vtuber_id is required for vtuber votes'));
  }
  if (this.vote_type === 'artist' && !this.voted_artist_id) {
    return next(new Error('voted_artist_id is required for artist votes'));
  }
  next();
});

module.exports = mongoose.model('Vote', voteSchema); 