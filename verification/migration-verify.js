// verification/migration-verify.js
require('dotenv').config();
const mongoose = require('mongoose');

async function verifyMigration() {
  console.log('=== Verifying Database Migration ===');
  
  const Customer = require('../models/Customer');
  
  // 1. Check loanType field coverage
  const totalCustomers = await Customer.countDocuments();
  const customersWithLoanType = await Customer.countDocuments({ 
    loanType: { $exists: true, $ne: null } 
  });
  
  console.log(`Total customers: ${totalCustomers}`);
  console.log(`Customers with loanType: ${customersWithLoanType}`);
  console.log(`✅ Coverage: ${((customersWithLoanType/totalCustomers)*100).toFixed(2)}%`);
  
  // 2. Loan type distribution
  const distribution = await Customer.aggregate([
    { $group: { _id: '$loanType', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  
  console.log('\nLoan Type Distribution:');
  distribution.forEach(item => {
    console.log(`  ${item._id || 'Not Set'}: ${item.count} customers`);
  });
  
  // 3. Check for invalid loan types
  const validTypes = ['Digital Loans', 'Asset Finance', 'Consumer Loans', 'SME', 'Credit Cards'];
  const invalidLoanTypes = await Customer.find({
    loanType: { $nin: [...validTypes, null] }
  }).limit(5);
  
  console.log(`\nInvalid loan types found: ${invalidLoanTypes.length}`);
  if (invalidLoanTypes.length > 0) {
    console.log('Sample invalid records:');
    invalidLoanTypes.forEach(cust => {
      console.log(`  ${cust.customerId}: "${cust.loanType}"`);
    });
  }
  
  // 4. Check assignedTo field
  const customersAssigned = await Customer.countDocuments({
    assignedTo: { $exists: true, $ne: null }
  });
  console.log(`\nCustomers already assigned: ${customersAssigned}`);
  
  // 5. Check indexes
  console.log('\nChecking indexes...');
  const indexes = await Customer.collection.indexes();
  const hasLoanTypeIndex = indexes.some(index => 'loanType' in index.key);
  console.log(`✅ loanType index exists: ${hasLoanTypeIndex}`);
  
  return {
    totalCustomers,
    coveragePercentage: ((customersWithLoanType/totalCustomers)*100).toFixed(2),
    hasLoanTypeIndex
  };
}

module.exports = verifyMigration;

if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collects')
    .then(() => {
      console.log('Connected for migration verification');
      return verifyMigration();
    })
    .then(() => {
      console.log('\nMigration verification complete!');
      mongoose.connection.close();
    })
    .catch(err => {
      console.error('Migration verification failed:', err);
      mongoose.connection.close();
      process.exit(1);
    });
}