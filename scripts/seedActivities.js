const mongoose = require('mongoose');
const ActivityLogger = require('../services/activityLogger');
const User = require('../models/User');
const Customer = require('../models/Customer');
require('dotenv').config();

const seedActivities = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('✅ Connected to database');
    
    // Get officers
    const officers = await User.find({ role: 'officer', isActive: true }).limit(5);
    const customers = await Customer.find().limit(10);
    
    if (officers.length === 0 || customers.length === 0) {
      console.log('⚠️ Need at least 5 officers and 10 customers to seed activities');
      console.log('Create some test data first or proceed with available data');
    }
    
    console.log(`📊 Seeding activities for ${officers.length} officers...`);
    
    // Create sample activities for the last 7 days
    const activities = [];
    const activityTypes = ['LOGIN', 'TRANSACTION_SUCCESS', 'PROMISE_CREATE'];
    
    for (let i = 0; i < 30; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const hoursAgo = Math.floor(Math.random() * 24);
      const minutesAgo = Math.floor(Math.random() * 60);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      activityDate.setHours(activityDate.getHours() - hoursAgo);
      activityDate.setMinutes(activityDate.getMinutes() - minutesAgo);
      
      const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
      
      let activity;
      switch (activityType) {
        case 'LOGIN':
          activity = await ActivityLogger.logAuth(officer._id, 'LOGIN', '127.0.0.1', 'Mozilla/5.0', {
            userAgent: 'Mozilla/5.0',
            loginTime: activityDate
          });
          console.log(`👤 Created LOGIN activity for ${officer.username}`);
          break;
        
        case 'TRANSACTION_SUCCESS':
          const paymentAmount = Math.floor(Math.random() * 20000) + 500;
          activity = await ActivityLogger.logPaymentCollection(officer._id, customer, paymentAmount, 'M-PESA');
          console.log(`💰 Created PAYMENT activity for ${officer.username}: Ksh ${paymentAmount}`);
          break;
        
        case 'PROMISE_CREATE':
          const promiseAmount = Math.floor(Math.random() * 50000) + 1000;
          const dueDate = new Date(activityDate);
          dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) + 1);
          activity = await ActivityLogger.logPromiseMade(officer._id, customer, promiseAmount, dueDate);
          console.log(`📅 Created PROMISE activity for ${officer.username}: Ksh ${promiseAmount}`);
          break;
      }
      
      if (activity) {
        // Manually set createdAt to random date in past
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        
        activities.push(activity);
      }
    }
    
    // Create some call activities
    for (let i = 0; i < 15; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      
      const callDuration = Math.floor(Math.random() * 600) + 60;
      const callTypes = ['followup', 'reminder', 'negotiation', 'confirmation'];
      const callType = callTypes[Math.floor(Math.random() * callTypes.length)];
      
      const activity = await ActivityLogger.logPhoneCall(officer._id, customer, {
        duration: callDuration,
        callType,
        notes: 'Customer communication regarding payment',
        outcome: 'promise_made'
      });
      
      if (activity) {
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        console.log(`📞 Created CALL activity for ${officer.username}: ${callType} call`);
      }
    }
    
    console.log(`\n✅ Successfully seeded ${activities.length + 15} sample activities`);
    console.log('📊 Activity breakdown:');
    console.log('- Officer logins');
    console.log('- Phone calls to customers');
    console.log('- Payment promises made');
    console.log('- Successful transactions');
    console.log('\n🎯 Supervisor Dashboard Activity Trail should now show real data!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error seeding activities:', error);
    process.exit(1);
  }
};

// Only run if called directly
if (require.main === module) {
  seedActivities();
} else {
  module.exports = seedActivities;
}