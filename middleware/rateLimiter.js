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

// Rate limiter for donation webhook
const donationWebhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  message: {
    error: 'Too many donation webhook requests, please try again later.'
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

module.exports = {
  discordCommandLimiter,
  donationWebhookLimiter,
  apiLimiter
};