// check-indexes.js
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Load models
    const Customer = require('./models/Customer');
    
    console.log('\n=== Checking Customer Schema ===');
    console.log('Schema paths:');
    Object.keys(Customer.schema.paths).forEach(path => {
      const field = Customer.schema.paths[path];
      console.log(`  ${path}:`, {
        type: field.instance,
        index: field._index,
        unique: field._unique
      });
    });
    
    console.log('\nSchema indexes:');
    console.log(Customer.schema._indexes);
    
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });