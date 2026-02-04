// Create a new migration script: scripts/fix-loan-types.js
const mongoose = require('mongoose');
require('dotenv').config();

async function fixLoanTypes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const Customer = require('../models/Customer');
    
    // Fix lowercase "consumer" to "Consumer Loans"
    const result = await Customer.updateMany(
      { loanType: 'consumer' },
      { $set: { loanType: 'Consumer Loans' } }
    );
    
    console.log(`Fixed ${result.modifiedCount} customer loan types from "consumer" to "Consumer Loans"`);
    
    // Also fix any other potential case issues
    const mapping = {
      'digital': 'Digital Loans',
      'asset': 'Asset Finance', 
      'sme': 'SME',
      'credit': 'Credit Cards',
      'credit card': 'Credit Cards'
    };
    
    for (const [oldValue, newValue] of Object.entries(mapping)) {
      const regex = new RegExp(`^${oldValue}$`, 'i'); // Case insensitive
      const fixResult = await Customer.updateMany(
        { loanType: { $regex: regex } },
        { $set: { loanType: newValue } }
      );
      
      if (fixResult.modifiedCount > 0) {
        console.log(`Fixed ${fixResult.modifiedCount} customers to "${newValue}"`);
      }
    }
    
    // Validate all loan types now
    const invalid = await Customer.find({
      loanType: { 
        $nin: ['Digital Loans', 'Asset Finance', 'Consumer Loans', 'SME', 'Credit Cards'] 
      }
    });
    
    console.log(`\nRemaining invalid loan types: ${invalid.length}`);
    
    if (invalid.length > 0) {
      console.log('Setting remaining invalid types to "Consumer Loans"...');
      await Customer.updateMany(
        { loanType: { $nin: ['Digital Loans', 'Asset Finance', 'Consumer Loans', 'SME', 'Credit Cards'] } },
        { $set: { loanType: 'Consumer Loans' } }
      );
    }
    
    mongoose.connection.close();
    console.log('\n✅ Loan type fix completed!');
    
  } catch (error) {
    console.error('Fix error:', error);
    process.exit(1);
  }
}

fixLoanTypes();