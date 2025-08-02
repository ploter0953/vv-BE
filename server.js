console.log('=== SERVER.JS ĐANG CHẠY PHIÊN BẢN MỚI NHẤT ===');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const userRoutes = require('./routes/userRoutes');
const commissionRoutes = require('./routes/commissionRoutes');
const orderRoutes = require('./routes/orderRoutes');
const collabRoutes = require('./routes/collabRoutes');
const donateRoutes = require('./routes/donateRoutes');
const youtubeService = require('./services/youtubeService');
const discordBotService = require('./services/discordBotService');
const donationCleanupService = require('./services/donationCleanupService');
const User = require('./models/User');
const Commission = require('./models/Commission');
const Order = require('./models/Order');
const Collab = require('./models/Collab');
const Vote = require('./models/Vote');
const Feedback = require('./models/Feedback');
const { requireAuth } = require('@clerk/express');

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file hình ảnh'), false);
    }
  }
});

// Multer configuration for media uploads (images + videos, up to 40MB)
const mediaUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 40 * 1024 * 1024, // 40MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file hình ảnh hoặc video'), false);
    }
  }
});

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware xác thực Clerk
// const clerkMiddleware = clerkExpressWithAuth({ secretKey: process.env.CLERK_SECRET_KEY });

// Example usage for protected routes:
// app.use('/api/orders', clerkMiddleware);
// app.use('/api/commissions', clerkMiddleware);
// app.use('/api/upload', clerkMiddleware);
// app.use('/api/vote', clerkMiddleware);
// app.use('/api/feedback', clerkMiddleware);
// app.use('/api/users', clerkMiddleware); // If you want to protect all user routes

// Parse allowed origins from environment variable
const getAllowedOrigins = () => {
  // Only allow official domain
  const allowedOrigins = [
    'https://www.projectvtuber.com',
    'https://donate.projectvtuber.com',
    'http://donate.projectvtuber.com',
    'http://localhost:5173', // Vite dev server
    'http://localhost:3000'  // React dev server
  ];
  
  return allowedOrigins;
};

// Enhanced origin validation middleware
const validateOrigin = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  
  // Log origin for debugging
  
  
  // Block requests with no origin (direct API access, Postman, curl, etc.)
  if (!origin) {
    return res.status(403).json({
      error: 'Truy cập trực tiếp API không được phép',
      message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com',
      allowedOrigins: process.env.NODE_ENV === 'development' ? allowedOrigins : undefined
    });
  }
  
  // Check if origin is allowed
  if (allowedOrigins.includes(origin)) {
    return next();
  }
  
  // Block unauthorized origin
  return res.status(403).json({
    error: 'Truy cập không được phép từ domain này',
    message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com',
    allowedOrigins: process.env.NODE_ENV === 'development' ? allowedOrigins : undefined
  });
};

// Middleware to ensure JSON responses
app.use((req, res, next) => {
  // Set default content type for API responses
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Middleware to log requests for debugging
app.use((req, res, next) => {
  // Silent request logging
  next();
});

// Middleware to log clerk-sync requests
app.use((req, res, next) => {
  if (req.path.includes('clerk-sync')) {
    console.log('=== ĐÃ VÀO MIDDLEWARE TOÀN CỤC:', req.method, req.path);
  }
  next();
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin ONLY for upload endpoints (needed for some browsers/networks)
    if (!origin) {
      // We'll handle this case in the upload-specific middleware
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Block unauthorized origin
    return callback(new Error('Truy cập không được phép từ domain này'), false);
  },
  credentials: true, // Enable credentials for cross-origin requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));



app.post('/webhook/casso', (req, res, next) => {
  console.log('=== CASSO WEBHOOK RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Timestamp:', new Date().toISOString());
  console.log('IP:', req.ip);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('================================');
  
  next();
}, require('./donate/xulinaptien'));



// Apply origin validation middleware to all API routes except uploads
app.use('/api', (req, res, next) => {
  // Add logging for debugging
  console.log(`[API REQUEST] ${req.method} ${req.path}`, {
    origin: req.headers.origin,
    referer: req.headers.referer,
    userAgent: req.headers['user-agent']?.substring(0, 100)
  });
  
  // Skip origin validation for OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  // For upload endpoints, apply selective no-origin validation
  if (req.path.startsWith('/upload/')) {
    const origin = req.headers.origin;
    
    // For upload endpoints, only allow no-origin if it's from legitimate sources
    if (!origin) {
      // Still require authentication - no free access
      return next();
    }
    
    // If there is an origin, it must be from allowed domains
    const allowedOrigins = getAllowedOrigins();
    if (!allowedOrigins.includes(origin)) {
      return res.status(403).json({
        error: 'Truy cập không được phép từ domain này',
        message: 'Upload chỉ được phép từ domain chính thức',
        allowedOrigins: process.env.NODE_ENV === 'development' ? allowedOrigins : undefined
      });
    }
    
    return next();
  }
  
  // For webhook endpoints, skip origin validation (Casso, etc.)
  if (req.path.startsWith('/casso-webhook')) {
    return next();
  }
  
  // For non-upload endpoints, apply strict origin validation
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  
  // Block requests with no origin for non-upload endpoints
  if (!origin) {
    console.log('No origin header - BLOCKING request (direct API access not allowed)');
    return res.status(403).json({
      error: 'Truy cập trực tiếp API không được phép',
      message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com',
      allowedOrigins: process.env.NODE_ENV === 'development' ? allowedOrigins : undefined
    });
  }
  
  // Check if origin is allowed
  if (allowedOrigins.includes(origin)) {
    return next();
  }
  
  // Block unauthorized origin
  return res.status(403).json({
    error: 'Truy cập không được phép từ domain này',
    message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com',
    allowedOrigins: process.env.NODE_ENV === 'development' ? allowedOrigins : undefined
  });
});

// Additional security: Check Referer header for API routes
app.use('/api', (req, res, next) => {
  // For upload endpoints, apply selective referer validation
  if (req.path.startsWith('/upload/')) {
    const referer = req.headers.referer;
    
    // Skip referer check for OPTIONS requests (preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    // If there's a referer, it must be from allowed domain
    if (referer) {
      const allowedOrigins = getAllowedOrigins();
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      
      if (!allowedOrigins.includes(refererOrigin)) {
        return res.status(403).json({
          error: 'Truy cập không được phép từ domain này',
          message: 'Upload chỉ được phép từ domain chính thức'
        });
      }
    }
    
    return next();
  }
  
  const referer = req.headers.referer;
  const allowedOrigins = getAllowedOrigins();
  
  // Skip referer check for OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  // For webhook endpoints, skip referer validation (Casso, etc.)
  if (req.path.startsWith('/casso-webhook')) {
    return next();
  }
  
  // For webhook endpoints, skip referer validation (Casso, etc.)
  if (req.path.startsWith('/casso-webhook')) {
    return next();
  }
  
  // For non-upload endpoints, check referer
  // Block requests without referer (direct API access)
  if (!referer) {
    return res.status(403).json({
      error: 'Truy cập trực tiếp API không được phép',
      message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com'
    });
  }
  
  // Check if referer is from allowed domain
  try {
    const refererUrl = new URL(referer);
    const refererOrigin = refererUrl.origin;
    
    if (!allowedOrigins.includes(refererOrigin)) {
      return res.status(403).json({
        error: 'Truy cập không được phép từ domain này',
        message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com'
      });
    }
  } catch (error) {
    // Invalid referer URL, block the request
    return res.status(403).json({
      error: 'Referer không hợp lệ',
      message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com'
    });
  }
  next();
});

// Additional security: Block common API testing tools
app.use('/api', (req, res, next) => {
  // Skip user-agent check for upload endpoints
  if (req.path.startsWith('/upload/')) {
    console.log('Skipping user-agent validation for upload endpoint:', req.path);
    return next();
  }
  
  // Skip user-agent check for webhook endpoints (Casso, etc.)
  if (req.path.startsWith('/casso-webhook')) {
    console.log('Skipping user-agent validation for webhook endpoint:', req.path);
    return next();
  }
  
  const userAgent = req.headers['user-agent'] || '';
  const blockedTools = [
    'postman',
    'insomnia',
    'curl',
    'wget',
    'python-requests',
    'httpie',
    'thunder client',
    'rest client'
  ];
  
  // Skip for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  const lowerUserAgent = userAgent.toLowerCase();
  const isBlockedTool = blockedTools.some(tool => lowerUserAgent.includes(tool));
  
  if (isBlockedTool) {
    console.log(`Blocked API testing tool: ${userAgent}`);
    return res.status(403).json({
      error: 'Truy cập API không được phép',
      message: 'Vui lòng truy cập từ domain chính thức: https://www.projectvtuber.com'
    });
  }
  
  next();
});

app.use(express.json());

// Handle CORS preflight requests
app.options('*', cors(corsOptions));

// Specific OPTIONS routes for main endpoints
app.options('/api/commissions', cors(corsOptions));
app.options('/api/users', cors(corsOptions));
app.options('/api/users/*', cors(corsOptions)); // Add wildcard for user routes
app.options('/api/auth/*', cors(corsOptions));
app.options('/api/orders', cors(corsOptions));

// Kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vtuberverse';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected to', mongoose.connection.name))
  .catch(err => console.error('MongoDB connection error:', err));

// Remove profile_email unique index - allow multiple users to have same profile_email
async function fixProfileEmailIndex() {
  try {
    // Drop the existing unique index on profile_email
    await User.collection.dropIndex('profile_email_1');
    console.log('Dropped existing profile_email unique index');
  } catch (error) {
    // Index might not exist, which is fine
    console.log('Profile_email unique index does not exist or already dropped');
  }
  
  try {
    // Create a regular index (not unique) for better query performance
    await User.collection.createIndex({ profile_email: 1 });
    console.log('Created regular index on profile_email (non-unique)');
  } catch (error) {
    console.log('Profile_email index already exists or error:', error.message);
  }
}

// Call the fix function when the app starts
fixProfileEmailIndex();

// Helper function to extract public_id from Cloudinary URL
function extractPublicIdFromCloudinaryUrl(url) {
  if (!url || !url.includes('cloudinary.com')) {
    return null;
  }
  
  try {
    // Cloudinary URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/filename.jpg
    const urlParts = url.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    
    if (uploadIndex !== -1 && uploadIndex + 2 < urlParts.length) {
      // Get the part after 'upload' and version
      const publicIdParts = urlParts.slice(uploadIndex + 2);
      // Remove file extension
      const publicId = publicIdParts.join('/').split('.')[0];
      return publicId;
    }
  } catch (error) {
    console.log('Error extracting public_id from URL:', error.message);
  }
  
  return null;
}



// Fix usernames for existing users
app.post('/api/users/fix-usernames', async (req, res) => {
  try {
    console.log('Fixing usernames for existing users...');
    
    const users = await User.find({});
    let updatedCount = 0;
    
    for (const user of users) {
      if (!user.username || user.username === '') {
        let newUsername = 'User';
        if (user.email) {
          newUsername = user.email.split('@')[0];
        }
        
        await User.findByIdAndUpdate(user._id, { username: newUsername });
        updatedCount++;
        console.log(`Updated user ${user._id}: ${newUsername}`);
      }
    }
    
    res.json({ 
      message: `Updated ${updatedCount} users with usernames`,
      updatedCount 
    });
  } catch (error) {
    console.error('Error fixing usernames:', error);
    res.status(500).json({ error: 'Error fixing usernames' });
  }
});

// Clerk sync endpoint from userRoutes.js
app.post('/api/users/clerk-sync', requireAuth(), async (req, res) => {
  try {
    const { clerkId, email, username, avatar } = req.body;
    if (!clerkId || !email) {
      return res.status(400).json({ error: 'clerkId và email là bắt buộc' });
    }
    let user = await User.findOne({ clerkId });
    if (user) {
      // Đã có user, trả về profile
      return res.json({
        user,
        message: 'User đã tồn tại, trả về profile.'
      });
    }
    
    // Generate username from email if not provided
    let finalUsername = username;
    if (!finalUsername && email) {
      finalUsername = email.split('@')[0]; // Use part before @ as username
    }
    
    // Nếu chưa có, tạo mới user với các trường mặc định
    user = await User.create({
      clerkId,
      email,
      username: finalUsername || 'User',
      avatar: avatar || '',
      badges: ['member'],
      bio: '',
      description: '',
      facebook: '',
      website: '',
      profile_email: '',
      vtuber_description: '',
      artist_description: ''
    });
    return res.status(201).json({
      user,
      message: 'Tạo user mới thành công.'
    });
  } catch (error) {
    console.error('Clerk sync error:', error);
    res.status(500).json({ error: 'Lỗi server khi đồng bộ user với Clerk.' });
  }
});

// Health check endpoint with origin validation info
app.get('/api/health', (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: isProduction ? 'production' : 'development',
    origin: {
      current: origin || 'No origin header',
      allowed: allowedOrigins,
      isValid: !origin || allowedOrigins.includes(origin)
    },
    cors: {
      enabled: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }
  });
});

// Routes

// Get all users (for artist profiles) - Moved to userRoutes.js
// This endpoint conflicts with search functionality in userRoutes.js
// Removed to fix search functionality

// Get users for voting (with optional badge filter) - MUST BE BEFORE /api/users/:id
app.get('/api/users/vote', async (req, res) => {
  try {
      // Silent vote endpoint
    
    const { badge } = req.query;
    let query = {};
    
    // Always filter by badges - if no badge specified, show users with any badge
    if (badge) {
      if (badge === 'vtuber') {
        query.badges = { $in: ['vtuber'] };
      } else if (badge === 'artist') {
        query.badges = { $in: ['verified'] };
      }
    } else {
      // If no badge filter, only show users who have either 'vtuber' or 'verified' badge
      query.badges = { $in: ['vtuber', 'verified'] };
    }
    
    console.log('MongoDB query object:', JSON.stringify(query));
    console.log('Mongoose connection readyState:', mongoose.connection.readyState);
    console.log('Mongoose connection name:', mongoose.connection.name);
    console.log('Mongoose connection host:', mongoose.connection.host);
    
    if (!mongoose.connection.readyState) {
      console.error('Database not connected');
      return res.status(500).json({ error: 'Database connection error' });
    }
    

    
    const users = await User.find(query)
      .select('username avatar bio badges vtuber_description artist_description')
      .sort({ username: 1 });
    
    res.json({ users });
    
  } catch (error) {
    console.error('=== /api/users/vote ERROR ===');
    console.error('Error object:', error);
    console.error('Error type:', typeof error);
    console.error('Error constructor:', error.constructor.name);
    
    if (error && error.stack) {
      console.error('Error stack:', error.stack);
    }
    if (error && error.name) {
      console.error('Error name:', error.name);
    }
    if (error && error.message) {
      console.error('Error message:', error.message);
    }
    if (error && error.code) {
      console.error('Error code:', error.code);
    }
    
    res.status(500).json({ 
      error: 'Lỗi server', 
      details: error.message,
      name: error.name,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

// Update user profile
app.put('/api/users/:id', requireAuth(), async (req, res) => {
  const userId = req.params.id;
  const { avatar, bio, facebook, zalo, phone, website, profile_email, vtuber_description, artist_description, description, youtube, twitch, tiktok } = req.body;



  // Tìm user theo _id hoặc clerkId
  let user = null;
  try {
    user = await User.findById(userId);
  } catch (e) {
    // Nếu userId không phải ObjectId, bỏ qua lỗi
  }
  if (!user) {
    user = await User.findOne({ clerkId: userId });
  }
  if (!user) {
    console.log('User not found:', userId);
    return res.status(404).json({ error: 'Người dùng không tồn tại' });
  }

  // Cho phép cập nhật nếu user._id == req.auth.userId hoặc user.clerkId == req.auth.userId
  if (user._id.toString() !== req.auth.userId && user.clerkId !== req.auth.userId) {
    console.log('Permission denied: userId', userId, 'userFromToken', req.auth.userId);
    return res.status(403).json({ error: 'Không có quyền cập nhật profile này' });
  }

  try {
    // Validate bio length (max 50 characters)
    if (bio && bio.length > 50) {
      return res.status(400).json({ error: 'Bio không được vượt quá 50 ký tự' });
    }

    // Update user fields
    const updateData = {
      avatar: avatar || user.avatar,
      banner: req.body.banner || user.banner,
      bio: bio || user.bio,
      description: description || user.description,
      facebook: facebook || user.facebook,
      zalo: zalo || user.zalo,
      phone: phone || user.phone,
      website: website || user.website,
      profile_email: profile_email || user.profile_email,
      vtuber_description: vtuber_description || user.vtuber_description,
      artist_description: artist_description || user.artist_description,
      youtube: youtube || user.youtube,
      twitch: twitch || user.twitch,
      tiktok: tiktok || user.tiktok,
      discord_id: req.body.discord_id || user.discord_id || '',
      discord: req.body.discord || user.discord || ''
    };

    // Ghi log chi tiết trước khi cập nhật


    const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true, runValidators: true });
    if (!updatedUser) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }
    
    res.json({ message: 'Cập nhật profile thành công' });
  } catch (error) {
    console.error('[PROFILE UPDATE ERROR] Lỗi khi cập nhật profile cho user', userId, ':', error);
    if (error.code === 11000) {
      console.error('Unexpected duplicate key error:', error);
      return res.status(500).json({ error: 'Lỗi database không mong muốn. Vui lòng thử lại.' });
    }
    res.status(500).json({ error: 'Lỗi khi cập nhật profile: ' + error.message });
  }
});

// Commission routes are now handled by commissionRoutes.js

// Confirm order (artist confirms)
app.put('/api/orders/:id/confirm', requireAuth(), async (req, res) => {
  console.log('=== ARTIST CONFIRM ORDER ===');
  console.log('Order ID:', req.params.id);
  console.log('User ID:', req.auth.userId);
  console.log('Request body:', req.body);
  
  try {
    const order = await Order.findById(req.params.id).populate('commission');
    console.log('Found order:', order ? {
      id: order._id,
      status: order.status,
      buyer: order.buyer,
      commission_user: order.commission?.user
    } : 'NOT FOUND');   
    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    // Find user by clerkId to get ObjectId
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Check if user is the commission owner (artist)
    const isArtist = order.commission.user.toString() === currentUser._id.toString();
    console.log('Is user the artist?', isArtist);
    console.log('Order commission user:', order.commission.user);
    console.log('Current user ObjectId:', currentUser._id);
    
    if (!isArtist) {
      console.log('User is not the artist - FORBIDDEN');
      return res.status(403).json({ error: 'Không có quyền xác nhận đơn hàng này' });
    }
    
    console.log('Current order status:', order.status);
    if (order.status !== 'pending') {
      console.log('Order status is not pending - BAD REQUEST');
      return res.status(400).json({ error: 'Đơn hàng đã được xử lý' });
    }
    
    order.status = 'confirmed';
    order.confirmed_at = new Date();
    await order.save();
    console.log('Order status updated to confirmed');
    
    // Update commission status
    const commission = order.commission;
    commission.status = 'in_progress';
    await commission.save();
    console.log('Commission status updated to in_progress');
    
    console.log('=== ARTIST CONFIRM ORDER SUCCESS ===');
    res.json({ message: 'Xác nhận đơn hàng thành công' });
  } catch (error) {
    console.error('=== ARTIST CONFIRM ORDER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Complete order (artist marks as completed)
app.put('/api/orders/:id/complete', requireAuth(), async (req, res) => {
  console.log('=== ARTIST COMPLETE ORDER ===');
  console.log('Order ID:', req.params.id);
  console.log('User ID:', req.auth.userId);
  console.log('Request body:', req.body);
  
  try {
    const order = await Order.findById(req.params.id).populate('commission');
    console.log('Found order:', order ? {
      id: order._id,
      status: order.status,
      buyer: order.buyer,
      commission_user: order.commission?.user
    } : 'NOT FOUND');   
    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    // Find user by clerkId to get ObjectId
    const currentUser = await User.findOne({ clerkId: req.auth.userId });
    if (!currentUser) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Check if user is the commission owner (artist)
    const isArtist = order.commission.user.toString() === currentUser._id.toString();
    console.log('Is user the artist?', isArtist);
    console.log('Order commission user:', order.commission.user);
    console.log('Current user ObjectId:', currentUser._id);
    
    if (!isArtist) {
      console.log('User is not the artist - FORBIDDEN');
      return res.status(403).json({ error: 'Không có quyền hoàn thành đơn hàng này' });
    }
    
    console.log('Current order status:', order.status);
    if (!['confirmed', 'customer_rejected', 'in_progress'].includes(order.status)) {
      console.log('Order status not allowed for completion - BAD REQUEST');
      return res.status(400).json({ error: 'Đơn hàng chưa được xác nhận hoặc không thể hoàn thành' });
    }
    
    order.status = 'waiting_customer_confirmation';
    order.completed_at = new Date();
    await order.save();
    console.log('Order status updated to waiting_customer_confirmation');
    
    // Update commission status
    const commission = order.commission;
    commission.status = 'waiting_customer_confirmation';
    await commission.save();
    console.log('Commission status updated to waiting_customer_confirmation');
    
    console.log('=== ARTIST COMPLETE ORDER SUCCESS ===');
    res.json({ message: 'Đã đánh dấu hoàn thành. Chờ khách hàng xác nhận để hoàn tất đơn hàng.', requiresCustomerConfirmation: true });
  } catch (error) {
    console.error('=== ARTIST COMPLETE ORDER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Customer confirms completion
app.put('/api/orders/:id/customer-confirm', requireAuth(), async (req, res) => {
  console.log('=== CUSTOMER CONFIRM ORDER ===');
  console.log('Order ID:', req.params.id);
  console.log('User ID:', req.auth.userId);
  console.log('Request body:', req.body);
  
  try {
    const order = await Order.findById(req.params.id).populate('commission');
    console.log('Found order:', order ? {
      id: order._id,
      status: order.status,
      buyer: order.buyer,
      commission_user: order.commission?.user
    } : 'NOT FOUND');   
    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    // Check if user is the buyer (customer)
    const isCustomer = order.buyer === req.auth.userId;
    console.log('Is user the customer?', isCustomer);
    console.log('Order buyer:', order.buyer);
    console.log('Request user ID:', req.auth.userId);
    
    if (!isCustomer) {
      console.log('User is not the customer - FORBIDDEN');
      return res.status(403).json({ error: 'Không có quyền xác nhận đơn hàng này' });
    }
    
    console.log('Current order status:', order.status);
    if (order.status !== 'waiting_customer_confirmation') {
      console.log('Order status not waiting for customer confirmation - BAD REQUEST');
      return res.status(400).json({ error: 'Đơn hàng chưa sẵn sàng để xác nhận' });
    }
    
    order.status = 'completed';
    order.customer_confirmed = true;
    await order.save();
    console.log('Order status updated to completed');
    
    // Add feedback if provided
    const { feedback } = req.body;
    if (feedback && feedback.trim()) {
      // Find customer user by clerkId
      const customer = await User.findOne({ clerkId: req.auth.userId });
      if (customer) {
        const commission = await Commission.findById(order.commission._id);
        if (commission) {
          commission.feedback.push({
            user: customer._id,
            comment: feedback.trim().substring(0, 200), // Ensure max 200 characters
            createdAt: new Date()
          });
          await commission.save();
          console.log('Feedback added to commission');
        }
      }
    }
    
    // Update commission status
    const commission = order.commission;
    commission.status = 'completed';
    await commission.save();
    console.log('Commission status updated to completed');
    
    console.log('=== CUSTOMER CONFIRM ORDER SUCCESS ===');
    res.json({ message: 'Xác nhận hoàn thành thành công. Đơn hàng đã hoàn tất!' });
  } catch (error) {
    console.error('=== CUSTOMER CONFIRM ORDER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Customer cancels order
app.put('/api/orders/:id/cancel', requireAuth(), async (req, res) => {
  console.log('=== CUSTOMER CANCEL ORDER ===');
  console.log('Order ID:', req.params.id);
  console.log('User ID:', req.auth.userId);
  console.log('Request body:', req.body);
  
  try {
    const order = await Order.findById(req.params.id).populate('commission');
    console.log('Found order:', order ? {
      id: order._id,
      status: order.status,
      buyer: order.buyer,
      commission_user: order.commission?.user
    } : 'NOT FOUND');   
    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    // Check if user is the buyer (customer)
    const isCustomer = order.buyer === req.auth.userId;
    console.log('Is user the customer?', isCustomer);
    console.log('Order buyer:', order.buyer);
    console.log('Request user ID:', req.auth.userId);
    
    if (!isCustomer) {
      console.log('User is not the customer - FORBIDDEN');
      return res.status(403).json({ error: 'Không có quyền hủy đơn hàng này' });
    }
    
    console.log('Current order status:', order.status);
    if (order.status !== 'pending') {
      console.log('Order status not pending - BAD REQUEST');
      return res.status(400).json({ error: 'Không thể hủy đơn hàng đã được xác nhận hoặc đang thực hiện' });
    }
    
    order.status = 'cancelled';
    await order.save();
    console.log('Order status updated to cancelled');
    
    // Nếu không còn active order nào thì mở lại commission
    const activeOrders = await Order.countDocuments({ 
      commission: order.commission._id, 
      status: { $in: ['pending', 'confirmed', 'waiting_customer_confirmation', 'customer_rejected'] } 
    });
    console.log('Active orders count:', activeOrders);
    
    if (activeOrders === 0) {
      const commission = order.commission;
      commission.status = 'open';
      await commission.save();
      console.log('Commission status updated to open (no active orders)');
    }
    
    console.log('=== CUSTOMER CANCEL ORDER SUCCESS ===');
    res.json({ message: 'Hủy đơn hàng thành công' });
  } catch (error) {
    console.error('=== CUSTOMER CANCEL ORDER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Customer rejects completion
app.put('/api/orders/:id/reject', requireAuth(), async (req, res) => {
  console.log('=== CUSTOMER REJECT ORDER ===');
  console.log('Order ID:', req.params.id);
  console.log('User ID:', req.auth.userId);
  console.log('Request body:', req.body);
  
  try {
    const { rejection_reason } = req.body;
    console.log('Rejection reason:', rejection_reason);
    
    const order = await Order.findById(req.params.id).populate('commission');
    console.log('Found order:', order ? {
      id: order._id,
      status: order.status,
      buyer: order.buyer,
      commission_user: order.commission?.user
    } : 'NOT FOUND');   
    if (!order) {
      console.log('Order not found');
      return res.status(404).json({ error: 'Đơn hàng không tồn tại' });
    }
    
    // Check if user is the buyer (customer)
    const isCustomer = order.buyer === req.auth.userId;
    console.log('Is user the customer?', isCustomer);
    console.log('Order buyer:', order.buyer);
    console.log('Request user ID:', req.auth.userId);
    
    if (!isCustomer) {
      console.log('User is not the customer - FORBIDDEN');
      return res.status(403).json({ error: 'Không có quyền từ chối đơn hàng này' });
    }
    
    console.log('Current order status:', order.status);
    if (order.status !== 'waiting_customer_confirmation') {
      console.log('Order status not waiting for customer confirmation - BAD REQUEST');
      return res.status(400).json({ error: 'Đơn hàng chưa sẵn sàng để từ chối' });
    }
    
    order.status = 'customer_rejected';
    order.rejection_reason = rejection_reason || 'Khách hàng từ chối xác nhận hoàn thành';
    await order.save();
    console.log('Order status updated to customer_rejected');
    console.log('Rejection reason saved:', order.rejection_reason);
    
    // Update commission status
    const commission = order.commission;
    commission.status = 'in_progress';
    await commission.save();
    console.log('Commission status updated to in_progress');
    
    console.log('=== CUSTOMER REJECT ORDER SUCCESS ===');
    res.json({ message: 'Đã từ chối xác nhận hoàn thành. Artist sẽ được thông báo để chỉnh sửa.' });
  } catch (error) {
    console.error('=== CUSTOMER REJECT ORDER ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Lỗi server' });
  }
});



// Auto-cancel pending orders after 7 days (optional endpoint for cleanup)
app.put('/api/orders/auto-cancel-pending', async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Find pending orders older than 7 days
    const pendingOrders = await Order.find({
      status: 'pending',
      created_at: { $lt: sevenDaysAgo }
    }).populate('commission_id');
    
    let cancelledCount = 0;
    
    for (const order of pendingOrders) {
      order.status = 'cancelled';
      await order.save();
      cancelledCount++;
      
      // Check if commission should be reopened
      const activeOrders = await Order.countDocuments({ 
        commission_id: order.commission_id._id, 
        status: { $in: ['pending', 'confirmed', 'waiting_customer_confirmation', 'customer_rejected'] } 
      });
      
      if (activeOrders === 0) {
        const commission = order.commission_id;
        commission.status = 'open';
        await commission.save();
      }
    }
    
    res.json({ 
      message: `Đã tự động hủy ${cancelledCount} đơn hàng chờ xác nhận quá 7 ngày`,
      cancelledCount 
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Upload image to Cloudinary
app.post('/api/upload/image', requireAuth(), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không có file được upload' });
    }

    // Convert buffer to base64
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    // Xác định folder theo query param type
    let folder = 'vtuberverse/commission';
    if (req.query.type === 'avatar' || req.query.type === 'banner') {
      folder = 'vtuberverse/users';
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder,
      resource_type: 'auto',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });

    res.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      width: result.width,
      height: result.height
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Lỗi khi upload hình ảnh' });
  }
});

// Upload multiple images to Cloudinary
app.post('/api/upload/images', requireAuth(), upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Không có file được upload' });
    }

    // Xác định folder theo query param type
    let folder = 'vtuberverse/commission';
    if (req.query.type === 'avatar' || req.query.type === 'banner') {
      folder = 'vtuberverse/users';
    }

    const uploadPromises = req.files.map(async (file) => {
      const b64 = Buffer.from(file.buffer).toString('base64');
      const dataURI = `data:${file.mimetype};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataURI, {
        folder,
        resource_type: 'auto',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }
        ]
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height
      };
    });

    const results = await Promise.all(uploadPromises);

    res.json({
      success: true,
      images: results
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Lỗi khi upload hình ảnh' });
  }
});



// Simple rate limiting for uploads (in memory - for production use Redis)
const uploadRateLimit = new Map();
const UPLOAD_RATE_LIMIT = 10; // Max 10 uploads per hour per user
const UPLOAD_RATE_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

function checkUploadRateLimit(userId) {
  const now = Date.now();
  const userKey = `upload_${userId}`;
  
  if (!uploadRateLimit.has(userKey)) {
    uploadRateLimit.set(userKey, { count: 1, resetTime: now + UPLOAD_RATE_WINDOW });
    return true;
  }
  
  const userLimit = uploadRateLimit.get(userKey);
  
  // Reset if window expired
  if (now > userLimit.resetTime) {
    uploadRateLimit.set(userKey, { count: 1, resetTime: now + UPLOAD_RATE_WINDOW });
    return true;
  }
  
  // Check if within limit
  if (userLimit.count >= UPLOAD_RATE_LIMIT) {
    return false;
  }
  
  // Increment count
  userLimit.count++;
  return true;
}

// Upload media (image/video) to Cloudinary - up to 40MB
app.post('/api/upload/media', (req, res, next) => {
  console.log('=== UPLOAD MEDIA ENDPOINT STARTING ===');
  console.log('Headers:', {
    origin: req.headers.origin,
    referer: req.headers.referer,
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    authorization: req.headers.authorization ? 'Present' : 'Missing'
  });
  console.log('Query params:', req.query);
  
  // Additional security: Check for suspicious patterns
  const userAgent = req.headers['user-agent'] || '';
  const suspiciousPatterns = ['curl', 'wget', 'python-requests', 'postman'];
  const isSuspicious = suspiciousPatterns.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
  
  if (isSuspicious && !req.headers.origin && !req.headers.referer) {
    return res.status(403).json({ 
      error: 'Request không được phép',
      hint: 'Vui lòng sử dụng trình duyệt web'
    });
  }
  
  // Apply requireAuth with custom error handling
  requireAuth()(req, res, (err) => {
    if (err) {
      return res.status(401).json({ 
        error: 'Authentication failed', 
        details: err.message,
        hint: 'Kiểm tra token Clerk'
      });
    }
    
    // Apply rate limiting
    if (!checkUploadRateLimit(req.auth.userId)) {
      return res.status(429).json({
        error: 'Quá nhiều upload',
        message: 'Vui lòng chờ một chút trước khi upload tiếp',
        limit: `${UPLOAD_RATE_LIMIT} uploads per hour`
      });
    }
    
    next();
  });
}, (req, res, next) => {
  mediaUpload.single('media')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File quá lớn. Tối đa 40MB.' });
      }
      if (err.message.includes('file hình ảnh hoặc video')) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: 'Lỗi upload file: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  console.log('=== MEDIA UPLOAD ENDPOINT HIT ===');
  console.log('File:', req.file ? {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  } : 'NO FILE');
  console.log('User:', req.auth?.userId);
  console.log('Query:', req.query);
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không có file được upload' });
    }
    
    // Additional security: Validate file type more strictly
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/mov'];
    const allAllowedTypes = [...allowedImageTypes, ...allowedVideoTypes];
    
    if (!allAllowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: 'Loại file không được hỗ trợ',
        allowed: 'Chỉ chấp nhận: JPEG, PNG, WebP, GIF, MP4, WebM, OGG, MOV'
      });
    }
    
    // Additional security: Check file size limits by type
    const maxImageSize = 5 * 1024 * 1024; // 5MB for images
    const maxVideoSize = 40 * 1024 * 1024; // 40MB for videos
    
    if (req.file.mimetype.startsWith('image/') && req.file.size > maxImageSize) {
      return res.status(400).json({ error: 'Ảnh tối đa 5MB' });
    }
    
    if (req.file.mimetype.startsWith('video/') && req.file.size > maxVideoSize) {
      return res.status(400).json({ error: 'Video tối đa 40MB' });
    }

    // Convert buffer to base64
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    // Determine resource type
    const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    
    // Xác định folder theo query param type
    let folder = 'vtuberverse/commission';
    if (req.query.type === 'avatar' || req.query.type === 'banner') {
      folder = 'vtuberverse/users';
    }

    // Upload to Cloudinary with appropriate settings
    const uploadOptions = {
      folder,
      resource_type: resourceType,
    };

    // Add transformations based on file type
    if (resourceType === 'image') {
      uploadOptions.transformation = [
        { quality: 'auto', fetch_format: 'auto' }
      ];
    } else if (resourceType === 'video') {
      uploadOptions.transformation = [
        { quality: 'auto' }
      ];
    }

    const result = await cloudinary.uploader.upload(dataURI, uploadOptions);

    res.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: resourceType,
      width: result.width,
      height: result.height,
      duration: result.duration, // For videos
      format: result.format,
      bytes: result.bytes
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi upload media: ' + error.message });
  }
});

// Delete image from Cloudinary
app.delete('/api/upload/image/:public_id', requireAuth(), async (req, res) => {
  try {
    const { public_id } = req.params;
    
    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type: 'image'
    });
    
    if (result.result === 'ok') {
      res.json({ success: true, message: 'Xóa hình ảnh thành công' });
    } else {
      res.status(400).json({ error: 'Không thể xóa hình ảnh' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi xóa hình ảnh' });
  }
});

// Delete video from Cloudinary
app.delete('/api/upload/video/:public_id', requireAuth(), async (req, res) => {
  try {
    const { public_id } = req.params;
    
    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type: 'video'
    });
    
    if (result.result === 'ok') {
      res.json({ success: true, message: 'Xóa video thành công' });
    } else {
      res.status(400).json({ error: 'Không thể xóa video' });
    }
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Lỗi khi xóa video' });
  }
});

// Delete image from Cloudinary by URL
app.delete('/api/upload/image-by-url', requireAuth(), async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }
    
    const publicId = extractPublicIdFromCloudinaryUrl(imageUrl);
    
    if (!publicId) {
      return res.status(400).json({ error: 'Invalid Cloudinary URL' });
    }
    
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      res.json({ success: true, message: 'Xóa hình ảnh thành công', publicId });
    } else {
      res.status(400).json({ error: 'Không thể xóa hình ảnh' });
    }
  } catch (error) {
    console.error('Delete image by URL error:', error);
    res.status(500).json({ error: 'Lỗi khi xóa hình ảnh' });
  }
});

// Delete video from Cloudinary by URL
app.delete('/api/upload/video-by-url', requireAuth(), async (req, res) => {
  try {
    const { videoUrl } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ error: 'Video URL is required' });
    }
    
    const publicId = extractPublicIdFromCloudinaryUrl(videoUrl);
    
    if (!publicId) {
      return res.status(400).json({ error: 'Invalid Cloudinary URL' });
    }
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'video'
    });
    
    if (result.result === 'ok') {
      res.json({ success: true, message: 'Xóa video thành công', publicId });
    } else {
      res.status(400).json({ error: 'Không thể xóa video' });
    }
  } catch (error) {
    console.error('Delete video by URL error:', error);
    res.status(500).json({ error: 'Lỗi khi xóa video' });
  }
});

// Vote for a VTuber (1 vote per day per user)
app.post('/api/vote/vtuber', requireAuth(), async (req, res) => {
  try {
    const { voted_vtuber_id } = req.body;
    const voter_id = req.auth.userId;

    if (!voted_vtuber_id) {
      return res.status(400).json({ error: 'Vui lòng chọn VTuber để vote' });
    }

    // Check if voted user exists and has VTuber badge
    let votedUser = null;
    try {
      votedUser = await User.findById(voted_vtuber_id);
    } catch (e) {}
    if (!votedUser) {
      votedUser = await User.findOne({ clerkId: voted_vtuber_id });
    }
    if (!votedUser) {
      return res.status(404).json({ error: 'VTuber không tồn tại' });
    }

    if (!votedUser.badges || !votedUser.badges.includes('vtuber')) {
      return res.status(400).json({ error: 'Chỉ có thể vote cho user có badge VTuber' });
    }

    // Check if voter is trying to vote for themselves (so sánh với cả _id và clerkId)
    if (voter_id === votedUser._id.toString() || voter_id === votedUser.clerkId) {
      return res.status(400).json({ error: 'Không thể vote cho chính mình' });
    }

    // Check if user has already voted today for VTuber
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingVote = await Vote.findOne({
      voter_id,
      vote_type: 'vtuber',
      created_at: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (existingVote) {
      return res.status(400).json({ error: 'Bạn đã vote VTuber hôm nay. Vui lòng thử lại vào ngày mai' });
    }

    // Create new vote
    const newVote = await Vote.create({
      voter_id,
      voted_vtuber_id: votedUser._id,
      vote_type: 'vtuber',
      created_at: new Date()
    });

    res.status(201).json({
      message: 'Vote VTuber thành công!',
      vote: newVote
    });

  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Vote for an Artist (1 vote per day per user)
app.post('/api/vote/artist', requireAuth(), async (req, res) => {
  try {
    const { voted_artist_id } = req.body;
    const voter_id = req.auth.userId;

    if (!voted_artist_id) {
      return res.status(400).json({ error: 'Vui lòng chọn Artist để vote' });
    }

    // Check if voted user exists and has Artist badge
    let votedUser = null;
    try {
      votedUser = await User.findById(voted_artist_id);
    } catch (e) {}
    if (!votedUser) {
      votedUser = await User.findOne({ clerkId: voted_artist_id });
    }
    if (!votedUser) {
      return res.status(404).json({ error: 'Artist không tồn tại' });
    }

    const validArtistBadges = ['verified', 'trusted', 'quality', 'partner'];
    if (!votedUser.badges || !votedUser.badges.some(badge => validArtistBadges.includes(badge))) {
      return res.status(400).json({ error: 'Chỉ có thể vote cho user có badge Artist hợp lệ' });
    }

    // Check if voter is trying to vote for themselves (so sánh với cả _id và clerkId)
    if (voter_id === votedUser._id.toString() || voter_id === votedUser.clerkId) {
      return res.status(400).json({ error: 'Không thể vote cho chính mình' });
    }

    // Check if user has already voted today for Artist
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingVote = await Vote.findOne({
      voter_id,
      vote_type: 'artist',
      created_at: {
        $gte: today,
        $lt: tomorrow
      }
    });

    if (existingVote) {
      return res.status(400).json({ error: 'Bạn đã vote Artist hôm nay. Vui lòng thử lại vào ngày mai' });
    }

    // Create new vote
    const newVote = await Vote.create({
      voter_id,
      voted_artist_id: votedUser._id,
      vote_type: 'artist',
      created_at: new Date()
    });

    res.status(201).json({
      message: 'Vote Artist thành công!',
      vote: newVote
    });

  } catch (error) {
    console.error('Vote artist error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Get VTuber spotlight (top 5 VTubers by votes)
app.get('/api/spotlight/vtubers', async (req, res) => {
  try {
    // Get top 5 VTubers by vote count
    const topVTubers = await Vote.aggregate([
      {
        $match: {
          vote_type: 'vtuber',
          voted_vtuber_id: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$voted_vtuber_id',
          voteCount: { $sum: 1 }
        }
      },
      {
        $sort: { voteCount: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'vtuber'
        }
      },
      {
        $unwind: '$vtuber'
      },
      {
        $match: {
          'vtuber.badges': { $in: ['vtuber'] }
        }
      },
      {
        $project: {
          _id: '$vtuber._id',
          voteCount: 1,
          username: '$vtuber.username',
          avatar: '$vtuber.avatar',
          banner: '$vtuber.banner',
          bio: '$vtuber.bio',
          vtuber_description: '$vtuber.vtuber_description',
          badges: '$vtuber.badges'
        }
      }
    ]);

    res.json({
      spotlight: topVTubers
    });

  } catch (error) {
    console.error('Spotlight error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Get Artist spotlight (top 5 Artists by votes)
app.get('/api/spotlight/artists', async (req, res) => {
  try {
    // Get top 5 Artists by vote count
    const topArtists = await Vote.aggregate([
      {
        $match: {
          vote_type: 'artist',
          voted_artist_id: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$voted_artist_id',
          voteCount: { $sum: 1 }
        }
      },
      {
        $sort: { voteCount: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'artist'
        }
      },
      {
        $unwind: '$artist'
      },
      {
        $match: {
          'artist.badges': { $in: ['verified', 'trusted', 'quality', 'partner'] }
        }
      },
      {
        $project: {
          _id: '$artist._id',
          voteCount: 1,
          username: '$artist.username',
          avatar: '$artist.avatar',
          banner: '$artist.banner',
          bio: '$artist.bio',
          artist_description: '$artist.artist_description',
          badges: '$artist.badges'
        }
      }
    ]);

    res.json({
      spotlight: topArtists
    });

  } catch (error) {
    console.error('Spotlight artists error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Get user's vote status for today
app.get('/api/vote/status', requireAuth(), async (req, res) => {
  try {
    const voter_id = req.auth.userId;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's votes for both VTuber and Artist
    const todayVotes = await Vote.find({
      voter_id,
      created_at: {
        $gte: today,
        $lt: tomorrow
      }
    }).populate('voted_vtuber_id voted_artist_id', 'username avatar');

    const vtuberVote = todayVotes.find(vote => vote.vote_type === 'vtuber');
    const artistVote = todayVotes.find(vote => vote.vote_type === 'artist');

    res.json({
      vtuber: {
        hasVotedToday: !!vtuberVote,
        todayVote: vtuberVote ? {
          voted_user: vtuberVote.voted_vtuber_id,
          created_at: vtuberVote.created_at
        } : null
      },
      artist: {
        hasVotedToday: !!artistVote,
        todayVote: artistVote ? {
          voted_user: artistVote.voted_artist_id,
          created_at: artistVote.created_at
        } : null
      }
    });

  } catch (error) {
    console.error('Vote status error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Get all VTubers (users with vtuber badge)
app.get('/api/vtubers', async (req, res) => {
  try {
    const vtubers = await User.find({ badges: { $in: ['vtuber'] } })
      .select('username avatar bio')
      .sort({ username: 1 });

    res.json({
      vtubers
    });

  } catch (error) {
    console.error('Get VTubers error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Feedback endpoints
app.post('/api/feedback', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Tất cả các trường đều bắt buộc' });
    }

    const feedback = await Feedback.create({
      name,
      email,
      subject,
      message,
      created_at: new Date()
    });

    res.status(201).json({
      message: 'Feedback đã được gửi thành công',
      feedback
    });

  } catch (error) {
    console.error('Feedback creation error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.get('/api/feedback', requireAuth(), async (req, res) => {
  try {
    // Only admin can view all feedback
    const user = await User.findOne({ clerkId: req.auth.userId });
    
    if (!user || user.email !== 'huynguyen86297@gmail.com') {
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    }

    const feedbacks = await Feedback.find()
      .populate('user_id', 'username avatar')
      .sort({ created_at: -1 });

    res.json({
      feedbacks
    });

  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.delete('/api/feedback/:id', requireAuth(), async (req, res) => {
  try {
    // Only admin can delete feedback
    const user = await User.findOne({ clerkId: req.auth.userId });
    if (!user || user.email !== 'huynguyen86297@gmail.com') {
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    }

    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback không tồn tại' });
    }

    res.json({
      message: 'Feedback đã được xóa thành công'
    });

  } catch (error) {
    console.error('Delete feedback error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});





// Clerk sync endpoint from userRoutes.js
// (ĐÃ CÓ TRONG ROUTER userRoutes.js, KHÔNG CẦN ĐỊNH NGHĨA LẠI Ở ĐÂY)

// Mount userRoutes (ưu tiên /clerk/:clerkId trước /:id)
app.use('/api/users', require('./routes/userRoutes'));

// Mount commissionRoutes
app.use('/api/commissions', require('./routes/commissionRoutes'));

// Mount orderRoutes
app.use('/api/orders', require('./routes/orderRoutes'));

// Mount collabRoutes
app.use('/api/collabs', require('./routes/collabRoutes'));

// Mount donateRoutes
app.use('/api/donate', require('./routes/donateRoutes'));

// Mount Casso webhook route
app.use('/api/casso-webhook', require('./donate/xulinaptien'));

// Serve donate page
app.use('/donate', express.static(path.join(__dirname, 'public/donate')));
app.get('/donate', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/donate/donate.html'));
});

// Serve user donation pages
app.get('/donation/:userId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/donate/user-donation.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// 404 handler for unmatched routes
app.use((req, res, next) => {
  console.log(`=== 404 ERROR ===`);
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.path}`);
  console.log(`Full URL: ${req.originalUrl}`);
  console.log(`Headers:`, {
    origin: req.headers.origin,
    referer: req.headers.referer,
    'user-agent': req.headers['user-agent']?.substring(0, 100)
  });
  
  res.status(404).json({
    error: 'Endpoint không tìm thấy',
    method: req.method,
    path: req.path,
    message: `Không tìm thấy route ${req.method} ${req.path}`,
    availableRoutes: {
      upload: 'POST /api/upload/media',
  
      commissions: 'GET /api/commissions',
      createCommission: 'POST /api/commissions'
    }
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('=== GLOBAL ERROR HANDLER ===');
  console.error('Error:', error);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);
  
  res.status(500).json({
    error: 'Lỗi server nội bộ',
    message: error.message,
    path: req.path,
    method: req.method
  });
});

// Background task to update collab status every 30 seconds
let isUpdating = false; // Prevent concurrent updates

const updateCollabStatuses = async () => {
  if (isUpdating) {
    console.log('=== Skipping update - previous update still running ===');
    return;
  }

  try {
    isUpdating = true;
    console.log('=== Updating collab statuses ===');
    
    const now = new Date();
    
    // Helper function to calculate check interval based on time remaining
    const getCheckInterval = (scheduledStartTime) => {
      if (!scheduledStartTime) return 10 * 60 * 1000; // Default 10 minutes
      
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
    };
    
    // Get all collabs that need updating based on dynamic intervals
    const allCollabs = await Collab.find({
      status: { $in: ['open', 'setting_up', 'in_progress'] }
    }).limit(20);
    
    // Filter collabs based on their check interval
    const collabsToUpdate = allCollabs.filter(collab => {
      const scheduledStartTime = collab.stream_info_1?.scheduledStartTime;
      const checkInterval = getCheckInterval(scheduledStartTime);
      const lastCheck = collab.lastStatusCheck || new Date(0);
      const timeSinceLastCheck = now - lastCheck;
      
      return timeSinceLastCheck >= checkInterval;
    });
    console.log(`Found ${collabsToUpdate.length} collabs to update out of ${allCollabs.length} total collabs`);
    
    if (collabsToUpdate.length === 0) {
      console.log('No collabs need updating');
      return;
    }
    
    // Process collabs in batches to avoid rate limiting
    const batchSize = 3;
    for (let i = 0; i < collabsToUpdate.length; i += batchSize) {
      const batch = collabsToUpdate.slice(i, i + batchSize);
      
      await Promise.allSettled(batch.map(async (collab) => {
        try {
          const youtubeService = require('./services/youtubeService');
          const updateData = { lastStatusCheck: new Date() };
          
          // Check each partner's YouTube link and update their stream info
          const partners = [
            { link: collab.youtube_link_1, field: 'stream_info_1' }, // Creator
            { link: collab.youtube_link_1_partner, field: 'stream_info_1_partner' }, // Partner 1
            { link: collab.youtube_link_2, field: 'stream_info_2' }, // Partner 2
            { link: collab.youtube_link_3, field: 'stream_info_3' }  // Partner 3
          ];
          
          let hasLiveStream = false;
          let hasWaitingRoom = false;
          
          for (const partner of partners) {
            if (partner.link) {
              try {
                const videoId = youtubeService.extractVideoId(partner.link);
                if (videoId) {
                  // Use dynamic cache timeout based on time remaining for open collabs
                  let cacheTimeout = 5 * 60 * 1000; // default 5 min
                  if (collab.status === 'in_progress') {
                    cacheTimeout = 1 * 60 * 1000; // 1 min for in_progress
                  } else if (collab.status === 'open' || collab.status === 'setting_up') {
                    // Use dynamic interval based on scheduledStartTime
                    const scheduledStartTime = collab.stream_info_1?.scheduledStartTime;
                    cacheTimeout = getCheckInterval(scheduledStartTime);
                  }
                  
                  const streamStatus = await youtubeService.checkStreamStatus(videoId, cacheTimeout);
                  
                  // Nếu là creator và collab đang open, kiểm tra hợp lệ
                  if (collab.status === 'open' && partner.field === 'stream_info_1') {
                    if (!streamStatus.isValid || (!streamStatus.isWaitingRoom && !streamStatus.isLive)) {
                      await Collab.findByIdAndUpdate(collab._id, {
                        status: 'cancelled',
                        endedAt: new Date(),
                        lastStatusCheck: new Date()
                      });
                      return;
                    }
                  }
                  
                  // Update this partner's stream info
                  updateData[partner.field] = {
                    isLive: streamStatus.isLive,
                    viewCount: streamStatus.viewCount || 0,
                    title: streamStatus.title || '',
                    thumbnail: streamStatus.thumbnail || '',
                    scheduledStartTime: streamStatus.scheduledStartTime || null
                  };
                  
                  // Cập nhật time_remaining nếu đây là stream của creator (stream_info_1)
                  if (partner.field === 'stream_info_1' && streamStatus.scheduledStartTime) {
                    const now = new Date();
                    const scheduledStart = new Date(streamStatus.scheduledStartTime);
                    const time_remaining = scheduledStart.getTime() - now.getTime();
                    updateData.time_remaining = time_remaining > 0 ? time_remaining : null;
                  }
                  
                  if (streamStatus.isValid && streamStatus.isLive) {
                    hasLiveStream = true;
                  } else if (streamStatus.isValid && streamStatus.isWaitingRoom) {
                    hasWaitingRoom = true;
                  }
                }
              } catch (error) {
                console.error(`Error checking stream for ${partner.field}:`, error.message);
              }
            }
          }
          
          // Update all stream info at once
          await Collab.findByIdAndUpdate(collab._id, updateData);
          
                        // Update status based on conditions
              const currentPartners = [collab.partner_2, collab.partner_3].filter(Boolean).length;
              const hasAtLeastOnePartner = currentPartners >= 1;
          
          if (hasLiveStream) {
            if (hasAtLeastOnePartner) {
              await Collab.findByIdAndUpdate(collab._id, {
                status: 'in_progress',
                startedAt: collab.startedAt || new Date(),
                lastStatusCheck: new Date()
              });
            } else {
              await Collab.findByIdAndUpdate(collab._id, {
                status: 'cancelled',
                endedAt: new Date(),
                lastStatusCheck: new Date()
              });
            }
          } else if (hasWaitingRoom) {
            if (currentPartners >= collab.maxPartners) {
              await Collab.findByIdAndUpdate(collab._id, {
                status: 'in_progress',
                startedAt: collab.startedAt || new Date(),
                lastStatusCheck: new Date()
              });
            } else {
              await Collab.findByIdAndUpdate(collab._id, {
                lastStatusCheck: new Date()
              });
            }
          } else if (!hasLiveStream && !hasWaitingRoom) {
            // Check if any stream has ended
            const allStreamsEnded = partners.every(partner => {
              if (!partner.link) return true; // No link means no stream to check
              const streamInfo = updateData[partner.field];
              return streamInfo && !streamInfo.isLive;
            });
            
            if (allStreamsEnded) {
              await Collab.findByIdAndUpdate(collab._id, {
                status: 'ended',
                endedAt: new Date(),
                lastStatusCheck: new Date()
              });
            }
          }
        } catch (error) {
          console.error(`Error updating collab ${collab._id}:`, error.message);
        }
      }));
      
      // Wait between batches to avoid rate limiting
      if (i + batchSize < collabsToUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds delay
      }
    }
    
    // Clean up ended collabs after 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const endedCollabs = await Collab.find({
      status: 'ended',
      endedAt: { $lt: oneHourAgo }
    });
    
    if (endedCollabs.length > 0) {
      console.log(`Cleaning up ${endedCollabs.length} ended collabs`);
      await Collab.deleteMany({
        status: 'ended',
        endedAt: { $lt: oneHourAgo }
      });
    }
    
  } catch (error) {
    console.error('Error in collab status update task:', error);
  } finally {
    isUpdating = false;
  }
};

// Start background task
setInterval(updateCollabStatuses, 30000); // Every 30 seconds - checks collab status and updates based on timing rules

// ==================== STREAM SCHEDULE CRON JOBS ====================

// Reset all stream schedules every Monday at 00:00 (Vietnam time)
const resetStreamSchedules = async () => {
  try {
    console.log('Running stream schedule reset task...');
    
    // Get current time in Vietnam timezone (UTC+7)
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    
    // Check if it's Monday 00:00
    if (vietnamTime.getDay() === 1 && vietnamTime.getHours() === 0 && vietnamTime.getMinutes() < 5) {
      console.log('Resetting all stream schedules...');
      
      // Clear all stream schedules
      const result = await User.updateMany(
        { streamSchedule: { $exists: true, $ne: [] } },
        { $set: { streamSchedule: [] } }
      );
      
      console.log(`Reset ${result.modifiedCount} users' stream schedules`);
    }
  } catch (error) {
    console.error('Error in stream schedule reset task:', error);
  }
};

// Stream status update logic removed - no longer needed

// Start stream schedule cron jobs
setInterval(resetStreamSchedules, 60000); // Check every minute for Monday reset



// Initialize Discord bot and donate functionality
async function initializeDonateSystem() {
  try {
    // Initialize Discord bot (will skip if no token configured)
    try {
      await discordBotService.initialize();
      console.log('Discord bot initialized successfully');
    } catch (error) {
      console.log('Discord bot initialization skipped (no valid token configured)');
    }
    
    // Start donation cleanup service
    try {
      await donationCleanupService.start();
      console.log('Donation cleanup service started');
    } catch (error) {
      console.log('Donation cleanup service initialization skipped');
    }
    
    console.log('Donate system initialized successfully');
  } catch (error) {
    console.error('Error initializing donate system:', error);
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Server accessible from other machines on the network`);
  console.log(`CORS Enabled with security restrictions`);
  console.log(`Collab status update task started (every 30 seconds - dynamic intervals based on time remaining)`);
  console.log(`Stream schedule reset task started (every Monday 00:00 Vietnam time)`);
  
  // Initialize donate system after server starts
  initializeDonateSystem();
}); 