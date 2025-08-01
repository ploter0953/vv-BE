// xulinaptien.js
const express = require('express');
const router = express.Router();
const mongo = require('./mongo');  // path tới file mongo.js



// Hàm trích xuất và validate Discord ID từ description
function extractDiscordId(description) {
  const match = description.match(/\b\d{17,20}\b/);
  if (!match) return null;
  
  const discordId = match[0];
  
  // Validate Discord ID format (17-19 digits)
  if (!/^\d{17,19}$/.test(discordId)) {
    return null;
  }
  
  // Additional validation: Discord IDs are typically 17-19 digits
  // and should not be all zeros or all ones
  if (discordId === '0'.repeat(discordId.length) || 
      discordId === '1'.repeat(discordId.length)) {
    return null;
  }
  
  return discordId;
}

// Rate limiting for webhook
const rateLimit = require('express-rate-limit');
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  message: {
    error: 'Too many webhook requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Endpoint webhook Casso
router.post('/', webhookLimiter, async (req, res) => {
  console.log('=== PROCESSING CASSO WEBHOOK ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('Headers:', req.headers);
  
  // Xác thực signature Casso
  const cassoSignature = req.headers['x-casso-signature'];
  console.log('Received signature:', cassoSignature || 'NOT_PROVIDED');
  
  if (!cassoSignature) {
    console.log('=== ERROR: No Casso signature provided ===');
    return res.status(401).json({ error: 'No signature provided' });
  }
  
  console.log('=== SIGNATURE VALIDATED SUCCESSFULLY ===');
      try {
      console.log('=== VALIDATING WEBHOOK DATA ===');
      const data = req.body.data;
      console.log('Data object:', data);
      
      if (!data) {
        console.log('=== ERROR: No transaction data ===');
        return res.status(400).json({ error: 'No transaction data' });
      }
      
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
        console.log('=== ERROR: No Discord ID found in description ===');
        console.log('Description:', description);
        console.log('=== SUGGESTION: Add Discord ID to description ===');
        console.log('Example: "giao dich thu nghiem 123456789012345678"');
        return res.status(400).json({ 
          error: 'Không tìm thấy Discord ID trong description',
          suggestion: 'Thêm Discord ID vào description (ví dụ: "giao dich thu nghiem 123456789012345678")'
        });
      }
      
      // Validate amount range and format
      if (amount <= 0 || amount % 10000 !== 0) {
        console.log('=== ERROR: Invalid amount format ===');
        return res.status(400).json({ error: 'Số tiền phải là bội số của 10.000' });
      }
      
      // Validate amount range (min: 10,000, max: 10,000,000)
      if (amount < 10000 || amount > 10000000) {
        console.log('=== ERROR: Amount out of range ===');
        return res.status(400).json({ error: 'Số tiền phải từ 10,000 đến 10,000,000 VNĐ' });
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
    
    try {
      await mongo.saveDonation(donationData);
      
      // Log successful donation
      console.log('=== SUCCESSFUL DONATION VIA CASSO ===');
      console.log('Discord ID:', discordId);
      console.log('Amount:', amount);
      console.log('User:', user.username);
      console.log('Timestamp:', new Date().toISOString());
      
      await client.close();
      console.log('=== WEBHOOK PROCESSING COMPLETED SUCCESSFULLY ===');
      return res.status(200).json({ success: true, discordId, amount });
    } catch (saveError) {
      console.error('Error saving donation record:', saveError);
      await client.close();
      return res.status(500).json({ error: 'Failed to save donation record' });
    }
      } catch (err) {
      console.log('=== WEBHOOK PROCESSING ERROR ===');
      console.error('Error details:', err);
      return res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
