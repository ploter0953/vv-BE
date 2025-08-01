const rateLimit = require('express-rate-limit');

// Rate limiter for Discord bot commands
const discordCommandLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for donation webhook (per Discord ID)
const donationWebhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each Discord ID to 5 donations per minute
  keyGenerator: (req) => {
    // Extract Discord ID from request body for rate limiting
    const discordId = req.body?.data?.description?.match(/\b\d{17,19}\b/)?.[0];
    return discordId || req.ip;
  },
  message: {
    error: 'Too many donation attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for general webhook requests
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  message: {
    error: 'Too many webhook requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many API requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for creating collabs
const createCollabLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // limit each user to 3 collab creations per 5 minutes
  keyGenerator: (req) => {
    return req.auth?.userId || req.auth?.user?.id || req.ip;
  },
  message: {
    error: 'Too many collab creation attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for matching collabs
const matchCollabLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 5, // limit each user to 5 match attempts per 2 minutes
  keyGenerator: (req) => {
    return req.auth?.userId || req.auth?.user?.id || req.ip;
  },
  message: {
    error: 'Too many match attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for YouTube API calls
const youtubeApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 YouTube API calls per minute
  message: {
    error: 'Too many YouTube API requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  discordCommandLimiter,
  donationWebhookLimiter,
  webhookLimiter,
  apiLimiter,
  createCollabLimiter,
  matchCollabLimiter,
  youtubeApiLimiter
};