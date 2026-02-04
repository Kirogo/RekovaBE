// scripts/setup-officer-specializations.js - FIXED VERSION
const mongoose = require('mongoose');
require('dotenv').config();

async function setupOfficerSpecializations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    
    // 1. Get all active officers
    const officers = await User.find({ 
      role: 'officer', 
      isActive: true 
    }).select('_id username email loanTypes loanType');
    
    console.log(`Found ${officers.length} active officers`);
    
    // 2. First handle officers with old loanTypes array
    const officersWithArray = officers.filter(o => 
      o.loanTypes && Array.isArray(o.loanTypes) && o.loanTypes.length > 0
    );
    
    console.log(`Officers with old loanTypes array: ${officersWithArray.length}`);
    
    // Migrate old loanTypes to new loanType field
    for (const officer of officersWithArray) {
      // Take the first loan type from the array
      const newLoanType = officer.loanTypes[0];
      
      await User.findByIdAndUpdate(officer._id, {
        $set: { loanType: newLoanType },
        $unset: { loanTypes: "" } // Remove old field
      });
      
      console.log(`✓ Migrated ${officer.username}: ${officer.loanTypes} → ${newLoanType}`);
    }
    
    // 3. Now assign loan types to all officers (including newly migrated ones)
    const allOfficers = await User.find({ 
      role: 'officer', 
      isActive: true 
    }).select('_id username email loanType');
    
    const loanTypes = ['Digital Loans', 'Asset Finance', 'Consumer Loans', 'SME', 'Credit Cards'];
    const typeDistribution = {};
    
    for (const officer of allOfficers) {
      let assignedType = officer.loanType;
      
      // If officer already has a loanType, keep it
      if (!assignedType || !loanTypes.includes(assignedType)) {
        // Assign based on customer distribution if possible
        const customerCounts = await Customer.aggregate([
          { $match: { loanType: { $in: loanTypes } } },
          { $group: { _id: '$loanType', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]);
        
        // Find loan type with most customers but fewest officers
        if (customerCounts.length > 0) {
          // Sort by customer count (descending)
          customerCounts.sort((a, b) => b.count - a.count);
          
          // Get current distribution of officers
          const currentOfficerDist = await User.aggregate([
            { $match: { role: 'officer', isActive: true, loanType: { $in: loanTypes } } },
            { $group: { _id: '$loanType', officers: { $sum: 1 } } }
          ]);
          
          const officerDistMap = {};
          currentOfficerDist.forEach(item => {
            officerDistMap[item._id] = item.officers;
          });
          
          // Find loan type with highest customer-to-officer ratio
          let bestType = customerCounts[0]._id;
          let bestRatio = 0;
          
          for (const type of customerCounts) {
            const officersForType = officerDistMap[type._id] || 0;
            const ratio = officersForType === 0 ? type.count : type.count / officersForType;
            
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestType = type._id;
            }
          }
          
          assignedType = bestType;
        } else {
          // Random assignment as fallback
          assignedType = loanTypes[Math.floor(Math.random() * loanTypes.length)];
        }
        
        await User.findByIdAndUpdate(officer._id, {
          $set: { loanType: assignedType }
        });
      }
      
      // Track distribution
      typeDistribution[assignedType] = (typeDistribution[assignedType] || 0) + 1;
      
      console.log(`✓ Officer ${officer.username}: ${assignedType}`);
    }
    
    // 4. Show distribution
    console.log('\n📊 Officer Specialization Distribution:');
    Object.entries(typeDistribution).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} officer(s)`);
    });
    
    // 5. Check customer distribution by loan type
    console.log('\n📊 Customer Distribution by Loan Type:');
    const customerDistribution = await Customer.aggregate([
      { $group: { _id: '$loanType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    customerDistribution.forEach(item => {
      const officersForType = typeDistribution[item._id] || 0;
      const avgCustomersPerOfficer = officersForType > 0 ? (item.count / officersForType).toFixed(1) : 'N/A';
      console.log(`  ${item._id}: ${item.count} customers, ${officersForType} officers (avg: ${avgCustomersPerOfficer})`);
    });
    
    // 6. Check if we need to adjust for Consumer Loans (you have 15 customers, 0 officers)
    if (customerDistribution.some(item => item._id === 'Consumer Loans' && typeDistribution['Consumer Loans'] === 0)) {
      console.log('\n⚠️ CRITICAL: No officers assigned to handle Consumer Loans!');
      console.log('You have 15 Consumer Loans customers but 0 officers specialized in it.');
      console.log('Reassigning one officer to Consumer Loans...');
      
      // Find an officer to reassign
      const officerToReassign = allOfficers.find(o => 
        o.loanType !== 'Consumer Loans' && 
        typeDistribution[o.loanType] > 1 // Don't leave a loan type with 0 officers
      );
      
      if (officerToReassign) {
        await User.findByIdAndUpdate(officerToReassign._id, {
          $set: { loanType: 'Consumer Loans' }
        });
        
        console.log(`✓ Reassigned ${officerToReassign.username} to Consumer Loans`);
        
        // Update distribution
        typeDistribution[officerToReassign.loanType]--;
        typeDistribution['Consumer Loans'] = (typeDistribution['Consumer Loans'] || 0) + 1;
        
        console.log('\n📊 Updated Distribution:');
        Object.entries(typeDistribution).forEach(([type, count]) => {
          console.log(`  ${type}: ${count} officer(s)`);
        });
      } else {
        console.log('❌ Could not find suitable officer to reassign. Manual intervention needed.');
      }
    }
    
    mongoose.connection.close();
    console.log('\n✅ Officer specialization setup complete!');
    
    // Show final recommendation
    console.log('\n💡 RECOMMENDATION:');
    console.log('Based on your 15 Consumer Loans customers, you should have:');
    console.log('1. At least 1-2 officers specializing in Consumer Loans');
    console.log('2. Consider creating test customers for other loan types');
    
  } catch (error) {
    console.error('Setup error:', error);
    process.exit(1);
  }
}

setupOfficerSpecializations();