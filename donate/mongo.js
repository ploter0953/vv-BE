// mongo.js
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI env variable is required!');

const dbName = 'vtuberverse';

// Lazy connection - chỉ kết nối khi cần
let client = null;
let db = null;
let users = null;
let donations = null;

async function getConnection() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    
    // Kiểm tra và tạo collection donate_users nếu chưa tồn tại
    const collections = await db.listCollections({ name: 'donate_users' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('donate_users');
      console.log('🛠 Tạo collection "donate_users" mới');
    }

    // Kiểm tra và tạo collection donations nếu chưa tồn tại
    const donationsCollections = await db.listCollections({ name: 'donations' }).toArray();
    if (donationsCollections.length === 0) {
      await db.createCollection('donations');
      console.log('🛠 Tạo collection "donations" mới');
    }

    users = db.collection('donate_users');
    donations = db.collection('donations');
    console.log('Đã kết nối với database donate system.');
  }
  return { client, db, users, donations };
}

// Tìm user theo discordId, nếu chưa có thì tạo mới với balance=0
async function findOrCreateUser(discordId) {
  const { users } = await getConnection();
  let user = await users.findOne({ _id: discordId });
  if (!user) {
    user = { _id: discordId, balance: 0, donated: 0 };
    await users.insertOne(user);
    console.log(`🆕 Tạo user mới với Discord ID: ${discordId}`);
  }
  return user;
}

// Cộng tiền cho user (atomic, đảm bảo user tồn tại)
async function addBalance(discordId, amount) {
  const { users } = await getConnection();
  const result = await users.updateOne(
    { _id: discordId },
    { $inc: { balance: amount } },
    { upsert: true }
  );
  console.log(`💰 Đã cộng ${amount} cho user ${discordId}`);
}

// Trừ tiền cho user (atomic, đảm bảo user tồn tại và đủ số dư)
async function deductBalance(discordId, amount) {
  const { users } = await getConnection();
  const result = await users.updateOne(
    { _id: discordId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { upsert: false }
  );
  if (result.matchedCount === 0 || result.modifiedCount === 0) {
    throw new Error('Không đủ số dư hoặc user không tồn tại');
  }
  console.log(`📤 Đã trừ ${amount} từ user ${discordId}`);
}

async function getBalance(discordId) {
  const { users } = await getConnection();
  const user = await users.findOne({_id: discordId });
  return user?.balance || 0;
}

// Cộng dồn tổng số tiền đã donate
async function addDonated(discordId, amount) {
  const { users } = await getConnection();
  await users.updateOne(
    { _id: discordId },
    { $inc: { donated: amount } },
    { upsert: true }
  );
  console.log(`Đã cộng dồn ${amount} vào donated cho user ${discordId}`);
}

// Lưu donation record với cấu trúc mới
async function saveDonation(donationData) {
  const { donations } = await getConnection();
  const donation = {
    id: donationData.userId, // ID người nhận donate
    donate: [{
      name: donationData.name,
      amount: donationData.amount,
      message: donationData.message || '',
      timestamp: new Date(),
      donorId: donationData.donorId || null // Thêm thông tin donor
    }],
    createdAt: new Date()
  };
  
  await donations.insertOne(donation);
  console.log(`💝 Đã lưu donation record cho user ${donationData.userId}`);
}

// Lấy danh sách donation của user
async function getUserDonations(userId, limit = 10) {
  const { donations } = await getConnection();
  const donationRecord = await donations.findOne({ id: userId });
  if (!donationRecord || !donationRecord.donate) {
    return [];
  }
  
  // Sắp xếp theo timestamp mới nhất
  const sortedDonations = donationRecord.donate.sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  
  return sortedDonations.slice(0, limit);
}

// Lấy tổng số tiền đã donate của user
async function getUserTotalDonated(userId) {
  const { donations } = await getConnection();
  const donationRecord = await donations.findOne({ id: userId });
  if (!donationRecord || !donationRecord.donate) {
    return 0;
  }
  
  return donationRecord.donate.reduce((total, donation) => total + donation.amount, 0);
}

// Lấy top donors
async function getTopDonors(limit = 10) {
  const { donations } = await getConnection();
  const pipeline = [
    {
      $group: {
        _id: '$id',
        totalDonated: { $sum: { $reduce: { input: '$donate', initialValue: 0, in: { $add: ['$$value', '$$this.amount'] } } } }
      }
    },
    { $sort: { totalDonated: -1 } },
    { $limit: limit }
  ];
  
  return await donations.aggregate(pipeline).toArray();
}

// Xóa donation records cũ (sau 15 giây)
async function cleanupOldDonations() {
  const { donations } = await getConnection();
  const cutoffTime = new Date(Date.now() - 15 * 1000); // 15 giây trước
  
  try {
    const result = await donations.deleteMany({
      createdAt: { $lt: cutoffTime }
    });
    
    if (result.deletedCount > 0) {
      console.log(`🧹 Đã xóa ${result.deletedCount} donation records cũ`);
    }
  } catch (error) {
    console.error('Error cleaning up old donations:', error);
  }
}

// Cleanup inactive users (users with no activity for 30 days)
async function cleanupInactiveUsers() {
  const { users } = await getConnection();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  try {
    const result = await users.deleteMany({
      lastSeen: { $lt: thirtyDaysAgo },
      balance: 0,
      donated: 0,
      donate_received: 0
    });
    
    if (result.deletedCount > 0) {
      console.log(`🧹 Đã xóa ${result.deletedCount} inactive users`);
    }
  } catch (error) {
    console.error('Error cleaning up inactive users:', error);
  }
}

module.exports = {
  findOrCreateUser,
  addBalance,
  deductBalance,
  getBalance,
  addDonated,
  saveDonation,
  getUserDonations,
  getUserTotalDonated,
  getTopDonors,
  cleanupOldDonations,
  cleanupInactiveUsers
};
