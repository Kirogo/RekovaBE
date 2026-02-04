// verification/end-to-end-test.js
const mongoose = require('mongoose');

async function runEndToEndTest() {
  console.log('🚀 RUNNING END-TO-END VERIFICATION\n');
  
  try {
    // Load environment
    require('dotenv').config();
    
    console.log('1. Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/collects');
    console.log('✅ Connected to MongoDB\n');
    
    // Run schema verification
    const { verifyCustomerSchema, verifyUserSchema } = require('./schema-verify');
    await verifyCustomerSchema();
    await verifyUserSchema();
    
    // Run migration verification
    const verifyMigration = require('./migration-verify');
    const migrationResults = await verifyMigration();
    
    // Run assignment verification
    const verifyAssignmentAlgorithm = require('./assignment-verify');
    await verifyAssignmentAlgorithm();
    
    console.log('\n🎉 ALL VERIFICATIONS COMPLETE!');
    
    // Summary report
    console.log('\n📊 VERIFICATION SUMMARY:');
    console.log('=======================');
    console.log('1. Schema Updates: ✓ COMPLETE');
    console.log('2. Database Migration: ✓ ' + migrationResults.coveragePercentage + '% coverage');
    console.log('3. Assignment Algorithm: ✓ READY FOR TESTING');
    console.log('4. Database Connection: ✓ STABLE');
    
    return { success: true, migrationResults };
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Stack trace:', error.stack);
    return { success: false, error: error.message };
  } finally {
    await mongoose.connection.close();
    console.log('\n🔗 Database connection closed');
  }
}

// Export for use in other files
module.exports = runEndToEndTest;

// Run if this file is executed directly
if (require.main === module) {
  runEndToEndTest()
    .then(results => {
      if (results.success) {
        console.log('\n✅ All systems go! Ready for next phase.');
        process.exit(0);
      } else {
        console.log('\n❌ Please fix the issues above before proceeding.');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}