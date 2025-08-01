// mongo.js
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) throw new Error('MONGO_URI env variable is required!');
const client = new MongoClient(uri);

const dbName = 'vtuberverse';
let db;
let users;
let donations;

async function connectMongo() {
  try {
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
  } catch (err) {
    console.error('❌ Lỗi kết nối MongoDB:', err);
    process.exit(1); // thoát nếu không kết nối được
  }
}

// Tìm user theo discordId, nếu chưa có thì tạo mới với balance=0
async function findOrCreateUser(discordId) {
  if (!users) throw new Error('Chưa kết nối MongoDB');
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
  const result = await users.updateOne(
    { _id: discordId },
    { $inc: { balance: amount } },
    { upsert: true }
  );
  console.log(`💰 Đã cộng ${amount} cho user ${discordId}`);
}

// Trừ tiền cho user (atomic, đảm bảo user tồn tại và đủ số dư)
async function deductBalance(discordId, amount) {
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
  const db = client.db('vtuberverse');
  const col = db.collection('donate_users');

  const user = await col.findOne({_id: discordId });

  return user?.balance || 0;
}
// Cộng dồn tổng số tiền đã donate
async function addDonated(discordId, amount) {
  await users.updateOne(
    { _id: discordId },
    { $inc: { donated: amount } },
    { upsert: true }
  );
  console.log(`Đã cộng dồn ${amount} vào donated cho user ${discordId}`);
}

            // Lưu donation record với cấu trúc mới
            async function saveDonation(donationData) {
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
  
  // Kiểm tra xem đã có record cho user này chưa
  const existingRecord = await donations.findOne({ id: donationData.userId });
  
  if (existingRecord) {
    // Nếu đã có, thêm vào mảng donate
    await donations.updateOne(
      { id: donationData.userId },
      { 
        $push: { donate: donation.donate[0] },
        $set: { createdAt: new Date() }
      }
    );
  } else {
    // Nếu chưa có, tạo mới
    await donations.insertOne(donation);
  }
  
  console.log(`Đã lưu donation: ${donationData.name} - ${donationData.amount} cho user ${donationData.userId}`);
  return donation;
}

// Lấy danh sách donations của user
async function getUserDonations(userId, limit = 10) {
  const record = await donations.findOne({ id: userId });
  if (!record || !record.donate) return [];
  
  // Sắp xếp theo timestamp mới nhất và giới hạn số lượng
  return record.donate
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

// Lấy tổng số tiền donate của user
async function getUserTotalDonated(userId) {
  const record = await donations.findOne({ id: userId });
  if (!record || !record.donate) return 0;
  
  return record.donate.reduce((total, donation) => total + donation.amount, 0);
}

// Lấy số dư user
module.exports = {
  connectMongo,
  findOrCreateUser,
  addBalance,
  deductBalance,
  getBalance,
  addDonated,
  saveDonation,
  getUserDonations,
  getUserTotalDonated
};
