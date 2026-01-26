const mongoose = require('mongoose');
require('dotenv').config();

async function fixUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const User = require('./models/User');
    
    // Update all users with role "agent" to "officer"
    const result = await User.updateMany(
      { role: 'agent' },
      { 
        $set: { 
          role: 'officer',
          createdBy: new mongoose.Types.ObjectId() // Create a valid ObjectId
        }
      }
    );
    
    console.log(`Updated ${result.modifiedCount} users from agent to officer`);
    
    // Also fix any users with createdBy as string
    const usersWithStringCreatedBy = await User.find({
      createdBy: { $type: 'string' }
    });
    
    for (const user of usersWithStringCreatedBy) {
      user.createdBy = new mongoose.Types.ObjectId();
      await user.save();
    }
    
    console.log(`Fixed ${usersWithStringCreatedBy.length} users with string createdBy`);
    
    // List all users
    const allUsers = await User.find({});
    console.log('\nCurrent users:');
    allUsers.forEach(user => {
      console.log(`- ${user.username}: ${user.role}, createdBy: ${user.createdBy}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ User fix complete!');
    
  } catch (error) {
    console.error('Error fixing users:', error);
    process.exit(1);
  }
}

fixUsers();