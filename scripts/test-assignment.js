// scripts/test-assignment.js
const mongoose = require('mongoose');
require('dotenv').config();
const AssignmentService = require('../services/assignmentService');

async function testAssignmentFixed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🚀 TESTING FIXED ASSIGNMENT SYSTEM\n');
    
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    
    // 1. Check officer specializations
    console.log('1. Checking Officer Specializations:');
    const officers = await User.find({ role: 'officer', isActive: true })
      .select('username loanType capacity assignedCustomers')
      .sort('loanType');
    
    officers.forEach(officer => {
      const load = (officer.capacity?.currentLoad || 0) + (officer.assignedCustomers?.length || 0);
      const max = officer.capacity?.maxCustomers || 50;
      console.log(`  ${officer.username}: ${officer.loanType} (${load}/${max} capacity)`);
    });
    
    // 2. Check unassigned customers by loan type
    console.log('\n2. Unassigned Customers by Loan Type:');
    const unassignedByType = await Customer.aggregate([
      { 
        $match: { 
          isActive: true, 
          loanBalance: { $gt: 0 },
          assignedTo: { $in: [null, undefined] }
        } 
      },
      { $group: { _id: '$loanType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    unassignedByType.forEach(item => {
      const hasOfficer = officers.some(o => o.loanType === item._id);
      const officerCount = officers.filter(o => o.loanType === item._id).length;
      console.log(`  ${item._id}: ${item.count} customers - ${officerCount} officer(s)`);
    });
    
    // 3. Test assignment for each loan type
    console.log('\n3. Testing Assignment by Loan Type:');
    
    for (const type of unassignedByType) {
      console.log(`\n📋 Assigning ${type._id} customers:`);
      
      try {
        const result = await AssignmentService.assignCustomersToOfficers({
          loanType: type._id,
          limit: Math.min(10, type.count), // Small batch for testing
          excludeAssigned: true
        });
        
        if (result.success) {
          console.log(`  ✅ ${result.message}`);
          
          // Show assignment details
          if (result.assignments && result.assignments.length > 0) {
            const successful = result.assignments.filter(a => a.success);
            const failed = result.assignments.filter(a => !a.success);
            
            console.log(`  📊 Results: ${successful.length} successful, ${failed.length} failed`);
            
            if (successful.length > 0) {
              // Group by officer
              const byOfficer = {};
              successful.forEach(assignment => {
                if (!byOfficer[assignment.officerName]) {
                  byOfficer[assignment.officerName] = 0;
                }
                byOfficer[assignment.officerName]++;
              });
              
              console.log(`  👥 Distribution:`);
              Object.entries(byOfficer).forEach(([officer, count]) => {
                console.log(`    ${officer}: ${count} customers`);
              });
            }
          }
        } else {
          console.log(`  ❌ ${result.message}`);
        }
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }
    
    // 4. Verify no duplicates
    console.log('\n4. Checking for Duplicate Assignments:');
    const duplicates = await AssignmentService.checkForDuplicates();
    
    if (duplicates.length === 0) {
      console.log('  ✅ No duplicate assignments found!');
    } else {
      console.log(`  ❌ Found ${duplicates.length} duplicate assignments`);
      // Get officer names for better reporting
      for (const dup of duplicates) {
        const officer = await User.findById(dup._id).select('username');
        console.log(`    Officer ${officer?.username || dup._id}: ${dup.customerCount} customers`);
      }
    }
    
    // 5. Final check with stats
    console.log('\n5. Final Assignment Status:');
    const stats = await AssignmentService.getAssignmentStats();
    
    if (stats) {
      const total = stats.totalCustomers[0]?.count || 0;
      const assigned = stats.assignedCustomers[0]?.count || 0;
      
      console.log(`  Total customers: ${total}`);
      console.log(`  Assigned customers: ${assigned}`);
      console.log(`  Assignment rate: ${total > 0 ? ((assigned/total)*100).toFixed(1) : 0}%`);
      
      console.log('\n  Breakdown by Loan Type:');
      stats.byLoanType.forEach(item => {
        const rate = item.total > 0 ? ((item.assigned/item.total)*100).toFixed(1) : 0;
        console.log(`    ${item._id}: ${item.assigned}/${item.total} (${rate}%)`);
      });
    }
    
    // 6. Show current officer loads
    console.log('\n6. Current Officer Loads:');
    const updatedOfficers = await User.find({ role: 'officer', isActive: true })
      .select('username loanType assignedCustomers capacity');
    
    updatedOfficers.forEach(officer => {
      const assignedCount = officer.assignedCustomers?.length || 0;
      const currentLoad = officer.capacity?.currentLoad || 0;
      const totalLoad = assignedCount + currentLoad;
      const maxCapacity = officer.capacity?.maxCustomers || 50;
      const utilization = ((totalLoad / maxCapacity) * 100).toFixed(1);
      console.log(`  ${officer.username} (${officer.loanType}): ${totalLoad}/${maxCapacity} (${utilization}%)`);
    });
    
    mongoose.connection.close();
    console.log('\n🎉 Test complete!');
    
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
}

testAssignmentFixed();