// verification/assignment-verify.js
require('dotenv').config();

async function verifyAssignmentAlgorithm() {
  console.log('=== Verifying Assignment Algorithm ===');
  
  // First, ensure assignmentService.js exists
  try {
    // Check if the service file exists
    const fs = require('fs');
    const path = require('path');
    
    const servicePath = path.join(__dirname, '../services/assignmentService.js');
    if (!fs.existsSync(servicePath)) {
      console.log('⚠️ assignmentService.js not created yet. Creating basic test...');
      
      // Test basic logic without the service
      const Customer = require('../models/Customer');
      const User = require('../models/User');
      
      // Check data availability
      const officerCount = await User.countDocuments({ role: 'officer', isActive: true });
      const customerCount = await Customer.countDocuments({ 
        isActive: true, 
        loanBalance: { $gt: 0 },
        assignedTo: { $in: [null, undefined] }
      });
      
      console.log(`Active officers: ${officerCount}`);
      console.log(`Unassigned customers: ${customerCount}`);
      console.log('\n✅ Basic data check complete');
      console.log('📝 Next: Create assignmentService.js with the code provided');
      
      return { basicCheck: true };
    }
    
    // If service exists, test it
    const AssignmentService = require('../services/assignmentService');
    
    console.log('1. Testing getAvailableOfficers...');
    const officers = await AssignmentService.getAvailableOfficers('Consumer Loans');
    console.log(`✅ Found ${officers.length} officers for Consumer Loans`);
    
    console.log('\n2. Testing getUnassignedCustomers...');
    const customers = await AssignmentService.getUnassignedCustomers({
      loanType: 'Consumer Loans',
      limit: 5
    });
    console.log(`✅ Found ${customers.length} unassigned customers`);
    
    console.log('\n3. Checking for duplicates...');
    const duplicates = await AssignmentService.checkForDuplicates();
    console.log(`✅ Duplicate assignments found: ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log('⚠️ Please fix these duplicates before proceeding');
    }
    
    return {
      officersFound: officers.length,
      customersFound: customers.length,
      duplicatesFound: duplicates.length
    };
    
  } catch (error) {
    console.error('❌ Assignment verification error:', error.message);
    console.log('\n💡 Tip: Make sure assignmentService.js is in services/ folder');
    throw error;
  }
}

module.exports = verifyAssignmentAlgorithm;

if (require.main === module) {
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collects')
    .then(() => {
      console.log('Connected for assignment verification');
      return verifyAssignmentAlgorithm();
    })
    .then(() => {
      console.log('\nAssignment verification complete!');
      mongoose.connection.close();
    })
    .catch(err => {
      console.error('Assignment verification failed:', err);
      mongoose.connection.close();
      process.exit(1);
    });
}