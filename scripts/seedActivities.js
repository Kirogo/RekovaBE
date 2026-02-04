const mongoose = require('mongoose');
const ActivityLogger = require('../services/activityLogger');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Promise = require('../models/Promise');
require('dotenv').config();

const seedImportantActivities = async () => {
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
    
    console.log(`📊 Seeding IMPORTANT activities for ${officers.length} officers...`);
    console.log('🎯 Only seeding activities supervisors need to see:');
    console.log('   - Officer logins');
    console.log('   - Successful transactions (payments)');
    console.log('   - Customer calls/follow-ups');
    console.log('   - Promises made');
    console.log('   - Promises fulfilled/broken');
    console.log('   - Customer assignments');
    console.log('   - Bulk assignments');
    
    const activities = [];
    
    // 1. Create logins (important for tracking officer activity)
    for (let i = 0; i < 10; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      
      const activity = await ActivityLogger.logAuth(officer._id, 'LOGIN', '127.0.0.1', 'Mozilla/5.0', {
        userAgent: 'Mozilla/5.0',
        loginTime: activityDate
      });
      
      if (activity) {
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        console.log(`👤 Created LOGIN activity for ${officer.username}`);
        activities.push(activity);
      }
    }
    
    // 2. Create successful transactions (IMPORTANT: payments made)
    for (let i = 0; i < 15; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      
      const paymentAmount = Math.floor(Math.random() * 20000) + 500;
      
      const activity = await ActivityLogger.logPaymentCollection(officer._id, customer, paymentAmount, 'M-PESA');
      
      if (activity) {
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        console.log(`💰 Created PAYMENT activity for ${officer.username}: Ksh ${paymentAmount}`);
        activities.push(activity);
      }
    }
    
    // 3. Create customer calls (IMPORTANT: follow-ups)
    for (let i = 0; i < 12; i++) {
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
        activities.push(activity);
      }
    }
    
    // 4. Create promises made (IMPORTANT: future commitments)
    for (let i = 0; i < 8; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      
      const promiseAmount = Math.floor(Math.random() * 50000) + 1000;
      const dueDate = new Date(activityDate);
      dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) + 1);
      
      const activity = await ActivityLogger.logPromiseMade(officer._id, customer, promiseAmount, dueDate);
      
      if (activity) {
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        console.log(`📅 Created PROMISE activity for ${officer.username}: Ksh ${promiseAmount} due ${dueDate.toLocaleDateString()}`);
        activities.push(activity);
      }
    }
    
    // 5. Create fulfilled promises (IMPORTANT: kept commitments)
    for (let i = 0; i < 6; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      
      const fulfilledAmount = Math.floor(Math.random() * 30000) + 500;
      
      const activity = await ActivityLogger.log({
        userId: officer._id,
        action: 'PROMISE_FULFILL',
        description: `Marked promise of Ksh ${fulfilledAmount} from ${customer.customerName} as fulfilled`,
        resourceType: 'PROMISE',
        amount: fulfilledAmount,
        userDetails: {
          username: officer.username,
          fullName: officer.name || officer.username,
          role: officer.role
        },
        tags: ['promise', 'fulfilled', 'important']
      });
      
      if (activity) {
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        console.log(`✅ Created FULFILLED PROMISE activity for ${officer.username}: Ksh ${fulfilledAmount}`);
        activities.push(activity);
      }
    }
    
    // 6. Create broken promises (IMPORTANT: alerts for supervisor)
    for (let i = 0; i < 3; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      
      const brokenAmount = Math.floor(Math.random() * 40000) + 1000;
      
      const activity = await ActivityLogger.log({
        userId: officer._id,
        action: 'PROMISE_BREAK',
        description: `Marked promise of Ksh ${brokenAmount} from ${customer.customerName} as broken`,
        resourceType: 'PROMISE',
        amount: brokenAmount,
        userDetails: {
          username: officer.username,
          fullName: officer.name || officer.username,
          role: officer.role
        },
        tags: ['promise', 'broken', 'important', 'alert']
      });
      
      if (activity) {
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        console.log(`⚠️ Created BROKEN PROMISE activity for ${officer.username}: Ksh ${brokenAmount} (ALERT)`);
        activities.push(activity);
      }
    }
    
    // 7. Create customer assignments (IMPORTANT: supervisor needs to know)
    for (let i = 0; i < 5; i++) {
      const officer = officers[Math.floor(Math.random() * officers.length)];
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const daysAgo = Math.floor(Math.random() * 7);
      const activityDate = new Date();
      activityDate.setDate(activityDate.getDate() - daysAgo);
      
      const activity = await ActivityLogger.log({
        userId: officer._id,
        action: 'CUSTOMER_ASSIGN',
        description: `Assigned customer ${customer.customerName} to ${officer.username}`,
        resourceType: 'CUSTOMER',
        resourceId: customer._id,
        userDetails: {
          username: officer.username,
          fullName: officer.name || officer.username,
          role: officer.role
        },
        tags: ['assignment', 'customer', 'important']
      });
      
      if (activity) {
        await mongoose.connection.collection('activities').updateOne(
          { _id: activity._id },
          { $set: { createdAt: activityDate } }
        );
        console.log(`👥 Created ASSIGNMENT activity: ${customer.customerName} → ${officer.username}`);
        activities.push(activity);
      }
    }
    
    console.log(`\n✅ Successfully seeded ${activities.length} IMPORTANT activities`);
    console.log('🎯 Activity breakdown (Supervisor-focused):');
    console.log(`   - ${activities.filter(a => a.action === 'LOGIN').length} Officer logins`);
    console.log(`   - ${activities.filter(a => a.action === 'TRANSACTION_SUCCESS').length} Successful payments`);
    console.log(`   - ${activities.filter(a => a.action === 'PROMISE_FOLLOWUP').length} Customer calls/follow-ups`);
    console.log(`   - ${activities.filter(a => a.action === 'PROMISE_CREATE').length} Promises made`);
    console.log(`   - ${activities.filter(a => a.action === 'PROMISE_FULFILL').length} Promises fulfilled`);
    console.log(`   - ${activities.filter(a => a.action === 'PROMISE_BREAK').length} Broken promises (ALERTS)`);
    console.log(`   - ${activities.filter(a => a.action === 'CUSTOMER_ASSIGN').length} Customer assignments`);
    console.log('\n📊 Supervisor Dashboard Activity Trail will now show ONLY important activities!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error seeding activities:', error);
    process.exit(1);
  }
};

// Only run if called directly
if (require.main === module) {
  seedImportantActivities();
} else {
  module.exports = seedImportantActivities;
}