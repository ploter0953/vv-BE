const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://donate.projectvtuber.com", "http://donate.projectvtuber.com"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) throw new Error('MONGODB_URI env variable is required!');
const DB_NAME = 'vtuberverse';
const COLLECTION_NAME = 'donations';

let latestDonation = null;

app.use(express.static(path.join(__dirname, '../')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../donate.html'));
});

// WebSocket
io.on('connection', (socket) => {
  console.log('WebSocket: Một client đã kết nối');
  if (latestDonation) {
    socket.emit('new-donation', latestDonation);
  }
});

// Theo dõi MongoDB
async function startMongoWatch() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('Đã khởi động và kết nối databse thành công từ xulidonate.js');

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const changeStream = collection.watch();

    changeStream.on('change', (change) => {
      if (change.operationType === 'insert') {
        const doc = change.fullDocument;
        latestDonation = {
          name: doc.name,
          amount: doc.amount,
          message: doc.message,
          timestamp: doc.timestamp
        };
        console.log('Có donate mới:', latestDonation);
        io.emit('new-donation', latestDonation);
      }
    });

    console.log('Bắt đầu truy xuất dữ liệu database"...');
  } catch (err) {
    console.error('Lỗi kết nối MongoDB hoặc theo dõi change stream:', err);
  }
}

// Khởi động WebSocket server
function startDonateSocketServer() {
  const PORT = process.env.PORT || 5500;
  server.listen(PORT, () => {
    console.log(`WebSocket đã khởi động thành công.`);
    startMongoWatch();
  });
}

module.exports = {
  startDonateSocketServer
};
