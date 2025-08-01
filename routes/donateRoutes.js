const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');
const path = require('path');

// Import donate modules
const xulinaptienRouter = require('../donate/xulinaptien');

// Web donate endpoint
router.post('/web', async (req, res) => {
  try {
    const { donorId, recipientId, displayName, amount, message } = req.body;
    
    console.log('Web donate request:', { donorId, recipientId, displayName, amount, message });
    
    if (!donorId || !recipientId || !displayName || !amount) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    const MONGO_URI = process.env.MONGODB_URI;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    const db = client.db('vtuberverse');
    const users = db.collection('users');
    
    // Convert string IDs to ObjectId if needed
    const { ObjectId } = require('mongodb');
    const donorObjectId = typeof donorId === 'string' ? new ObjectId(donorId) : donorId;
    const recipientObjectId = typeof recipientId === 'string' ? new ObjectId(recipientId) : recipientId;
    
    // Check donor balance
    const donor = await users.findOne({ _id: donorObjectId });
    if (!donor) {
      await client.close();
      return res.status(404).json({ error: 'Người ủng hộ không tồn tại' });
    }
    
    if (donor.balance < amount) {
      await client.close();
      return res.status(400).json({ error: 'Số dư không đủ' });
    }
    
    // Check recipient exists
    const recipient = await users.findOne({ _id: recipientObjectId });
    if (!recipient) {
      await client.close();
      return res.status(404).json({ error: 'Người nhận không tồn tại' });
    }
    
    // Check amount validation
    if (amount < 10000 || amount % 10000 !== 0) {
      await client.close();
      return res.status(400).json({ error: 'Số tiền phải lớn hơn 10,000 VNĐ và là bội số của 10,000 VNĐ' });
    }
    
    // Update donor balance and donated amount
    await users.updateOne(
      { _id: donorObjectId },
      { 
        $inc: { 
          balance: -amount,
          donated: amount
        } 
      }
    );
    
    // Update recipient donate_received
    await users.updateOne(
      { _id: recipientObjectId },
      { 
        $inc: { 
          donate_received: amount
        } 
      }
    );
    
    // Save donation record
    const donations = db.collection('donations');
    const donationData = {
      userId: recipientId,
      donate: [{
        name: displayName,
        amount: amount,
        message: message || '',
        timestamp: new Date(),
        donorId: donorId,
        source: 'web'
      }],
      createdAt: new Date()
    };
    
    await donations.insertOne(donationData);
    
    await client.close();
    
    console.log('Web donate success:', { amount, displayName });
    
    res.json({ 
      success: true, 
      message: 'Ủng hộ thành công',
      amount: amount,
      displayName: displayName
    });
    
  } catch (error) {
    console.error('Web donate error:', error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Routes
router.get('/latest', async (req, res) => {
  try {
    const MONGO_URI = process.env.MONGODB_URI;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    const db = client.db('vtuberverse');
    const donations = db.collection('donations');
    
    // Lấy donation mới nhất (createdAt trong 15 giây qua)
    const fifteenSecondsAgo = new Date(Date.now() - 15 * 1000);
    const latestDonation = await donations.findOne({
      createdAt: { $gte: fifteenSecondsAgo }
    }, {
      sort: { createdAt: -1 }
    });
    
    await client.close();
    
    if (latestDonation && latestDonation.donate && latestDonation.donate.length > 0) {
      const latestDonate = latestDonation.donate[latestDonation.donate.length - 1];
      res.json({ 
        donation: {
          name: latestDonate.name,
          amount: latestDonate.amount,
          message: latestDonate.message,
          timestamp: latestDonate.timestamp
        }
      });
    } else {
      res.json({ donation: null });
    }
  } catch (error) {
    console.error('Error getting latest donation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user balance
router.get('/balance/:discordId', async (req, res) => {
  try {
    const { discordId } = req.params;
    const mongo = require('../donate/mongo');
    const balance = await mongo.getBalance(discordId);
    res.json({ balance });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leaderboard with type parameter
router.get('/leaderboard/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'donators' or 'vtubers'
    const MONGO_URI = process.env.MONGODB_URI;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    const db = client.db('vtuberverse');
    const users = db.collection('users'); // Use main users collection
    
    let sortField;
    if (type === 'donators') {
      sortField = 'donated';
    } else if (type === 'vtubers') {
      sortField = 'donate_received';
    } else {
      return res.status(400).json({ error: 'Invalid leaderboard type' });
    }
    
    const leaderboard = await users
      .find({ [sortField]: { $gt: 0 } }) // Only users with donations
      .sort({ [sortField]: -1 })
      .limit(10)
      .project({
        username: 1,
        avatar: 1,
        donated: 1,
        donate_received: 1,
        role: 1
      })
      .toArray();
    
    await client.close();
    
    res.json({ 
      leaderboard,
      type,
      title: type === 'donators' ? 'Top Donators' : 'Top Vtubers'
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user donation page data
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const mongo = require('../donate/mongo');
    
    // Get user info from main users collection
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's donation stats
    const totalDonated = await mongo.getUserTotalDonated(userId);
    const recentDonations = await mongo.getUserDonations(userId, 5);
    
    res.json({
      user: {
        _id: user._id,
        username: user.username,
        avatar: user.avatar,
        displayName: user.displayName
      },
      donationStats: {
        totalDonated,
        recentDonations
      }
    });
  } catch (error) {
    console.error('Error getting user donation data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's donation history
router.get('/user/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const mongo = require('../donate/mongo');
    
    const donations = await mongo.getUserDonations(userId, parseInt(limit));
    
    res.json({ donations });
  } catch (error) {
    console.error('Error getting user donation history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent donations for polling
router.get('/recent', async (req, res) => {
  try {
    const MONGO_URI = process.env.MONGODB_URI;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    const db = client.db('vtuberverse');
    const donations = db.collection('donations');
    
    // Lấy tất cả donations trong 15 giây qua
    const fifteenSecondsAgo = new Date(Date.now() - 15 * 1000);
    const recentDonations = await donations.find({
      createdAt: { $gte: fifteenSecondsAgo }
    }).toArray();
    
    await client.close();
    
    // Format donations để frontend dễ sử dụng
    const formattedDonations = recentDonations.map(record => {
      if (record.donate && record.donate.length > 0) {
        const latestDonate = record.donate[record.donate.length - 1];
        return {
          userId: record.id,
          name: latestDonate.name,
          amount: latestDonate.amount,
          message: latestDonate.message,
          timestamp: latestDonate.timestamp
        };
      }
      return null;
    }).filter(donation => donation !== null);
    
    res.json({ donations: formattedDonations });
  } catch (error) {
    console.error('Error getting recent donations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize function
function initializeDonateRoutes() {
  console.log('Donate routes initialized (polling mode)');
}

module.exports = router;