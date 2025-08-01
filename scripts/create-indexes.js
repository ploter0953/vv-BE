const { MongoClient } = require('mongodb');
require('dotenv').config();

async function createIndexes() {
  const MONGO_URI = process.env.MONGODB_URI;
  if (!MONGO_URI) {
    console.error('MONGODB_URI environment variable is required');
    console.error('Please set MONGODB_URI in your .env file');
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db('vtuberverse');
    
    console.log('Creating database indexes...');
    
    // Create indexes for donations collection
    const donations = db.collection('donations');
    
    // Index for latest donation queries
    await donations.createIndex({ id: 1, createdAt: -1 });
    console.log('✅ Created index on donations: { id: 1, createdAt: -1 }');
    
    // Index for userId queries (support both schemas)
    await donations.createIndex({ userId: 1, createdAt: -1 });
    console.log('✅ Created index on donations: { userId: 1, createdAt: -1 }');
    
    // Index for cleanup queries
    await donations.createIndex({ createdAt: 1 });
    console.log('✅ Created index on donations: { createdAt: 1 }');
    
    // Create indexes for users collection
    const users = db.collection('users');
    
    // Index for Discord ID lookups
    await users.createIndex({ discord_id: 1 });
    console.log('✅ Created index on users: { discord_id: 1 }');
    
    // Index for username lookups
    await users.createIndex({ username: 1 });
    console.log('✅ Created index on users: { username: 1 }');
    
    // Index for clerk ID lookups
    await users.createIndex({ clerkId: 1 });
    console.log('✅ Created index on users: { clerkId: 1 }');
    
    // Index for leaderboard queries
    await users.createIndex({ donated: -1 });
    console.log('✅ Created index on users: { donated: -1 }');
    
    await users.createIndex({ donate_received: -1 });
    console.log('✅ Created index on users: { donate_received: -1 }');
    
    console.log('🎉 All indexes created successfully!');
    
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run if called directly
if (require.main === module) {
  createIndexes();
}

module.exports = { createIndexes };