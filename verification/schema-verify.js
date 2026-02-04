// verification/schema-verify.js
const mongoose = require('mongoose');

async function verifyCustomerSchema() {
  console.log('=== Verifying Customer Schema ===');
  
  // Clear mongoose models cache if needed
  delete mongoose.connection.models['Customer'];
  delete mongoose.connection.models['User'];
  
  const Customer = require('../models/Customer');
  const schemaPaths = Customer.schema.paths;
  
  console.log('✅ loanType field exists:', 'loanType' in schemaPaths);
  
  if ('loanType' in schemaPaths) {
    console.log('✅ loanType enum values:', schemaPaths.loanType.enumValues);
    console.log('✅ loanType is required:', schemaPaths.loanType.isRequired);
  }
  
  console.log('✅ assignedTo field exists:', 'assignedTo' in schemaPaths);
  console.log('✅ assignmentHistory field exists:', 'assignmentHistory' in schemaPaths);
  
  // Test validation
  const testCustomer = new Customer({
    customerInternalId: 'TEST_VERIFY_' + Date.now(),
    customerId: 'CUST_TEST_' + Date.now(),
    phoneNumber: '2547' + Math.floor(Math.random() * 10000000).toString().padStart(7, '0'),
    name: 'Test Verification Customer',
    accountNumber: 'LOAN_TEST_' + Date.now(),
    loanBalance: 10000,
    arrears: 2000,
    loanType: 'Consumer Loans',
    createdBy: 'verification_script'
  });
  
  try {
    await testCustomer.validate();
    console.log('✅ Schema validation passes for sample data\n');
  } catch (error) {
    console.log('❌ Schema validation failed:', error.message);
    console.log('Error details:', error.errors);
  }
}

async function verifyUserSchema() {
  console.log('=== Verifying User Schema ===');
  const User = require('../models/User');
  const schemaPaths = User.schema.paths;
  
  console.log('✅ loanTypes field exists:', 'loanTypes' in schemaPaths);
  if ('loanTypes' in schemaPaths && schemaPaths.loanTypes.caster) {
    console.log('✅ loanTypes enum values:', schemaPaths.loanTypes.caster.enumValues);
  }
  
  console.log('✅ capacity field exists:', 'capacity' in schemaPaths);
  if ('capacity' in schemaPaths) {
    console.log('✅ capacity.maxCustomers path:', 'capacity.maxCustomers' in schemaPaths);
  }
  
  // Test officer creation
  const testOfficer = new User({
    username: 'test_officer_' + Date.now(),
    email: 'test' + Date.now() + '@verify.com',
    password: 'test123',
    firstName: 'Test',
    lastName: 'Officer',
    role: 'officer',
    loanTypes: ['Consumer Loans', 'SME'],
    department: 'Collections'
  });
  
  try {
    await testOfficer.validate();
    console.log('✅ Officer schema validation passes\n');
  } catch (error) {
    console.log('❌ Officer schema validation failed:', error.message);
  }
}

// Export if you want to use in end-to-end test
module.exports = { verifyCustomerSchema, verifyUserSchema };

// Run directly if this file is executed
if (require.main === module) {
  require('dotenv').config();
  
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collects')
    .then(() => {
      console.log('Connected to MongoDB for schema verification');
      return Promise.all([
        verifyCustomerSchema(),
        verifyUserSchema()
      ]);
    })
    .then(() => {
      console.log('Schema verification complete!');
      mongoose.connection.close();
    })
    .catch(err => {
      console.error('Verification failed:', err);
      mongoose.connection.close();
      process.exit(1);
    });
}