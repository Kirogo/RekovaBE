// scripts/rebalance-specializations.js
const mongoose = require('mongoose');
require('dotenv').config();

async function rebalanceSpecializations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔧 REBALANCING OFFICER SPECIALIZATIONS\n');
    
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    
    // 1. Get current customer distribution
    console.log('Current Customer Distribution:');
    const customerDist = await Customer.aggregate([
      { $group: { _id: '$loanType', customers: { $sum: 1 } } },
      { $sort: { customers: -1 } }
    ]);
    
    customerDist.forEach(item => {
      console.log(`  ${item._id}: ${item.customers} customers`);
    });
    
    // 2. Get current officer distribution
    console.log('\nCurrent Officer Distribution:');
    const officerDist = await User.aggregate([
      { $match: { role: 'officer', isActive: true } },
      { $group: { _id: '$loanType', officers: { $sum: 1 } } }
    ]);
    
    const officerMap = {};
    officerDist.forEach(item => {
      officerMap[item._id] = item.officers;
      console.log(`  ${item._id}: ${item.officers} officer(s)`);
    });
    
    // 3. Calculate ideal distribution
    console.log('\n📈 Calculating Ideal Distribution:');
    const totalCustomers = customerDist.reduce((sum, item) => sum + item.customers, 0);
    const totalOfficers = 2; // You have 2 officers
    
    const recommendations = customerDist.map(item => {
      const idealOfficers = Math.max(1, Math.round((item.customers / totalCustomers) * totalOfficers));
      const currentOfficers = officerMap[item._id] || 0;
      const needed = idealOfficers - currentOfficers;
      
      return {
        loanType: item._id,
        customers: item.customers,
        currentOfficers,
        idealOfficers,
        needed,
        priority: item.customers / (currentOfficers || 0.5) // Customer-to-officer ratio
      };
    }).sort((a, b) => b.priority - a.priority); // Sort by most critical need
    
    console.log('\nPriority Order (most critical first):');
    recommendations.forEach((rec, i) => {
      const status = rec.needed > 0 ? '⚠️ NEEDS OFFICER' : '✓ OK';
      console.log(`${i+1}. ${rec.loanType}: ${rec.customers} customers, ${rec.currentOfficers} officers → ${status}`);
    });
    
    // 4. Get officers and reassign based on priority
    const officers = await User.find({ role: 'officer', isActive: true })
      .select('_id username loanType');
    
    console.log('\n🔄 Reassigning Officers:');
    
    // Assign officers to highest priority loan types
    for (let i = 0; i < recommendations.length && officers.length > 0; i++) {
      const rec = recommendations[i];
      
      if (rec.needed > 0) {
        // Take an officer from a less critical loan type
        const officerToReassign = officers.find(o => 
          officerMap[o.loanType] > 1 || // Take from loan type with multiple officers
          recommendations.find(r => r.loanType === o.loanType && r.needed <= 0) // Take from OK loan type
        ) || officers[0]; // Fallback to first officer
        
        if (officerToReassign) {
          console.log(`  ${officerToReassign.username}: ${officerToReassign.loanType} → ${rec.loanType}`);
          
          await User.findByIdAndUpdate(officerToReassign._id, {
            $set: { loanType: rec.loanType }
          });
          
          // Update tracking
          officerMap[officerToReassign.loanType]--;
          officerMap[rec.loanType] = (officerMap[rec.loanType] || 0) + 1;
          rec.currentOfficers++;
          rec.needed--;
          
          // Remove from available officers
          officers.splice(officers.indexOf(officerToReassign), 1);
        }
      }
    }
    
    // 5. Final distribution
    console.log('\n✅ FINAL DISTRIBUTION:');
    const finalDist = await Customer.aggregate([
      { $group: { _id: '$loanType', customers: { $sum: 1 } } },
      { $sort: { customers: -1 } }
    ]);
    
    const finalOfficers = await User.aggregate([
      { $match: { role: 'officer', isActive: true } },
      { $group: { _id: '$loanType', officers: { $sum: 1 } } }
    ]);
    
    const finalMap = {};
    finalOfficers.forEach(item => {
      finalMap[item._id] = item.officers;
    });
    
    finalDist.forEach(item => {
      const officers = finalMap[item._id] || 0;
      const avgLoad = officers > 0 ? (item.customers / officers).toFixed(1) : '∞';
      console.log(`  ${item._id}: ${item.customers} customers, ${officers} officers (avg: ${avgLoad})`);
    });
    
    // 6. Calculate fairness score
    const loads = finalDist
      .filter(item => finalMap[item._id])
      .map(item => item.customers / finalMap[item._id]);
    
    const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
    const fairness = loads.length > 0 ? 
      (1 - (Math.max(...loads) - Math.min(...loads)) / avgLoad) * 100 : 0;
    
    console.log(`\n📊 Load Balance Fairness: ${fairness.toFixed(1)}%`);
    
    if (fairness < 70) {
      console.log('⚠️ Consider adding more officers or adjusting assignments');
    }
    
    mongoose.connection.close();
    console.log('\n🎉 Rebalancing complete!');
    
  } catch (error) {
    console.error('Rebalancing error:', error);
    process.exit(1);
  }
}

rebalanceSpecializations();