// scripts/migrate-loan-types.js
const mongoose = require('mongoose');
require('dotenv').config();

async function migrateLoanTypes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get Customer model
    const Customer = require('../models/Customer');
    
    // Count customers with loanType
    const customersWithLoanType = await Customer.find({ 
      loanType: { $exists: true } 
    }).countDocuments();
    
    console.log(`Customers with loanType: ${customersWithLoanType}`);
    
    // For customers without loanType, set default
    const customersWithoutLoanType = await Customer.updateMany(
      { loanType: { $exists: false } },
      { $set: { loanType: 'Consumer Loans' } }
    );
    
    console.log(`Updated ${customersWithoutLoanType.modifiedCount} customers with default loan type`);
    
    // Create index for loanType
    await Customer.collection.createIndex({ loanType: 1 });
    console.log('Created index for loanType field');
    
    // Ensure assignedTo field exists
    const customersWithAssignedTo = await Customer.find({
      assignedTo: { $exists: true, $ne: null }
    }).countDocuments();
    
    console.log(`Customers already assigned: ${customersWithAssignedTo}`);
    
    mongoose.connection.close();
    console.log('Migration completed successfully');
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateLoanTypes();