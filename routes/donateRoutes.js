const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');
const path = require('path');

// Import donate modules
const xulinaptienRouter = require('../donate/xulinaptien');

// Routes
router.get('/latest', async (req, res) => {
  try {
    const MONGO_URI = process.env.MONGO_URI;
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

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const MONGO_URI = process.env.MONGO_URI;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    const db = client.db('vtuberverse');
    const users = db.collection('donate_users');
    
    const leaderboard = await users
      .find({})
      .sort({ donated: -1 })
      .limit(10)
      .toArray();
    
    await client.close();
    
    res.json({ leaderboard });
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
    const MONGO_URI = process.env.MONGO_URI;
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

module.exports = {
  router,
  initializeDonateRoutes
};