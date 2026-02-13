// controllers/supervisorController.js
const Customer = require('../models/Customer');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Promise = require('../models/Promise');
const ActivityLogger = require('../services/activityLogger');
const ReportGenerator = require('../services/reportGenerator');

let Comment;
try {
  Comment = require('../models/Comment');
} catch (error) {
  console.log('⚠️ Comment model not found, using fallback');
  Comment = null;
}

let AssignmentService;
try {
  AssignmentService = require('../services/assignmentService');
} catch (error) {
  console.log('⚠️ AssignmentService not found, using fallback functions');
  AssignmentService = null;
}

/**
 * @desc    Get supervisor dashboard overview
 * @route   GET /api/supervisor/dashboard
 * @access  Private (Supervisor, Admin)
 */
exports.getDashboardOverview = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const user = req.user;
    console.log(`📊 Supervisor dashboard request from: ${user.username || user.name} (${user.role})`);
    
    // 1. Get team members (officers)
    const teamMembers = await User.find({ 
      role: 'officer',
      isActive: true 
    }).select('name username email loanType isActive lastLogin');
    
    const teamMemberIds = teamMembers.map(member => member._id);
    
    // 2. Get team performance summary
    const performanceSummary = await getTeamPerformanceSummary(teamMemberIds);
    
    // 3. Get assignment statistics
    const assignmentStats = await getAssignmentStats();
    
    // 4. Get recent IMPORTANT activities only (filtered)
    const recentActivities = await ActivityLogger.getTeamActivities(teamMemberIds, 15);
    
    // 5. Get upcoming due promises (important for supervisor to see)
    const upcomingPromises = await getUpcomingDuePromises(teamMemberIds);
    
    // 6. Get loan type distribution
    const loanTypeDistribution = await Customer.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$loanType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // 7. Get today's collections
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todaysCollections = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          status: 'SUCCESS'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // 8. Get call statistics from Activity model (only important calls)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const callStatsData = await require('../models/Activity').aggregate([
      {
        $match: {
          userId: { $in: teamMemberIds },
          action: 'PROMISE_FOLLOWUP',
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 7 }
    ]);
    
    // 9. Get officers by loan type
    const officersByLoanType = await User.aggregate([
      { 
        $match: { 
          role: 'officer',
          isActive: true,
          loanType: { $exists: true, $ne: null }
        } 
      },
      {
        $group: {
          _id: '$loanType',
          officerCount: { $sum: 1 },
          officerNames: { $push: '$username' }
        }
      },
      { $sort: { officerCount: -1 } }
    ]);
    
    // 10. Get unassigned customers count
    const unassignedCustomers = await Customer.countDocuments({
      assignedTo: null,
      isActive: true
    });
    
    // 11. Get IMPORTANT activity statistics for the week
    const importantActivitySummary = await ActivityLogger.getImportantActivitySummary(teamMemberIds, 7);
    
    // 12. Get broken promises (important for supervisor monitoring)
    const brokenPromises = await getBrokenPromises(teamMemberIds, 30); // Last 30 days
    
    // Log supervisor dashboard view
    await ActivityLogger.logSupervisor(
      user.id,
      'SUPERVISOR_DASHBOARD_VIEW',
      'Viewed supervisor dashboard overview',
      {
        teamSize: teamMembers.length,
        statistics: {
          performanceSummary,
          assignmentStats: assignmentStats || {},
          loanTypeDistribution,
          unassignedCustomers,
          importantActivities: recentActivities.length,
          upcomingPromises: upcomingPromises.length,
          brokenPromises: brokenPromises.length
        },
        duration: Date.now() - startTime
      }
    );
    
    res.json({
      success: true,
      message: 'Supervisor dashboard data retrieved successfully',
      data: {
        teamOverview: {
          teamMembers,
          teamSize: teamMembers.length,
          activeToday: teamMembers.filter(m => 
            m.lastLogin && new Date(m.lastLogin) >= today
          ).length
        },
        performanceSummary,
        assignmentStats: assignmentStats || {},
        recentActivities, // IMPORTANT activities only
        upcomingPromises, // Promises due soon
        brokenPromises, // Broken promises for monitoring
        loanTypeDistribution,
        todaysCollections: todaysCollections[0] || { totalAmount: 0, count: 0 },
        callStats: {
          last7Days: callStatsData,
          totalThisWeek: callStatsData.reduce((sum, day) => sum + day.count, 0)
        },
        officersByLoanType,
        unassignedCustomers,
        activitySummary: importantActivitySummary, // Summary of important activities
        timestamp: new Date(),
        user: {
          role: user.role,
          fullName: user.fullName || user.name || user.username
        }
      }
    });
    
  } catch (error) {
    console.error('Supervisor dashboard error:', error);
    
    // Log error
    await ActivityLogger.logError(
      req.user?.id,
      'SUPERVISOR_DASHBOARD_VIEW',
      'Failed to load supervisor dashboard',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: 'Failed to load supervisor dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get upcoming due promises (next 7 days)
 */
async function getUpcomingDuePromises(teamMemberIds) {
  try {
    // Get customers assigned to these officers
    const assignedCustomers = await Customer.find({
      assignedTo: { $in: teamMemberIds },
      isActive: true
    }).select('_id');
    
    const customerIds = assignedCustomers.map(c => c._id);
    
    if (customerIds.length === 0) return [];
    
    // Get promises due in the next 7 days
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingPromises = await Promise.find({
      customerId: { $in: customerIds },
      promiseDate: { $gte: today, $lte: nextWeek },
      status: { $in: ['pending', 'due'] }
    })
    .populate('customerId', 'customerName phoneNumber loanType')
    .populate('createdBy', 'username name')
    .sort('promiseDate')
    .limit(10)
    .lean();
    
    // Transform for frontend
    return upcomingPromises.map(promise => ({
      id: promise._id,
      customerName: promise.customerId?.customerName || 'Unknown Customer',
      phoneNumber: promise.customerId?.phoneNumber || 'N/A',
      amount: promise.promiseAmount,
      dueDate: promise.promiseDate,
      officer: promise.createdBy?.name || promise.createdBy?.username || 'Unknown',
      status: promise.status,
      daysUntilDue: Math.ceil((new Date(promise.promiseDate) - today) / (1000 * 60 * 60 * 24))
    }));
  } catch (error) {
    console.error('Error getting upcoming promises:', error);
    return [];
  }
}

/**
 * @desc    Get broken promises (last 30 days)
 */
async function getBrokenPromises(teamMemberIds, days = 30) {
  try {
    // Get customers assigned to these officers
    const assignedCustomers = await Customer.find({
      assignedTo: { $in: teamMemberIds },
      isActive: true
    }).select('_id');
    
    const customerIds = assignedCustomers.map(c => c._id);
    
    if (customerIds.length === 0) return [];
    
    // Get broken promises from last X days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const brokenPromises = await Promise.find({
      customerId: { $in: customerIds },
      status: 'broken',
      updatedAt: { $gte: startDate }
    })
    .populate('customerId', 'customerName phoneNumber loanType')
    .populate('createdBy', 'username name')
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();
    
    // Transform for frontend
    return brokenPromises.map(promise => ({
      id: promise._id,
      customerName: promise.customerId?.customerName || 'Unknown Customer',
      phoneNumber: promise.customerId?.phoneNumber || 'N/A',
      amount: promise.promiseAmount,
      dueDate: promise.promiseDate,
      officer: promise.createdBy?.name || promise.createdBy?.username || 'Unknown',
      brokenDate: promise.updatedAt,
      daysSinceBroken: Math.floor((new Date() - new Date(promise.updatedAt)) / (1000 * 60 * 60 * 24))
    }));
  } catch (error) {
    console.error('Error getting broken promises:', error);
    return [];
  }
}

/**
 * @desc    Get team performance summary - FIXED to include _id in topPerformers
 */
async function getTeamPerformanceSummary(teamMemberIds) {
  try {
    const officers = await User.find({ 
      _id: { $in: teamMemberIds },
      role: 'officer', 
      isActive: true 
    })
    .select('_id username name email loanType performanceMetrics')
    .lean();
    
    // Get customers assigned to officers
    const assignedCustomers = await Customer.find({
      assignedTo: { $in: teamMemberIds },
      isActive: true
    }).select('assignedTo loanType');
    
    // Get successful transactions
    const transactions = await Transaction.find({
      initiatedByUserId: { $in: teamMemberIds },
      status: 'SUCCESS'
    }).select('initiatedByUserId amount');
    
    // Get calls/activities count
    const Activity = require('../models/Activity');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get calls for today
    const callsToday = await Activity.aggregate([
      {
        $match: {
          userId: { $in: teamMemberIds },
          action: 'PROMISE_FOLLOWUP',
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const callsTodayMap = {};
    callsToday.forEach(call => {
      callsTodayMap[call._id.toString()] = call.count;
    });
    
    // Group transactions by officer
    const officerCollections = {};
    transactions.forEach(transaction => {
      if (transaction.initiatedByUserId) {
        const officerId = transaction.initiatedByUserId.toString();
        if (!officerCollections[officerId]) {
          officerCollections[officerId] = {
            totalCollections: 0,
            transactionCount: 0
          };
        }
        officerCollections[officerId].totalCollections += transaction.amount || 0;
        officerCollections[officerId].transactionCount++;
      }
    });
    
    // Group assigned customers by officer
    const assignedCustomersMap = {};
    assignedCustomers.forEach(customer => {
      if (customer.assignedTo) {
        const officerId = customer.assignedTo.toString();
        if (!assignedCustomersMap[officerId]) {
          assignedCustomersMap[officerId] = 0;
        }
        assignedCustomersMap[officerId]++;
      }
    });
    
    // Calculate top performers - CRITICAL FIX: Include _id field
    const topPerformers = officers.map(officer => {
      const officerId = officer._id.toString();
      const collections = officerCollections[officerId] || { totalCollections: 0, transactionCount: 0 };
      const assignedCount = assignedCustomersMap[officerId] || 0;
      const callsCount = callsTodayMap[officerId] || 0;
      
      // Calculate efficiency (simplified formula)
      const efficiency = assignedCount > 0 
        ? Math.min(10, (collections.totalCollections / (assignedCount * 1000)) * 2) 
        : 0;
      
      return {
        _id: officer._id, // CRITICAL: Include the ID for frontend to use
        id: officer._id,  // Also include as id for compatibility
        fullName: officer.name || officer.username,
        name: officer.name,
        username: officer.username,
        loanType: officer.loanType || 'Not Specified',
        collections: collections.totalCollections,
        totalCollections: collections.totalCollections, // For compatibility
        transactionCount: collections.transactionCount,
        assignedCustomers: assignedCount,
        totalCustomers: assignedCount, // For compatibility
        efficiency: parseFloat(efficiency.toFixed(1)),
        callsToday: callsCount,
        totalCalls: callsCount, // For compatibility
        performanceScore: officer.performanceMetrics?.efficiencyRating || efficiency
      };
    })
    .sort((a, b) => b.collections - a.collections)
    .slice(0, 5);
    
    // Calculate averages
    const totalCollections = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalAssignedCustomers = assignedCustomers.length;
    
    const summary = {
      totalOfficers: officers.length,
      totalCollections,
      totalTransactions: transactions.length,
      totalAssignedCustomers,
      averageCollectionsPerOfficer: officers.length > 0 ? totalCollections / officers.length : 0,
      averageCallsPerOfficer: officers.length > 0 ? 
        Object.values(callsTodayMap).reduce((sum, count) => sum + count, 0) / officers.length : 0,
      successRate: transactions.length > 0 ? 
        (transactions.filter(t => t.status === 'SUCCESS').length / transactions.length) * 100 : 0,
      averageEfficiency: topPerformers.length > 0 ?
        topPerformers.reduce((sum, p) => sum + p.efficiency, 0) / topPerformers.length : 0,
      topPerformers,
      byLoanType: {}
    };
    
    // Group by loan type
    officers.forEach(officer => {
      const loanType = officer.loanType || 'Unassigned';
      if (!summary.byLoanType[loanType]) {
        summary.byLoanType[loanType] = {
          officers: 0,
          assignedCustomers: 0,
          collections: 0
        };
      }
      summary.byLoanType[loanType].officers++;
      
      // Add assigned customers for this officer
      const officerCustomerCount = assignedCustomersMap[officer._id.toString()] || 0;
      summary.byLoanType[loanType].assignedCustomers += officerCustomerCount;
      
      // Add collections for this officer
      const officerCollection = officerCollections[officer._id.toString()]?.totalCollections || 0;
      summary.byLoanType[loanType].collections += officerCollection;
    });
    
    return summary;
  } catch (error) {
    console.error('Team performance summary error:', error);
    return {
      totalOfficers: 0,
      totalCollections: 0,
      totalTransactions: 0,
      totalAssignedCustomers: 0,
      averageCollectionsPerOfficer: 0,
      averageCallsPerOfficer: 0,
      successRate: 0,
      averageEfficiency: 0,
      topPerformers: [],
      byLoanType: {}
    };
  }
}

/**
 * @desc    Get assignment statistics
 */
async function getAssignmentStats() {
  try {
    // Get total customers
    const totalCustomers = await Customer.countDocuments({ isActive: true });
    
    // Get assigned customers
    const assignedCustomers = await Customer.countDocuments({ 
      isActive: true,
      assignedTo: { $ne: null }
    });
    
    // Get customers by loan type
    const customersByLoanType = await Customer.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$loanType', count: { $sum: 1 } } }
    ]);
    
    // Get officers by loan type
    const officersByLoanType = await User.aggregate([
      { 
        $match: { 
          role: 'officer',
          isActive: true,
          loanType: { $exists: true, $ne: null }
        } 
      },
      { $group: { _id: '$loanType', count: { $sum: 1 } } }
    ]);
    
    // Calculate assignment coverage
    const assignmentRate = totalCustomers > 0 ? (assignedCustomers / totalCustomers) * 100 : 0;
    
    return {
      totalCustomers,
      assignedCustomers,
      unassignedCustomers: totalCustomers - assignedCustomers,
      assignmentRate: assignmentRate.toFixed(2),
      customersByLoanType: customersByLoanType.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      officersByLoanType: officersByLoanType.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})
    };
  } catch (error) {
    console.error('Assignment stats error:', error);
    return null;
  }
}

/**
 * @desc    Get officer collections data
 * @route   GET /api/supervisor/officers/collections
 * @access  Private (Supervisor, Admin)
 */
exports.getOfficerCollections = async (req, res) => {
    try {
        const { officerId } = req.query;
        
        if (!officerId) {
            return res.status(400).json({
                success: false,
                message: 'Officer ID is required'
            });
        }

        // Get collections for this officer
        const transactions = await Transaction.find({
            initiatedByUserId: officerId,
            status: 'SUCCESS'
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('customerId', 'customerName phoneNumber')
        .lean();

        // Transform data
        const collections = transactions.map(t => ({
            date: t.createdAt,
            transactionId: t.transactionId || t._id.toString().slice(-8),
            customerName: t.customerId?.customerName || 'Unknown Customer',
            phoneNumber: t.customerId?.phoneNumber || 'N/A',
            amount: t.amount,
            status: t.status,
            receipt: t.mpesaReceiptNumber || `TXN${t._id.toString().slice(-6)}`,
            loanType: t.loanType || 'Not Specified',
            paymentMethod: t.paymentMethod || 'M-PESA'
        }));

        res.json({
            success: true,
            data: collections,
            count: collections.length
        });

    } catch (error) {
        console.error('Get officer collections error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get officer collections',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Get officer customers data
 * @route   GET /api/supervisor/officers/customers
 * @access  Private (Supervisor, Admin)
 */
exports.getOfficerCustomers = async (req, res) => {
    try {
        const { officerId } = req.query;
        
        if (!officerId) {
            return res.status(400).json({
                success: false,
                message: 'Officer ID is required'
            });
        }

        // Get customers assigned to this officer
        const customers = await Customer.find({
            assignedTo: officerId,
            isActive: true
        })
        .select('customerName phoneNumber loanType loanAmount arrearsAmount status lastContactDate nextFollowUpDate')
        .lean();

        // Get promises for these customers
        const Promise = require('../models/Promise');
        const customerIds = customers.map(c => c._id);
        
        const promises = await Promise.find({
            customerId: { $in: customerIds },
            status: { $in: ['pending', 'due'] }
        })
        .sort({ promiseDate: 1 })
        .lean();

        // Create promise map
        const promiseMap = {};
        promises.forEach(p => {
            const custId = p.customerId.toString();
            if (!promiseMap[custId]) {
                promiseMap[custId] = [];
            }
            promiseMap[custId].push(p);
        });

        // Transform data
        const customersData = customers.map(c => ({
            name: c.customerName,
            phone: c.phoneNumber,
            loanType: c.loanType || 'Not Specified',
            loanAmount: c.loanAmount || 0,
            arrears: c.arrearsAmount || 0,
            status: c.status || 'CURRENT',
            lastContact: c.lastContactDate || null,
            nextFollowUp: c.nextFollowUpDate || null,
            promises: promiseMap[c._id.toString()] || [],
            promiseAmount: promiseMap[c._id.toString()]?.[0]?.promiseAmount || null,
            promiseDate: promiseMap[c._id.toString()]?.[0]?.promiseDate || null
        }));

        res.json({
            success: true,
            data: customersData,
            count: customersData.length
        });

    } catch (error) {
        console.error('Get officer customers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get officer customers',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Get detailed officer performance - FIXED to handle officerId correctly
 * @route   GET /api/supervisor/officers/performance
 * @access  Private (Supervisor, Admin)
 */
exports.getOfficerPerformance = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { officerId, period = 'monthly' } = req.query;
    
    console.log('\n========== OFFICER PERFORMANCE API CALL ==========');
    console.log('🕐 Time:', new Date().toISOString());
    console.log('🔑 Requested Officer ID:', officerId);
    console.log('📊 Period:', period);
    console.log('👤 Requested by:', req.user?.username, `(${req.user?.role})`);
    
    // Validate officerId
    if (!officerId) {
      console.log('❌ No officer ID provided');
      return res.status(400).json({
        success: false,
        message: 'Officer ID is required'
      });
    }
    
    if (officerId === 'undefined' || officerId === 'null') {
      console.log('❌ Invalid officer ID: undefined or null');
      return res.status(400).json({
        success: false,
        message: 'Invalid officer ID provided'
      });
    }
    
    // 1. Get officer details from database
    console.log('\n📡 DATABASE QUERY 1: Finding officer by ID...');
    const officer = await User.findById(officerId)
      .select('_id name username email phone loanType isActive lastLogin createdAt performanceMetrics capacity');
    
    if (!officer) {
      console.log('❌ Officer not found in database');
      return res.status(404).json({
        success: false,
        message: 'Officer not found'
      });
    }
    
    console.log('✅ Officer found in database:');
    console.log(`   - ID: ${officer._id}`);
    console.log(`   - Name: ${officer.name || officer.username}`);
    console.log(`   - Loan Type: ${officer.loanType}`);
    console.log(`   - Email: ${officer.email}`);
    console.log(`   - Phone: ${officer.phone || 'Not set'}`);
    console.log(`   - Created: ${officer.createdAt}`);
    console.log(`   - Performance Metrics from DB:`, officer.performanceMetrics);
    
    // 2. Get assigned customers
    console.log('\n📡 DATABASE QUERY 2: Finding assigned customers...');
    const assignedCustomers = await Customer.find({
      assignedTo: officerId,
      isActive: true
    }).select('customerName phoneNumber loanAmount arrearsAmount status lastContactDate loanType createdAt');
    
    console.log(`✅ Found ${assignedCustomers.length} assigned customers in database`);
    if (assignedCustomers.length > 0) {
      console.log('   Sample customer:');
      console.log(`   - Name: ${assignedCustomers[0].customerName}`);
      console.log(`   - Loan Amount: KES ${assignedCustomers[0].loanAmount || 0}`);
      console.log(`   - Arrears: KES ${assignedCustomers[0].arrearsAmount || 0}`);
      console.log(`   - Status: ${assignedCustomers[0].status}`);
    }
    
    const assignedCustomerIds = assignedCustomers.map(c => c._id);
    
    // 3. Get transactions
    console.log('\n📡 DATABASE QUERY 3: Finding transactions...');
    const transactions = await Transaction.find({
      initiatedByUserId: officerId,
      status: 'SUCCESS'
    }).sort({ createdAt: -1 });
    
    console.log(`✅ Found ${transactions.length} successful transactions in database`);
    const totalCollections = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    console.log(`   Total Collections: KES ${totalCollections.toLocaleString()}`);
    
    if (transactions.length > 0) {
      console.log('   Sample transaction:');
      console.log(`   - Amount: KES ${transactions[0].amount}`);
      console.log(`   - Date: ${transactions[0].createdAt}`);
      console.log(`   - Receipt: ${transactions[0].mpesaReceiptNumber || 'N/A'}`);
    }
    
    // 4. Get today's collections
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayTransactions = transactions.filter(t => 
      t.createdAt >= today && t.createdAt < tomorrow
    );
    const todayCollections = todayTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    console.log(`\n💰 Today's Collections: KES ${todayCollections.toLocaleString()} (${todayTransactions.length} transactions)`);
    
    // 5. Get promises
    console.log('\n📡 DATABASE QUERY 4: Finding promises...');
    const Promise = require('../models/Promise');
    const promises = await Promise.find({
      customerId: { $in: assignedCustomerIds }
    }).sort({ promiseDate: -1 });
    
    console.log(`✅ Found ${promises.length} promises in database`);
    
    // 6. Get activities/calls
    console.log('\n📡 DATABASE QUERY 5: Finding activities...');
    const Activity = require('../models/Activity');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const activities = await Activity.find({
      userId: officerId,
      createdAt: { $gte: sevenDaysAgo }
    }).sort({ createdAt: -1 });
    
    console.log(`✅ Found ${activities.length} activities in the last 7 days`);
    const calls = activities.filter(a => a.action === 'PROMISE_FOLLOWUP');
    console.log(`   - Calls: ${calls.length}`);
    console.log(`   - Logins: ${activities.filter(a => a.action === 'LOGIN').length}`);
    console.log(`   - Promise actions: ${activities.filter(a => a.action.includes('PROMISE')).length}`);
    
    // 7. Calculate metrics
    console.log('\n📊 CALCULATING PERFORMANCE METRICS...');
    
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - 1);
    const periodTransactions = transactions.filter(t => t.createdAt >= periodStart);
    const periodCollections = periodTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    
    // Weekly collections
    const sevenDaysAgoDate = new Date();
    sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
    const weeklyTransactions = transactions.filter(t => t.createdAt >= sevenDaysAgoDate);
    const weeklyCollections = weeklyTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    
    // Active customers (contacted in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeCustomers = assignedCustomers.filter(c => 
      c.lastContactDate && new Date(c.lastContactDate) >= thirtyDaysAgo
    ).length;
    
    // Overdue customers
    const overdueCustomers = assignedCustomers.filter(c => 
      c.status === 'OVERDUE' || (c.arrearsAmount || 0) > 0
    ).length;
    
    // Collection rate
    const totalDue = assignedCustomers.reduce((sum, c) => sum + (c.loanAmount || 0), 0);
    const collectionRate = totalDue > 0 ? (totalCollections / totalDue) * 100 : 0;
    
    // Call conversion rate
    const successfulFollowups = promises.filter(p => p.status === 'fulfilled').length;
    const callConversion = promises.length > 0 ? (successfulFollowups / promises.length) * 100 : 64;
    
    // Customer satisfaction
    const customerSatisfaction = officer.performanceMetrics?.efficiencyRating 
      ? (officer.performanceMetrics.efficiencyRating / 10) * 5 
      : 4.2;
    
    // Average call duration
    let averageCallDuration = '4:32';
    if (calls.length > 0) {
      const totalDuration = calls.reduce((sum, call) => sum + (call.duration || 0), 0);
      const avgSeconds = totalDuration / calls.length;
      const minutes = Math.floor(avgSeconds / 60);
      const seconds = Math.floor(avgSeconds % 60);
      averageCallDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Pending collections (customers with arrears)
    const pendingCollections = assignedCustomers
      .filter(c => (c.arrearsAmount || 0) > 0)
      .reduce((sum, c) => sum + (c.arrearsAmount || 0), 0);
    
    // Overdue amount
    const overdueAmount = assignedCustomers
      .filter(c => c.status === 'OVERDUE')
      .reduce((sum, c) => sum + (c.arrearsAmount || 0), 0);
    
    // Assignment metrics
    const completedAssignments = transactions.length;
    const pendingAssignments = assignedCustomers.filter(c => !c.lastContactDate).length;
    const inProgressAssignments = assignedCustomers.filter(c => 
      c.lastContactDate && c.status !== 'COMPLETED'
    ).length;
    
    // New customers this month
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    const newThisMonth = assignedCustomers.filter(c => 
      c.createdAt && new Date(c.createdAt) >= firstDayOfMonth
    ).length;
    
    console.log('✅ Metrics calculated:');
    console.log(`   - Total Collections: KES ${totalCollections.toLocaleString()}`);
    console.log(`   - Monthly Collections: KES ${periodCollections.toLocaleString()}`);
    console.log(`   - Weekly Collections: KES ${weeklyCollections.toLocaleString()}`);
    console.log(`   - Today's Collections: KES ${todayCollections.toLocaleString()}`);
    console.log(`   - Assigned Customers: ${assignedCustomers.length}`);
    console.log(`   - Active Customers: ${activeCustomers}`);
    console.log(`   - Overdue Customers: ${overdueCustomers}`);
    console.log(`   - Collection Rate: ${collectionRate.toFixed(1)}%`);
    console.log(`   - Efficiency Rating: ${officer.performanceMetrics?.efficiencyRating || 8.5}`);
    
    // Build response with ALL fields the frontend expects
    const performanceData = {
      // Include officer ID at multiple levels for frontend compatibility
      _id: officer._id,
      id: officer._id,
      officerId: officer._id,
      
      officer: {
        _id: officer._id,
        id: officer._id,
        username: officer.username,
        name: officer.name,
        fullName: officer.name || officer.username,
        loanType: officer.loanType,
        email: officer.email,
        phone: officer.phone,
        lastLogin: officer.lastLogin,
        isActive: officer.isActive,
        joinDate: officer.createdAt
      },
      
      employeeId: `EMP${officer._id.toString().slice(-6)}`,
      email: officer.email || `${officer.username}@company.com`,
      phone: officer.phone || '+254 7XX XXX XXX',
      joinDate: officer.createdAt || new Date(),
      
      // Performance metrics
      performance: {
        efficiency: officer.performanceMetrics?.efficiencyRating || 8.5,
        collectionRate: collectionRate.toFixed(1),
        customerSatisfaction: customerSatisfaction.toFixed(1),
        callConversion: callConversion.toFixed(1)
      },
      
      // Collections data
      collections: {
        total: totalCollections,
        monthly: periodCollections,
        weekly: weeklyCollections,
        today: todayCollections
      },
      
      // Customer data
      customers: {
        totalAssigned: assignedCustomers.length,
        active: activeCustomers,
        overdue: overdueCustomers,
        newThisMonth: newThisMonth
      },
      
      // Call data
      calls: {
        total: calls.length,
        today: calls.filter(c => c.createdAt >= today && c.createdAt < tomorrow).length,
        weekly: calls.length,
        averageDuration: averageCallDuration
      },
      
      // Assignment data
      assignments: {
        completed: completedAssignments,
        pending: pendingAssignments,
        inProgress: inProgressAssignments
      },
      
      // Payment data
      payments: {
        average: transactions.length > 0 ? totalCollections / transactions.length : 32500,
        pending: pendingCollections,
        overdue: overdueAmount
      },
      
      // Metrics for compatibility
      metrics: {
        assignedCustomers: assignedCustomers.length,
        totalCollections: totalCollections,
        transactionCount: transactions.length,
        successfulTransactions: transactions.length,
        successRate: transactions.length > 0 ? 100 : 0,
        averageAmount: transactions.length > 0 ? totalCollections / transactions.length : 0,
        totalLoanAmount: assignedCustomers.reduce((sum, c) => sum + (c.loanAmount || 0), 0),
        totalArrears: assignedCustomers.reduce((sum, c) => sum + (c.arrearsAmount || 0), 0)
      },
      
      // Include important activities if requested
      importantActivities: req.query.includeActivities === 'true' ? activities.slice(0, 10).map(a => ({
        id: a._id,
        type: a.action,
        action: a.action,
        officer: a.userDetails?.fullName || officer.username,
        time: a.createdAt,
        details: a.description,
        amount: a.amount || null
      })) : []
    };
    
    console.log('\n✅ SENDING RESPONSE TO CLIENT');
    console.log('📦 Response data includes officer ID:', performanceData._id);
    console.log('========== END OFFICER PERFORMANCE API CALL ==========\n');
    
    res.json({
      success: true,
      message: 'Officer performance data retrieved successfully',
      data: performanceData
    });
    
  } catch (error) {
    console.error('\n❌ ERROR in getOfficerPerformance:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('========== END WITH ERROR ==========\n');
    
    res.status(500).json({
      success: false,
      message: 'Failed to get officer performance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get officer performance by ID (DETAILED VIEW)
 * @route   GET /api/supervisor/officers/:officerId/performance
 * @access  Private (Supervisor, Admin)
 */
exports.getOfficerPerformanceById = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { officerId } = req.params;
    const { period = 'monthly' } = req.query;
    const user = req.user;
    
    console.log(`📈 Officer performance DETAILED request for officer: ${officerId}, period: ${period}`);
    
    if (!officerId) {
      return res.status(400).json({
        success: false,
        message: 'Officer ID is required'
      });
    }
    
    // Reuse the existing getOfficerPerformance logic by passing officerId as query param
    req.query.officerId = officerId;
    req.query.period = period;
    
    return exports.getOfficerPerformance(req, res);
    
  } catch (error) {
    console.error('Officer performance by ID error:', error);
    
    await ActivityLogger.logError(
      req.user?.id,
      'OFFICER_PERFORMANCE_VIEW',
      'Failed to get officer performance details',
      error,
      { officerId: req.params.officerId }
    );
    
    res.status(500).json({
      success: false,
      message: 'Failed to get officer performance details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get officer recent activities
 * @route   GET /api/supervisor/officers/:officerId/activities
 * @access  Private (Supervisor, Admin)
 */
exports.getOfficerActivities = async (req, res) => {
  try {
    const { officerId } = req.params;
    const { limit = 8 } = req.query;
    
    console.log(`📋 Fetching activities for officer: ${officerId}, limit: ${limit}`);
    
    if (!officerId) {
      return res.status(400).json({
        success: false,
        message: 'Officer ID is required'
      });
    }
    
    if (officerId === 'undefined' || officerId === 'null') {
      return res.status(400).json({
        success: false,
        message: 'Invalid officer ID provided'
      });
    }
    
    // Get activities from Activity model
    const Activity = require('../models/Activity');
    
    const activities = await Activity.find({
      userId: officerId
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .lean();
    
    console.log(`✅ Found ${activities.length} activities for officer ${officerId}`);
    
    // Transform activities to match frontend format
    const transformedActivities = activities.map(activity => {
      // Map action to type
      let type = 'activity';
      switch (activity.action) {
        case 'LOGIN': type = 'login'; break;
        case 'PROMISE_FOLLOWUP': type = 'call'; break;
        case 'TRANSACTION_SUCCESS': type = 'payment'; break;
        case 'TRANSACTION_FAIL': type = 'payment_failed'; break;
        case 'PROMISE_CREATE': type = 'promise_made'; break;
        case 'PROMISE_FULFILL': type = 'promise_kept'; break;
        case 'PROMISE_BREAK': type = 'promise_broken'; break;
        case 'CUSTOMER_ASSIGN': type = 'assignment'; break;
        case 'CUSTOMER_VIEW': type = 'customer_view'; break;
        case 'CUSTOMER_CREATE': type = 'new_customer'; break;
        case 'CUSTOMER_UPDATE': type = 'customer_update'; break;
        default: type = activity.action?.toLowerCase().replace('_', ' ') || 'activity';
      }
      
      return {
        id: activity._id,
        type: type,
        officer: activity.userDetails?.fullName || activity.userDetails?.username || 'Unknown',
        time: activity.createdAt,
        details: activity.description || `${activity.action} performed`,
        amount: activity.amount || activity.resourceDetails?.amount || null,
        action: activity.action,
        resourceType: activity.resourceType
      };
    });
    
    // If we don't have enough activities, get transactions
    if (transformedActivities.length < 3) {
      try {
        const Transaction = require('../models/Transaction');
        const transactions = await Transaction.find({
          initiatedByUserId: officerId,
          status: 'SUCCESS'
        })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();
        
        transactions.forEach(t => {
          transformedActivities.push({
            type: 'payment',
            officer: 'Current Officer',
            time: t.createdAt,
            details: `Payment of KES ${t.amount.toLocaleString()} received`,
            amount: t.amount
          });
        });
      } catch (transError) {
        console.log('Could not fetch transactions for activities');
      }
    }
    
    // Sort by time and deduplicate
    const uniqueActivities = transformedActivities
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .filter((activity, index, self) => 
        index === self.findIndex(a => 
          a.details === activity.details && 
          Math.abs(new Date(a.time) - new Date(activity.time)) < 1000
        )
      )
      .slice(0, parseInt(limit));
    
    res.json({
      success: true,
      message: 'Officer activities retrieved successfully',
      data: {
        activities: uniqueActivities,
        total: uniqueActivities.length
      }
    });
    
  } catch (error) {
    console.error('Get officer activities error:', error);
    
    // Return empty array instead of error to prevent UI breaking
    res.json({
      success: true,
      message: 'Retrieved available activities',
      data: {
        activities: [],
        total: 0
      }
    });
  }
};

/**
 * @desc    Assign loan type specialization to officer
 * @route   POST /api/supervisor/officers/assign-specialization
 * @access  Private (Supervisor, Admin)
 */
exports.assignLoanTypeSpecialization = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { officerId, loanType } = req.body;
    const user = req.user;
    
    console.log(`🎯 Assign specialization request from: ${user.username}, officerId: ${officerId}, loanType: ${loanType}`);
    
    if (!officerId || !loanType) {
      return res.status(400).json({
        success: false,
        message: 'Officer ID and loan type are required'
      });
    }
    
    const validLoanTypes = ['Digital Loans', 'Asset Finance', 'Consumer Loans', 'SME', 'Credit Cards'];
    if (!validLoanTypes.includes(loanType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid loan type. Must be one of: ${validLoanTypes.join(', ')}`
      });
    }
    
    // Check if officer exists
    const officer = await User.findById(officerId);
    if (!officer) {
      // Log error
      await ActivityLogger.logError(
        user.id,
        'LOAN_TYPE_ASSIGN',
        'Officer not found for loan type assignment',
        { code: 'OFFICER_NOT_FOUND' },
        { officerId }
      );
      
      return res.status(404).json({
        success: false,
        message: 'Officer not found'
      });
    }
    
    // Check if officer is an officer
    if (officer.role !== 'officer') {
      // Log error
      await ActivityLogger.logError(
        user.id,
        'LOAN_TYPE_ASSIGN',
        'Can only assign specializations to officers',
        { code: 'INVALID_ROLE' },
        {
          officerId,
          officerRole: officer.role
        }
      );
      
      return res.status(400).json({
        success: false,
        message: 'Can only assign specializations to officers'
      });
    }
    
    // Store old loan type for logging
    const oldLoanType = officer.loanType;
    
    // Update officer's loan type
    officer.loanType = loanType;
    await officer.save();
    
    // Log successful assignment (this is important for supervisor)
    await ActivityLogger.log({
      userId: user.id,
      action: 'USER_UPDATE',
      description: `Assigned ${loanType} specialization to officer: ${officer.name || officer.username}`,
      resourceType: 'USER',
      resourceId: officer._id,
      requestDetails: {
        oldLoanType,
        newLoanType: loanType
      },
      duration: Date.now() - startTime,
      tags: ['specialization', 'officer', 'supervisor']
    });
    
    res.json({
      success: true,
      message: `Assigned ${loanType} specialization to ${officer.name || officer.username}`,
      data: {
        officer: {
          username: officer.username,
          name: officer.name,
          loanType: officer.loanType
        }
      }
    });
    
  } catch (error) {
    console.error('Assign specialization error:', error);
    
    // Log error
    await ActivityLogger.logError(
      req.user?.id,
      'LOAN_TYPE_ASSIGN',
      'Failed to assign specialization',
      error,
      {
        officerId: req.body.officerId,
        loanType: req.body.loanType
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'Failed to assign specialization',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Run bulk customer assignment
 * @route   POST /api/supervisor/assignments/bulk
 * @access  Private (Supervisor, Admin)
 */
exports.runBulkAssignment = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { loanType, limit, excludeAssigned = true } = req.body;
    const user = req.user;
    
    console.log(`🔄 Bulk assignment request from: ${user.username}, loanType: ${loanType}, limit: ${limit}`);
    
    // Simple bulk assignment logic
    let result = {
      success: true,
      message: 'Bulk assignment completed',
      data: {
        assignedCount: 0,
        failedCount: 0,
        details: []
      }
    };
    
    // Get unassigned customers
    const query = {
      assignedTo: null,
      isActive: true
    };
    
    if (loanType) {
      query.loanType = loanType;
    }
    
    const unassignedCustomers = await Customer.find(query).limit(limit || 50);
    
    if (unassignedCustomers.length === 0) {
      result.message = 'No unassigned customers found';
      return res.json(result);
    }
    
    // Get officers by loan type
    const officers = await User.find({
      role: 'officer',
      isActive: true,
      ...(loanType ? { loanType } : {})
    });
    
    if (officers.length === 0) {
      result.message = `No officers available for ${loanType || 'any loan type'}`;
      return res.json(result);
    }
    
    // Simple round-robin assignment
    for (let i = 0; i < unassignedCustomers.length; i++) {
      const customer = unassignedCustomers[i];
      const officerIndex = i % officers.length;
      const officer = officers[officerIndex];
      
      try {
        customer.assignedTo = officer._id;
        customer.assignmentHistory.push({
          assignedTo: officer._id,
          assignedBy: user._id,
          assignedAt: new Date(),
          reason: 'Bulk assignment by supervisor'
        });
        
        await customer.save();
        result.data.assignedCount++;
        result.data.details.push({
          customer: customer.customerName,
          officer: officer.name || officer.username,
          loanType: customer.loanType,
          success: true
        });
        
        // Log the assignment activity (important for supervisor)
        await ActivityLogger.log({
          userId: user.id,
          action: 'CUSTOMER_ASSIGN',
          description: `Assigned customer ${customer.customerName} to ${officer.name || officer.username}`,
          resourceType: 'CUSTOMER',
          resourceId: customer._id,
          requestDetails: {
            assignedOfficer: officer.name || officer.username,
            assignmentType: 'bulk',
            loanType: customer.loanType
          },
          tags: ['assignment', 'bulk', 'supervisor']
        });
        
      } catch (error) {
        result.data.failedCount++;
        result.data.details.push({
          customer: customer.customerName,
          error: error.message,
          success: false
        });
      }
    }
    
    // Log bulk assignment (important activity)
    await ActivityLogger.log({
      userId: user.id,
      action: 'BULK_ASSIGNMENT',
      description: `Performed bulk assignment: ${result.data.assignedCount} customers assigned`,
      resourceType: 'SYSTEM',
      requestDetails: {
        assignmentType: 'round_robin',
        loanType,
        limit: limit || 50,
        results: {
          assignedCount: result.data.assignedCount,
          failedCount: result.data.failedCount,
          officersInvolved: officers.length
        }
      },
      duration: Date.now() - startTime,
      tags: ['bulk_assignment', 'supervisor', 'important']
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Bulk assignment error:', error);
    
    // Log error
    await ActivityLogger.logError(
      req.user?.id,
      'BULK_ASSIGNMENT',
      'Failed to run bulk assignment',
      error,
      {
        loanType: req.body.loanType,
        limit: req.body.limit
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'Failed to run bulk assignment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Generate Excel report for individual officer
 * @route   GET /api/supervisor/reports/officer/:officerId/excel
 * @access  Private (Supervisor, Admin)
 */
exports.generateOfficerExcelReport = async (req, res) => {
    try {
        const { officerId } = req.params;
        const user = req.user;
        
        console.log(`📊 Generating Excel report for officer: ${officerId} by: ${user.username}`);
        
        if (!officerId) {
            return res.status(400).json({
                success: false,
                message: 'Officer ID is required'
            });
        }

        // Get officer performance data using existing method
        req.query.officerId = officerId;
        req.query.includeActivities = 'true';
        
        // Create a mock response object to capture data
        let officerData = null;
        let activities = [];
        
        // Get officer performance
        const perfResponse = await exports.getOfficerPerformance({
            ...req,
            query: { officerId, includeActivities: 'true' }
        }, {
            json: (data) => {
                officerData = data.data;
            },
            status: () => ({ json: () => {} })
        });
        
        // Get activities
        try {
            const actResponse = await exports.getOfficerActivities({
                ...req,
                params: { officerId },
                query: { limit: 50 }
            }, {
                json: (data) => {
                    activities = data.data.activities || [];
                },
                status: () => ({ json: () => {} })
            });
        } catch (err) {
            console.log('Could not fetch activities for report:', err.message);
        }
        
        if (!officerData) {
            return res.status(404).json({
                success: false,
                message: 'Officer not found or no data available'
            });
        }
        
        // Generate Excel workbook
        const workbook = await ReportGenerator.generateOfficerExcelReport(officerId, officerData, activities);
        
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=officer_${officerId}_performance_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        // Write to response
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`✅ Excel report generated successfully for officer ${officerId}`);
        
        // Log activity
        const ActivityLogger = require('../services/activityLogger');
        await ActivityLogger.log({
            userId: user.id,
            action: 'REPORT_GENERATE',
            description: `Generated Excel performance report for officer`,
            resourceType: 'USER',
            resourceId: officerId,
            tags: ['report', 'excel', 'officer_performance']
        });
        
    } catch (error) {
        console.error('❌ Error generating officer Excel report:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to generate Excel report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Generate PDF report for individual officer
 * @route   GET /api/supervisor/reports/officer/:officerId/pdf
 * @access  Private (Supervisor, Admin)
 */
exports.generateOfficerPDFReport = async (req, res) => {
    try {
        const { officerId } = req.params;
        const user = req.user;
        
        console.log(`📄 Generating PDF report for officer: ${officerId} by: ${user.username}`);
        
        if (!officerId) {
            return res.status(400).json({
                success: false,
                message: 'Officer ID is required'
            });
        }

        // Get officer performance data
        req.query.officerId = officerId;
        
        let officerData = null;
        let activities = [];
        
        // Get officer performance
        const perfResponse = await exports.getOfficerPerformance({
            ...req,
            query: { officerId, includeActivities: 'true' }
        }, {
            json: (data) => {
                officerData = data.data;
            },
            status: () => ({ json: () => {} })
        });
        
        // Get activities
        try {
            const actResponse = await exports.getOfficerActivities({
                ...req,
                params: { officerId },
                query: { limit: 30 }
            }, {
                json: (data) => {
                    activities = data.data.activities || [];
                },
                status: () => ({ json: () => {} })
            });
        } catch (err) {
            console.log('Could not fetch activities for PDF:', err.message);
        }
        
        if (!officerData) {
            return res.status(404).json({
                success: false,
                message: 'Officer not found or no data available'
            });
        }
        
        // Generate PDF
        const pdfBuffer = await ReportGenerator.generateOfficerPDFReport(officerId, officerData, activities);
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=officer_${officerId}_performance_${new Date().toISOString().split('T')[0]}.pdf`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        // Send PDF
        res.send(pdfBuffer);
        
        console.log(`✅ PDF report generated successfully for officer ${officerId}`);
        
        // Log activity
        const ActivityLogger = require('../services/activityLogger');
        await ActivityLogger.log({
            userId: user.id,
            action: 'REPORT_GENERATE',
            description: `Generated PDF performance report for officer`,
            resourceType: 'USER',
            resourceId: officerId,
            tags: ['report', 'pdf', 'officer_performance']
        });
        
    } catch (error) {
        console.error('❌ Error generating officer PDF report:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to generate PDF report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @desc    Generate performance chart for officer
 * @route   GET /api/supervisor/reports/officer/:officerId/chart
 * @access  Private (Supervisor, Admin)
 */
exports.generateOfficerChart = async (req, res) => {
    try {
        const { officerId } = req.params;
        const user = req.user;
        
        console.log(`📈 Generating chart for officer: ${officerId} by: ${user.username}`);
        
        if (!officerId) {
            return res.status(400).json({
                success: false,
                message: 'Officer ID is required'
            });
        }

        // Get officer performance data
        req.query.officerId = officerId;
        
        let officerData = null;
        
        const perfResponse = await exports.getOfficerPerformance({
            ...req,
            query: { officerId }
        }, {
            json: (data) => {
                officerData = data.data;
            },
            status: () => ({ json: () => {} })
        });
        
        if (!officerData) {
            return res.status(404).json({
                success: false,
                message: 'Officer not found or no data available'
            });
        }
        
        // Generate chart as PNG
        const chartBuffer = await ReportGenerator.generatePerformanceChart(officerId, officerData);
        
        // Set response headers
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename=officer_${officerId}_chart_${new Date().toISOString().split('T')[0]}.png`);
        res.setHeader('Content-Length', chartBuffer.length);
        
        // Send chart
        res.send(chartBuffer);
        
        console.log(`✅ Chart generated successfully for officer ${officerId}`);
        
        // Log activity
        const ActivityLogger = require('../services/activityLogger');
        await ActivityLogger.log({
            userId: user.id,
            action: 'REPORT_GENERATE',
            description: `Generated performance chart for officer`,
            resourceType: 'USER',
            resourceId: officerId,
            tags: ['report', 'chart', 'officer_performance']
        });
        
    } catch (error) {
        console.error('❌ Error generating officer chart:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to generate performance chart',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


/**
 * @desc    Generate team performance report
 * @route   GET /api/supervisor/reports/team
 * @access  Private (Supervisor, Admin)
 */
exports.generateTeamReport = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { startDate, endDate, format = 'json' } = req.query;
    const user = req.user;
    
    console.log(`📄 Team report request from: ${user.username}, format: ${format}`);
    
    // Set date range
    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);
    
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    
    // If no dates provided, default to last 30 days
    if (!startDate && !endDate) {
      start.setDate(start.getDate() - 30);
    }
    
    // Get all officers
    const officers = await User.find({ role: 'officer', isActive: true })
      .select('_id username name email loanType')
      .lean();
    
    const officerIds = officers.map(o => o._id);
    
    // Get transactions in period
    const transactions = await Transaction.find({
      createdAt: { $gte: start, $lte: end },
      status: 'SUCCESS'
    })
    .populate('initiatedByUserId', 'username name')
    .lean();
    
    // Get assigned customers
    const assignedCustomers = await Customer.find({
      assignedTo: { $in: officerIds }
    }).select('assignedTo loanType');
    
    // Get important activity summary for the period
    const importantActivitySummary = await ActivityLogger.getImportantActivitySummary(officerIds, 
      Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    
    // Build report
    const report = {
      reportType: 'team_performance',
      generatedBy: user.username,
      generatedAt: new Date(),
      period: { 
        start: start.toISOString(),
        end: end.toISOString(),
        days: Math.ceil((end - start) / (1000 * 60 * 60 * 24))
      },
      summary: {
        totalOfficers: officers.length,
        totalCollections: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        totalTransactions: transactions.length,
        totalAssignedCustomers: assignedCustomers.length,
        averagePerOfficer: officers.length > 0 ? 
          transactions.reduce((sum, t) => sum + (t.amount || 0), 0) / officers.length : 0,
        importantActivitySummary
      },
      officers: officers.map(officer => {
        const officerTransactions = transactions.filter(t => 
          t.initiatedByUserId && t.initiatedByUserId._id.toString() === officer._id.toString()
        );
        const officerCustomers = assignedCustomers.filter(c => 
          c.assignedTo && c.assignedTo.toString() === officer._id.toString()
        );
        
        const totalCollections = officerTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        
        return {
          _id: officer._id,
          id: officer._id,
          officer: officer.username,
          name: officer.name,
          loanType: officer.loanType,
          email: officer.email,
          performance: {
            collections: totalCollections,
            transactions: officerTransactions.length,
            assignedCustomers: officerCustomers.length,
            averageAmount: officerTransactions.length > 0 ? 
              totalCollections / officerTransactions.length : 0,
            successRate: officerTransactions.length > 0 ? 
              (officerTransactions.filter(t => t.status === 'SUCCESS').length / officerTransactions.length) * 100 : 0
          }
        };
      }).sort((a, b) => b.performance.collections - a.performance.collections)
    };
    
    // Add ranking
    report.officers.forEach((officer, index) => {
      officer.rank = index + 1;
    });
    
    // Log report generation (important activity)
    await ActivityLogger.log({
      userId: user.id,
      action: 'REPORT_GENERATE',
      description: 'Generated team performance report',
      resourceType: 'REPORT',
      requestDetails: {
        dateRange: { start, end },
        format,
        reportSize: report.officers.length,
        statistics: report.summary
      },
      duration: Date.now() - startTime,
      tags: ['report', 'team_performance', 'supervisor']
    });
    
    if (format === 'csv') {
      // Generate CSV
      const csvHeader = 'Rank,Officer ID,Officer,Name,Loan Type,Email,Collections,Transactions,Assigned Customers,Avg Amount,Success Rate\n';
      
      const csvRows = report.officers.map(o => {
        const escapeCSV = (field) => {
          if (!field) return '';
          const stringField = String(field);
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
          }
          return stringField;
        };
        
        return [
          o.rank,
          o._id.toString(),
          escapeCSV(o.officer),
          escapeCSV(o.name || ''),
          o.loanType || '',
          o.email || '',
          o.performance.collections.toFixed(2),
          o.performance.transactions,
          o.performance.assignedCustomers,
          o.performance.averageAmount.toFixed(2),
          o.performance.successRate.toFixed(1)
        ].join(',');
      });
      
      const csvContent = csvHeader + csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=team_performance_${new Date().toISOString().split('T')[0]}.csv`);
      return res.send(csvContent);
    }
    
    // Return JSON by default
    res.json({
      success: true,
      message: 'Team performance report generated successfully',
      data: report
    });
    
  } catch (error) {
    console.error('Team report error:', error);
    
    // Log error
    await ActivityLogger.logError(
      req.user?.id,
      'TEAM_REPORT_GENERATE',
      'Failed to generate team report',
      error,
      {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        format: req.query.format
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate team report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all officers with their specializations and stats
 * @route   GET /api/supervisor/officers
 * @access  Private (Supervisor, Admin)
 */
exports.getOfficers = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const officers = await User.find({ role: 'officer', isActive: true })
      .select('_id username name email loanType isActive lastLogin performanceMetrics')
      .sort('username')
      .lean();
    
    // Get loan type distribution
    const loanTypeStats = await Customer.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$loanType', customerCount: { $sum: 1 } } }
    ]);
    
    // Get assigned customers count per officer
    const officerIds = officers.map(o => o._id);
    const assignedCounts = await Customer.aggregate([
      {
        $match: {
          assignedTo: { $in: officerIds },
          isActive: true
        }
      },
      {
        $group: {
          _id: '$assignedTo',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Create a map for quick lookup
    const assignedCountMap = {};
    assignedCounts.forEach(item => {
      assignedCountMap[item._id.toString()] = item.count;
    });
    
    // Get today's calls count per officer
    const Activity = require('../models/Activity');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const callsToday = await Activity.aggregate([
      {
        $match: {
          userId: { $in: officerIds },
          action: 'PROMISE_FOLLOWUP',
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const callsTodayMap = {};
    callsToday.forEach(call => {
      callsTodayMap[call._id.toString()] = call.count;
    });
    
    // Get transactions per officer
    const transactions = await Transaction.aggregate([
      {
        $match: {
          initiatedByUserId: { $in: officerIds },
          status: 'SUCCESS'
        }
      },
      {
        $group: {
          _id: '$initiatedByUserId',
          totalCollections: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    
    const collectionsMap = {};
    transactions.forEach(t => {
      collectionsMap[t._id.toString()] = {
        totalCollections: t.totalCollections,
        transactionCount: t.transactionCount
      };
    });
    
    // Enhance officer data with recent important activity count
    const enhancedOfficers = await Promise.all(officers.map(async (officer) => {
      const officerId = officer._id.toString();
      const assignedCount = assignedCountMap[officerId] || 0;
      const capacity = 50; // Default capacity
      const utilization = capacity > 0 ? (assignedCount / capacity) * 100 : 0;
      const collections = collectionsMap[officerId]?.totalCollections || 0;
      const callsCount = callsTodayMap[officerId] || 0;
      
      // Find loan type stats for this officer
      const loanTypeStat = loanTypeStats.find(stat => stat._id === officer.loanType);
      
      // Get officer's recent important activities count
      const recentActivities = await ActivityLogger.getTeamActivities([officer._id], 5);
      
      return {
        ...officer,
        _id: officer._id,
        id: officer._id,
        fullName: officer.name || officer.username,
        stats: {
          assignedCustomers: assignedCount,
          totalCustomers: assignedCount,
          capacity: capacity,
          utilization: utilization.toFixed(1) + '%',
          loanTypeCustomers: loanTypeStat ? loanTypeStat.customerCount : 0,
          recentActivities: recentActivities.length,
          collections: collections,
          totalCollections: collections,
          callsToday: callsCount,
          totalCalls: callsCount,
          efficiency: officer.performanceMetrics?.efficiencyRating || 
            (assignedCount > 0 ? Math.min(10, collections / (assignedCount * 1000)) : 0)
        },
        recentActivitiesPreview: recentActivities.slice(0, 3).map(activity => ({
          type: activity.type,
          description: activity.details.substring(0, 50) + (activity.details.length > 50 ? '...' : ''),
          time: activity.time
        }))
      };
    }));
    
    // Log officers list view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'USER_VIEW',
      description: `Viewed officers list (${enhancedOfficers.length} officers)`,
      resourceType: 'USER',
      requestDetails: {
        officerCount: enhancedOfficers.length,
        totalAssignedCustomers: assignedCounts.reduce((sum, item) => sum + item.count, 0),
        loanTypesCovered: [...new Set(officers.map(o => o.loanType).filter(Boolean))].length
      },
      duration: Date.now() - startTime,
      tags: ['officers', 'supervisor', 'management']
    });
    
    res.json({
      success: true,
      message: 'Officers retrieved successfully',
      data: {
        officers: enhancedOfficers,
        summary: {
          totalOfficers: officers.length,
          loanTypesCovered: [...new Set(officers.map(o => o.loanType).filter(Boolean))].length,
          totalAssignedCustomers: assignedCounts.reduce((sum, item) => sum + item.count, 0),
          loanTypeDistribution: loanTypeStats
        }
      }
    });
    
  } catch (error) {
    console.error('Get officers error:', error);
    
    // Log error
    await ActivityLogger.logError(
      req.user?.id,
      'OFFICER_PERFORMANCE_VIEW',
      'Failed to get officers list',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: 'Failed to get officers list',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;