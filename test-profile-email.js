const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema (same as in server.js)
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  avatar: String,
  bio: String,
  badge: String,
  badges: { type: [String], default: ['member'] },
  facebook: String,
  zalo: String,
  phone: String,
  website: String,
  profile_email: { type: String }, // No unique constraint
  vtuber_description: String,
  artist_description: String
});

const User = mongoose.model('User', userSchema);

async function testProfileEmail() {
  try {
    console.log('Testing profile_email functionality...\n');
    
    // 1. Check current database state
    console.log('1. Checking current database state...');
    const allUsers = await User.find({}, 'username profile_email').lean();
    console.log(`Total users: ${allUsers.length}`);
    console.log(`Users with profile_email: ${allUsers.filter(u => u.profile_email).length}`);
    console.log(`Users without profile_email: ${allUsers.filter(u => !u.profile_email).length}`);
    
    // 2. Check for duplicate emails
    console.log('\n2. Checking for duplicate profile_emails...');
    const emailCounts = {};
    allUsers.forEach(user => {
      if (user.profile_email) {
        emailCounts[user.profile_email] = (emailCounts[user.profile_email] || 0) + 1;
      }
    });
    
    const duplicates = Object.entries(emailCounts).filter(([email, count]) => count > 1);
    if (duplicates.length > 0) {
      console.log('Found duplicate profile_emails:');
      duplicates.forEach(([email, count]) => {
        console.log(`  - ${email}: ${count} users`);
      });
    } else {
      console.log('No duplicate profile_emails found');
    }
    
    // 3. Test updating profile_email to existing email
    console.log('\n3. Testing profile_email update functionality...');
    if (allUsers.length >= 2) {
      const user1 = allUsers[0];
      const user2 = allUsers[1];
      
      if (user1.profile_email && user2.profile_email) {
        console.log(`Testing: Update user ${user1.username} to have same email as ${user2.username}`);
        console.log(`User1 current email: ${user1.profile_email}`);
        console.log(`User2 email: ${user2.profile_email}`);
        
        // This should now work without error
        try {
          await User.findByIdAndUpdate(user1._id, { profile_email: user2.profile_email });
          console.log('✅ Successfully updated user1 to have same email as user2');
        } catch (error) {
          console.log('❌ Error updating user1:', error.message);
        }
      }
    }
    
    // 4. Test setting profile_email to empty
    console.log('\n4. Testing setting profile_email to empty...');
    if (allUsers.length > 0) {
      const testUser = allUsers[0];
      try {
        await User.findByIdAndUpdate(testUser._id, { profile_email: '' });
        console.log(`✅ Successfully set ${testUser.username} profile_email to empty`);
      } catch (error) {
        console.log('❌ Error setting profile_email to empty:', error.message);
      }
    }
    
    // 5. Check indexes
    console.log('\n5. Checking database indexes...');
    try {
      const indexes = await User.collection.indexes();
      const profileEmailIndex = indexes.find(index => 
        index.key && index.key.profile_email
      );
      
      if (profileEmailIndex) {
        console.log('Profile_email index found:', {
          unique: profileEmailIndex.unique,
          sparse: profileEmailIndex.sparse
        });
      } else {
        console.log('No profile_email index found');
      }
    } catch (error) {
      console.log('Error checking indexes:', error.message);
    }
    
    console.log('\n✅ Profile email test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
testProfileEmail(); 