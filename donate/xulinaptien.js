// xulinaptien.js
const express = require('express');
const router = express.Router();
const mongo = require('./mongo');  // path tới file mongo.js

// Test endpoint để kiểm tra webhook
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Webhook endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

// Hàm trích xuất Discord ID từ description (chuỗi số 17-20 chữ số)
function extractDiscordId(description) {
  const match = description.match(/\b\d{17,20}\b/);
  return match ? match[0] : null;
}

// Endpoint webhook Casso
router.post('/', async (req, res) => {
  console.log('=== PROCESSING CASSO WEBHOOK ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Headers:', req.headers);
  
  // Xác thực token Casso
  const cassoToken = process.env.CASSO_TOKEN;
  console.log('Expected token:', cassoToken ? '***' : 'NOT_SET');
  console.log('Received token:', req.headers['x-casso-token'] || 'NOT_PROVIDED');
  
  if (req.headers['x-casso-token'] !== cassoToken) {
    console.log('=== TOKEN MISMATCH - UNAUTHORIZED ===');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log('=== TOKEN VALIDATED SUCCESSFULLY ===');
      try {
      console.log('=== VALIDATING WEBHOOK DATA ===');
      const dataArr = req.body.data;
      console.log('Data array:', dataArr);
      
      if (!Array.isArray(dataArr) || dataArr.length === 0) {
        console.log('=== ERROR: No transaction data ===');
        return res.status(400).json({ error: 'No transaction data' });
      }
      
      const data = dataArr[0];
      const description = data.description || '';
      const amount = data.amount || 0;
      
      console.log('Transaction data:', {
        description,
        amount,
        data
      });

      // Lấy discordId từ description
      const discordId = extractDiscordId(description);
      console.log('Extracted Discord ID:', discordId);
      
      if (!discordId) {
        console.log('=== ERROR: No Discord ID found ===');
        return res.status(400).json({ error: 'Không tìm thấy Discord ID trong description' });
      }
      
      if (amount <= 0 || amount % 10000 !== 0) {
        console.log('=== ERROR: Invalid amount ===');
        return res.status(400).json({ error: 'Số tiền phải là bội số của 10.000' });
      }
      
      console.log('=== DATA VALIDATION PASSED ===');

    // Tìm user với discord_id đã xác minh
    console.log('=== SEARCHING FOR USER ===');
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('vtuberverse');
    const users = db.collection('users');

    const user = await users.findOne({
      discord_id: discordId,
      is_discord_verified: true
    });

    console.log('User found:', user ? 'YES' : 'NO');
    if (user) {
      console.log('User details:', {
        _id: user._id,
        username: user.username,
        balance: user.balance
      });
    }

    if (!user) {
      console.log('=== ERROR: User not found or not verified ===');
      await client.close();
      return res.status(400).json({ error: 'Không tìm thấy user đã xác minh với Discord ID này' });
    }
    
    console.log('=== USER FOUND AND VERIFIED ===');

    // Cập nhật balance
    console.log('=== UPDATING USER BALANCE ===');
    console.log('Current balance:', user.balance);
    console.log('Adding amount:', amount);
    
    await users.updateOne(
      { _id: user._id },
      { $inc: { balance: amount } }
    );
    
    console.log('=== SAVING DONATION RECORD ===');
    // Save donation record
    const donationData = {
      userId: user._id.toString(),
      name: `Donor ${discordId.slice(-4)}`,
      amount: amount,
      message: `Donation via Casso`,
      source: 'casso'
    };
    console.log('Donation data:', donationData);
    
    await mongo.saveDonation(donationData);
    
    await client.close();
    console.log('=== WEBHOOK PROCESSING COMPLETED SUCCESSFULLY ===');
    return res.status(200).json({ success: true, discordId, amount });
      } catch (err) {
      console.log('=== WEBHOOK PROCESSING ERROR ===');
      console.error('Error details:', err);
      return res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
