const { MongoClient } = require('mongodb');

class DonationCleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupInterval = null;
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Starting donation cleanup service...');
    
    // Chạy cleanup mỗi 5 giây
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOldDonations();
    }, 5000);
  }

  async stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    console.log('Donation cleanup service stopped');
  }

  async cleanupOldDonations() {
    try {
      const MONGO_URI = process.env.MONGODB_URI;
      if (!MONGO_URI) {
        console.error('MONGODB_URI not found');
        return;
      }

      const client = new MongoClient(MONGO_URI);
      await client.connect();
      
      const db = client.db('vtuberverse');
      const donations = db.collection('donations');

      // Xóa các records cũ hơn 15 giây
      const fifteenSecondsAgo = new Date(Date.now() - 15 * 1000);
      
      const result = await donations.deleteMany({
        createdAt: { $lt: fifteenSecondsAgo }
      });

      if (result.deletedCount > 0) {
        console.log(`Cleaned up ${result.deletedCount} old donation records`);
      }

      await client.close();
    } catch (error) {
      console.error('Error in donation cleanup:', error);
    }
  }
}

// Create singleton instance
const donationCleanupService = new DonationCleanupService();

module.exports = donationCleanupService;