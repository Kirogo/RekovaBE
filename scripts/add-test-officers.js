// scripts/add-test-officers.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function addTestOfficers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    const User = require('../models/User');
    
    // Check if test officers already exist
    const existingOfficers = await User.find({
      username: { $in: ['paul.ndirangu', 'jane.akinyi', 'michael.mwai', 'sarah.wangechi'] }
    }).select('username');
    
    if (existingOfficers.length > 0) {
      console.log('⚠️ Some test officers already exist:');
      existingOfficers.forEach(o => console.log(`  - ${o.username}`));
      console.log('\nSkipping existing users...\n');
    }
    
    // Define the 4 new officers with plain text passwords
    const newOfficers = [
      {
        username: 'paul.ndirangu',
        email: 'paul.ndirangu@ncbagroup.com',
        password: 'Test1234', // Plain text - will be hashed
        firstName: 'Paul',
        lastName: 'Ndirangu',
        phone: '254712345679',
        role: 'officer',
        department: 'Collections',
        loanType: 'Consumer Loans', // Will be assigned properly later
        createdBy: 'system'
      },
      {
        username: 'jane.akinyi',
        email: 'jane.akinyi@ncbagroup.com',
        password: 'Test1234',
        firstName: 'Jane',
        lastName: 'Akinyi',
        phone: '254712345680',
        role: 'officer',
        department: 'Collections',
        loanType: 'Digital Loans',
        createdBy: 'system'
      },
      {
        username: 'michael.mwai',
        email: 'michael.mwai@ncbagroup.com',
        password: 'Test1234',
        firstName: 'Michael',
        lastName: 'Mwai',
        phone: '254712345681',
        role: 'officer',
        department: 'Collections',
        loanType: 'Asset Finance',
        createdBy: 'system'
      },
      {
        username: 'sarah.wangechi',
        email: 'sarah.wangechi@ncbagroup.com',
        password: 'Test1234',
        firstName: 'Sarah',
        lastName: 'Wangechi',
        phone: '254712345682',
        role: 'officer',
        department: 'Collections',
        loanType: 'SME',
        createdBy: 'system'
      }
    ];
    
    console.log('🆕 Adding 4 new officers...\n');
    
    const createdOfficers = [];
    
    for (const officerData of newOfficers) {
      // Check if officer already exists
      const exists = await User.findOne({ 
        $or: [
          { username: officerData.username },
          { email: officerData.email }
        ]
      });
      
      if (exists) {
        console.log(`⚠️ Skipping ${officerData.username} - already exists`);
        continue;
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(officerData.password, salt);
      
      // Create officer with hashed password
      const officer = new User({
        ...officerData,
        password: hashedPassword,
        isActive: true,
        capacity: {
          maxCustomers: 50,
          currentLoad: 0,
          assignmentPriority: 1
        },
        performanceMetrics: {
          dailyTarget: 50000,
          monthlyTarget: 1000000,
          totalCollections: 0,
          totalTransactions: 0,
          successfulTransactions: 0,
          failedTransactions: 0,
          averageTransactionAmount: 0,
          efficiencyRating: 0,
          promisesCreated: 0,
          promisesFulfilled: 0,
          followUpsCompleted: 0,
          customerComments: 0
        }
      });
      
      await officer.save();
      createdOfficers.push({
        username: officer.username,
        email: officer.email,
        plainPassword: officerData.password, // Keep for reference
        loanType: officer.loanType
      });
      
      console.log(`✅ Created ${officer.username} (${officer.email})`);
      console.log(`   Password: ${officerData.password} | Loan Type: ${officer.loanType}`);
    }
    
    // Update existing officers' loan types based on customer distribution
    console.log('\n🔄 Updating existing officers...');
    
    const Customer = require('../models/Customer');
    const customerDist = await Customer.aggregate([
      { $group: { _id: '$loanType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    console.log('\nCustomer Distribution:');
    customerDist.forEach(item => {
      console.log(`  ${item._id}: ${item.count} customers`);
    });
    
    // Get all officers (existing + new)
    const allOfficers = await User.find({ role: 'officer', isActive: true })
      .select('username loanType');
    
    console.log('\n📊 Current Officer Count:');
    console.log(`  Total officers: ${allOfficers.length}`);
    console.log(`  Loan types: 5`);
    console.log(`  Ideal: ${Math.ceil(allOfficers.length / 5)} officers per loan type`);
    
    // Assign optimal loan types
    const loanTypes = ['Digital Loans', 'Asset Finance', 'Consumer Loans', 'SME', 'Credit Cards'];
    const assignments = [];
    
    // Sort loan types by customer count (descending)
    const sortedLoanTypes = [...loanTypes].sort((a, b) => {
      const countA = customerDist.find(c => c._id === a)?.count || 0;
      const countB = customerDist.find(c => c._id === b)?.count || 0;
      return countB - countA;
    });
    
    // Assign officers to loan types round-robin
    allOfficers.forEach((officer, index) => {
      const assignedType = sortedLoanTypes[index % sortedLoanTypes.length];
      assignments.push({ officer: officer.username, loanType: assignedType });
    });
    
    console.log('\n🎯 Recommended Assignments:');
    assignments.forEach((assignment, i) => {
      const customerCount = customerDist.find(c => c._id === assignment.loanType)?.count || 0;
      console.log(`  ${i+1}. ${assignment.officer} → ${assignment.loanType} (${customerCount} customers)`);
    });
    
    // Apply assignments
    console.log('\n⚙️ Applying assignments...');
    for (const assignment of assignments) {
      await User.updateOne(
        { username: assignment.officer },
        { $set: { loanType: assignment.loanType } }
      );
      console.log(`  ✓ ${assignment.officer}: ${assignment.loanType}`);
    }
    
    // Final summary
    console.log('\n🎉 ADDITION COMPLETE!\n');
    
    console.log('📋 NEW OFFICER CREDENTIALS:');
    console.log('===========================');
    createdOfficers.forEach(officer => {
      console.log(`👤 ${officer.username}`);
      console.log(`   Email: ${officer.email}`);
      console.log(`   Password: ${officer.plainPassword}`);
      console.log(`   Loan Type: ${officer.loanType}`);
      console.log('');
    });
    
    console.log('🔐 LOGIN INFORMATION:');
    console.log('====================');
    console.log('Frontend URL: http://localhost:5173');
    console.log('Use the credentials above to login as officers');
    
    console.log('\n📊 FINAL OFFICER DISTRIBUTION:');
    const finalDist = await User.aggregate([
      { $match: { role: 'officer', isActive: true } },
      { $group: { _id: '$loanType', officers: { $sum: 1 } } },
      { $sort: { officers: -1 } }
    ]);
    
    finalDist.forEach(item => {
      const customerCount = customerDist.find(c => c._id === item._id)?.count || 0;
      const avgLoad = item.officers > 0 ? (customerCount / item.officers).toFixed(1) : 'N/A';
      console.log(`  ${item._id}: ${item.officers} officer(s), ${customerCount} customers (avg: ${avgLoad})`);
    });
    
    // Check for unhandled loan types
    const handledTypes = finalDist.map(item => item._id);
    const unhandled = customerDist.filter(item => !handledTypes.includes(item._id));
    
    if (unhandled.length > 0) {
      console.log('\n⚠️ UNHANDLED LOAN TYPES:');
      unhandled.forEach(item => {
        console.log(`  ${item._id}: ${item.count} customers (no officer assigned)`);
      });
    } else {
      console.log('\n✅ All loan types have at least one officer!');
    }
    
    mongoose.connection.close();
    
    console.log('\n💡 NEXT STEP:');
    console.log('Run the assignment test to verify everything works:');
    console.log('node scripts/test-assignment.js');
    
  } catch (error) {
    console.error('Error adding officers:', error);
    process.exit(1);
  }
}

addTestOfficers();