// xulinaptien.js
const express = require('express');
const router = express.Router();
const mongo = require('./mongo');  // path tới file mongo.js

// Hàm trích xuất Discord ID từ description (chuỗi số 17-20 chữ số)
function extractDiscordId(description) {
  const match = description.match(/\b\d{17,20}\b/);
  return match ? match[0] : null;
}

// Endpoint webhook Casso
router.post('/', async (req, res) => {
  // Xác thực token Casso
  const cassoToken = process.env.CASSO_TOKEN;
  if (req.headers['x-casso-token'] !== cassoToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const dataArr = req.body.data;
    if (!Array.isArray(dataArr) || dataArr.length === 0) {
      return res.status(400).json({ error: 'No transaction data' });
    }
    const data = dataArr[0];
    const description = data.description || '';
    const amount = data.amount || 0;

    // Lấy discordId từ description
    const discordId = extractDiscordId(description);
    if (!discordId) {
      return res.status(400).json({ error: 'Không tìm thấy Discord ID trong description' });
    }
    if (amount <= 0 || amount % 10000 !== 0) {
      return res.status(400).json({ error: 'Số tiền phải là bội số của 10.000' });
    }

    // Tìm user với discord_id đã xác minh
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db('vtuberverse');
    const users = db.collection('users');

    const user = await users.findOne({
      discord_id: discordId,
      is_discord_verified: true
    });

    if (!user) {
      await client.close();
      return res.status(400).json({ error: 'Không tìm thấy user đã xác minh với Discord ID này' });
    }

    // Cập nhật balance
    await users.updateOne(
      { _id: user._id },
      { $inc: { balance: amount } }
    );
    
    // Save donation record
    const donationData = {
      userId: user._id.toString(),
      name: `Donor ${discordId.slice(-4)}`,
      amount: amount,
      message: `Donation via Casso`,
      source: 'casso'
    };
    await mongo.saveDonation(donationData);
    
    await client.close();
    return res.status(200).json({ success: true, discordId, amount });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
