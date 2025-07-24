const express = require('express');
const Commission = require('../models/Commission');
const User = require('../models/User');
const { requireAuth } = require('@clerk/express');
const Order = require('../models/Order'); // Đảm bảo đã require model Order
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose'); // Added for MongoDB connection check

const router = express.Router();

// Helper function to extract public_id from Cloudinary URL
function extractPublicIdFromCloudinaryUrl(url) {
  if (!url || !url.includes('cloudinary.com')) {
    return null;
  }
  
  try {
    // Cloudinary URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/filename.jpg
    // Or: https://res.cloudinary.com/cloud_name/video/upload/v1234567890/folder/filename.mp4
    const urlParts = url.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    if (uploadIndex === -1) return null;
    
    // Get everything after 'upload/v1234567890/' or 'upload/'
    const pathAfterUpload = urlParts.slice(uploadIndex + 1);
    if (pathAfterUpload.length === 0) return null;
    
    // Skip version if present (starts with 'v' followed by numbers)
    const startIndex = pathAfterUpload[0].match(/^v\d+$/) ? 1 : 0;
    const publicIdParts = pathAfterUpload.slice(startIndex);
    
    // Join and remove file extension for images, but keep for videos
    let publicId = publicIdParts.join('/');
    
    // For images, remove extension. For videos, keep extension
    if (url.includes('/image/')) {
      publicId = publicId.replace(/\.[^/.]+$/, '');
    }
    
    return publicId;
  } catch (error) {
    return null;
  }
}

// Helper function to delete files from Cloudinary
async function deleteCloudinaryFiles(urls) {
  const deletePromises = urls.map(async (url) => {
    try {
      const publicId = extractPublicIdFromCloudinaryUrl(url);
      if (publicId) {
        const result = await cloudinary.uploader.destroy(publicId);
        return { url, publicId, result };
      }
      return { url, publicId: null, result: 'no_public_id' };
    } catch (error) {
      return { url, error: error.message };
    }
  });
  
  return Promise.all(deletePromises);
}

// Delete image from Cloudinary
async function deleteFromCloudinary(publicId) {
  try {
    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return null;
    }
    
    // Determine resource type from publicId or URL
    let resourceType = 'image'; // default
    if (publicId.includes('video') || publicId.match(/\.(mp4|webm|ogg|mov|avi)$/i)) {
      resourceType = 'video';
    }
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    
    return result;
  } catch (error) {
    return null;
  }
}

// Use requireAuth() for all protected routes:
// router.post('/', requireAuth(), ...)

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Commission routes are working!',
    timestamp: new Date().toISOString(),
    mongodbState: mongoose.connection.readyState
  });
});

// Test endpoint to check commission data
router.get('/test/data', async (req, res) => {
  try {
    console.log('Testing commission data...');
    
    // Get raw commission count
    const count = await Commission.countDocuments();
    console.log('Total commissions in database:', count);
    
    // Get a sample commission without populate
    const sampleCommission = await Commission.findOne().lean();
    console.log('Sample commission (no populate):', sampleCommission);
    
    // Get a sample commission with populate
    const sampleCommissionWithUser = await Commission.findOne().populate('user').lean();
    console.log('Sample commission (with populate):', sampleCommissionWithUser);
    
    // Get all users
    const userCount = await User.countDocuments();
    console.log('Total users in database:', userCount);
    
    // Get a sample user
    const sampleUser = await User.findOne().lean();
    console.log('Sample user:', sampleUser);
    
    res.json({ 
      message: 'Commission data test successful',
      totalCommissions: count,
      totalUsers: userCount,
      sampleCommission: sampleCommission,
      sampleCommissionWithUser: sampleCommissionWithUser,
      sampleUser: sampleUser
    });
  } catch (error) {
    console.error('Commission data test error:', error);
    res.status(500).json({ error: 'Commission data test failed: ' + error.message });
  }
});

// Fix old commission data (convert string user to ObjectId)
router.post('/fix-data', async (req, res) => {
  try {
    console.log('Fixing old commission data...');
    
    // Find commissions with string user field
    const oldCommissions = await Commission.find({
      user: { $type: 'string' }
    });
    
    console.log(`Found ${oldCommissions.length} commissions with string user field`);
    
    let fixedCount = 0;
    for (const commission of oldCommissions) {
      try {
        // Find user by clerkId
        const user = await User.findOne({ clerkId: commission.user });
        if (user) {
          // Update commission to use user._id
          await Commission.findByIdAndUpdate(commission._id, { user: user._id });
          fixedCount++;
          console.log(`Fixed commission ${commission._id}: ${commission.user} -> ${user._id}`);
        } else {
          console.log(`User not found for clerkId: ${commission.user}`);
        }
      } catch (error) {
        console.error(`Error fixing commission ${commission._id}:`, error);
      }
    }
    
    res.json({ 
      message: `Fixed ${fixedCount} commissions`,
      totalOld: oldCommissions.length,
      fixedCount 
    });
  } catch (error) {
    console.error('Error fixing commission data:', error);
    res.status(500).json({ error: 'Error fixing commission data: ' + error.message });
  }
});

// Create commission
router.post('/', requireAuth(), async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(500).json({ message: 'Database connection error' });
    }

    // Get user ID from Clerk auth or fallback
    const userId = req.auth?.userId || req.auth?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Try to find user by Clerk ID first, then by MongoDB ID
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.facebook) {
      return res.status(400).json({ message: 'Bạn cần có link Facebook để tạo commission' });
    }

    // Extract data from request body
    const {
      title,
      description,
      type,
      price,
      currency,
      deadline,
      requirements,
      tags,
      'media-img': mediaImg,
      'media-vid': mediaVid
    } = req.body;



    // Create commission object
    const commission = new Commission({
      user: user._id, // Use MongoDB ObjectId
      title,
      description,
      type,
      price: Number(price),
      currency,
      deadline: new Date(deadline),
      requirements,
      tags,
      'media-img': mediaImg || [],
      'media-vid': mediaVid || [],
      status: 'open'
    });

    await commission.save();

    res.status(201).json({ 
      message: 'Commission created successfully',
      commission 
    });
  } catch (error) {
    console.error('Error creating commission:', error);
    res.status(500).json({ message: 'Error creating commission', error: error.message });
  }
});

// Get all commissions
router.get('/', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(500).json({ message: 'Database connection error' });
    }

    console.log('Fetching commissions with populate...');
    const commissions = await Commission.find()
      .populate('user', 'username avatar bio email')
      .sort({ createdAt: -1 });

    console.log(`Found ${commissions.length} commissions`);
    
    if (commissions.length > 0) {
      const sampleCommission = commissions[0].toObject();
      console.log('Sample commission user data:', sampleCommission.user);
      console.log('Sample commission raw data:', {
        _id: sampleCommission._id,
        user: sampleCommission.user,
        userType: typeof sampleCommission.user,
        userIsObject: sampleCommission.user && typeof sampleCommission.user === 'object'
      });
    }

    const processedCommissions = commissions.map(commission => {
      const commissionObj = commission.toObject();
      
      // Simple check: if user exists, use it; otherwise set default
      const userData = commissionObj.user ? {
        _id: commissionObj.user._id,
        username: commissionObj.user.username,
        avatar: commissionObj.user.avatar || '',
        bio: commissionObj.user.bio || ''
      } : {
        _id: null,
        username: 'Unknown Artist',
        avatar: '',
        bio: ''
      };

      return {
        ...commissionObj,
        user: userData
      };
    });

    res.json({ commissions: processedCommissions });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching commissions', error: error.message });
  }
});

// Get single commission
router.get('/:id', async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    const commission = await Commission.findById(req.params.id)
      .populate('user', 'username avatar bio email')
      .populate('feedback.user', 'username avatar');

    if (!commission) {
      return res.status(404).json({ message: 'Commission not found' });
    }

    const commissionObj = commission.toObject();
    
    // Simple check: if user exists, use it; otherwise set default
    const userData = commissionObj.user ? {
      _id: commissionObj.user._id,
      username: commissionObj.user.username,
      avatar: commissionObj.user.avatar || '',
      bio: commissionObj.user.bio || '',
      email: commissionObj.user.email || ''
    } : {
      _id: null,
      username: 'Unknown Artist',
      avatar: '',
      bio: '',
      email: ''
    };

    const processedCommission = {
      ...commissionObj,
      user: userData
    };

    res.json({ commission: processedCommission });
  } catch (error) {
    console.error('Error fetching commission:', error);
    res.status(500).json({ message: 'Error fetching commission', error: error.message });
  }
});

// Update commission
router.put('/:id', requireAuth(), async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(500).json({ message: 'Database connection error' });
    }

    // Get user ID from Clerk auth or fallback
    const userId = req.auth?.userId || req.auth?.user?.id;
    
    if (!userId) {
      console.error('No user ID found in auth context');
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Try to find user by Clerk ID first, then by MongoDB ID
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      console.error('User not found for ID:', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    const commission = await Commission.findOne({ 
      _id: req.params.id, 
      user: user._id // Use MongoDB ObjectId
    });

    if (!commission) {
      return res.status(404).json({ message: 'Commission not found or unauthorized' });
    }

    const updatedCommission = await Commission.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ 
      message: 'Commission updated successfully',
      commission: updatedCommission 
    });
  } catch (error) {
    console.error('Error updating commission:', error);
    res.status(500).json({ message: 'Error updating commission', error: error.message });
  }
});

// Xóa commission
router.delete('/:id', requireAuth(), async (req, res) => {
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    // Get user ID from Clerk auth or fallback
    const userId = req.auth?.userId || req.auth?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Try to find user by Clerk ID first, then by MongoDB ID
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const commission = await Commission.findById(req.params.id);
    if (!commission) return res.status(404).json({ message: 'Not found' });
    
    if (commission.user.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Delete media files from Cloudinary
    const mediaUrls = [
      ...(commission['media-img'] || []),
      ...(commission['media-vid'] || [])
    ];

    if (mediaUrls.length > 0) {
      const deletePromises = mediaUrls.map(url => deleteFromCloudinary(url));
      await Promise.all(deletePromises);
    }

    // Delete related orders
    await Order.deleteMany({ commission: req.params.id });
    
    await commission.deleteOne();
    res.json({ message: 'Commission deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create order for commission
router.post('/:id/order', requireAuth(), async (req, res) => {
  try {
    // Validate commission ID format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid commission ID format' });
    }
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ message: 'Database connection error' });
    }

    // Get user ID from Clerk auth or fallback
    const userId = req.auth?.userId || req.auth?.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Try to find user by Clerk ID first, then by MongoDB ID
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findById(userId);
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.facebook) {
      return res.status(400).json({ message: 'Bạn cần có link Facebook để đặt commission' });
    }

    const commission = await Commission.findById(req.params.id);
    if (!commission) {
      return res.status(404).json({ message: 'Commission not found' });
    }

    // Prevent users from ordering their own commission
    if (commission.user.toString() === user._id.toString()) {
      return res.status(400).json({ message: 'Bạn không thể đặt commission của chính mình' });
    }

    // Check if commission is open for orders
    if (commission.status !== 'open') {
      return res.status(400).json({ message: 'Commission không còn nhận đơn hàng' });
    }

    // Check if user already has an active order for this commission (exclude rejected orders)
    const existingOrder = await Order.findOne({
      commission: req.params.id,
      customer: user._id,
      status: { $nin: ['artist_rejected', 'customer_rejected', 'completed', 'cancelled'] }
    });

    if (existingOrder) {
      return res.status(400).json({ message: 'Bạn đã đặt commission này rồi' });
    }

    // Create order
    const order = new Order({
      commission: req.params.id,
      customer: user._id,
      artist: commission.user,
      buyer: userId, // ClerkId of the customer (required field)
      status: 'pending'
    });

    await order.save();

    // Update commission status to pending when order is created
    commission.status = 'pending';
    await commission.save();

    res.status(201).json({ 
      message: 'Order created successfully',
      order 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating order', error: error.message });
  }
});


module.exports = router; 