const rateLimit = require('express-rate-limit');

// Rate limiter cho tạo collab
const createCollabLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5, // Tối đa 5 lần tạo collab trong 15 phút
  message: {
    error: 'Quá nhiều yêu cầu tạo collab',
    message: 'Vui lòng thử lại sau 15 phút'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter cho match collab
const matchCollabLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 10, // Tối đa 10 lần match trong 5 phút
  message: {
    error: 'Quá nhiều yêu cầu match',
    message: 'Vui lòng thử lại sau 5 phút'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter cho API calls chung
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100, // Tối đa 100 requests trong 15 phút
  message: {
    error: 'Quá nhiều yêu cầu API',
    message: 'Vui lòng thử lại sau 15 phút'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter cho YouTube API calls
const youtubeApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 10, // Tối đa 10 calls YouTube API trong 1 phút
  message: {
    error: 'Quá nhiều yêu cầu kiểm tra YouTube',
    message: 'Vui lòng thử lại sau 1 phút'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  createCollabLimiter,
  matchCollabLimiter,
  apiLimiter,
  youtubeApiLimiter
};