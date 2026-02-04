//controllers/supervisorController.js
const Customer = require('../models/Customer');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ActivityLogger = require('../services/activityLogger');

// NOTE: Comment model might not exist - we'll handle it gracefully
let Comment;
try {
  Comment = require('../models/Comment');
} catch (error) {
  console.log('⚠️ Comment model not found, using fallback');
  Comment = null;
}

// NOTE: AssignmentService might not exist - we'll handle it gracefully
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
    
    // 2. Get team performance summary
    const performanceSummary = await getTeamPerformanceSummary();
    
    // 3. Get assignment statistics - simplified version
    const assignmentStats = await getAssignmentStats();
    
    // 4. Get recent activities FROM ACTIVITY LOGGER
    const teamMemberIds = teamMembers.map(member => member._id);
    const recentActivities = await ActivityLogger.getTeamActivities(teamMemberIds, 15);
    
    // 5. Get loan type distribution
    const loanTypeDistribution = await Customer.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$loanType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // 6. Get today's collections
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
    
    // 7. Get call statistics from Activity model
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
    
    // 8. Get officers by loan type
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
    
    // 9. Get unassigned customers count
    const unassignedCustomers = await Customer.countDocuments({
      assignedTo: null,
      isActive: true
    });
    
    // 10. Get activity statistics for the week
    const activityStats = await ActivityLogger.getActivityStats(teamMemberIds, sevenDaysAgo, new Date());
    
    const callStats = activityStats.find(stat => stat._id === 'PROMISE_FOLLOWUP') || { count: 0 };
    const loginStats = activityStats.find(stat => stat._id === 'LOGIN') || { count: 0 };
    const transactionStats = activityStats.find(stat => stat._id === 'TRANSACTION_SUCCESS') || { count: 0 };
    const promiseStats = activityStats.find(stat => stat._id === 'PROMISE_CREATE') || { count: 0 };
    
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
          unassignedCustomers
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
        recentActivities, // This now comes from ActivityLogger
        loanTypeDistribution,
        todaysCollections: todaysCollections[0] || { totalAmount: 0, count: 0 },
        callStats: {
          last7Days: callStatsData,
          totalThisWeek: callStats.count || 0,
          callsToday: callStats.today || 0
        },
        officersByLoanType,
        unassignedCustomers,
        activityStats: {
          logins: loginStats.count || 0,
          transactions: transactionStats.count || 0,
          promises: promiseStats.count || 0,
          calls: callStats.count || 0
        },
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
 * @desc    Get team performance summary
 */
async function getTeamPerformanceSummary() {
  try {
    const officers = await User.find({ role: 'officer', isActive: true })
      .select('username name email loanType')
      .lean();
    
    // Get customers assigned to officers
    const assignedCustomers = await Customer.find({
      assignedTo: { $in: officers.map(o => o._id) },
      isActive: true
    });
    
    // Get successful transactions
    const transactions = await Transaction.find({
      status: 'SUCCESS'
    });
    
    // Get top performers based on collections
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
    
    // Calculate top performers
    const topPerformers = officers.map(officer => {
      const collections = officerCollections[officer._id.toString()] || { totalCollections: 0, transactionCount: 0 };
      const assignedCount = assignedCustomers.filter(c => 
        c.assignedTo && c.assignedTo.toString() === officer._id.toString()
      ).length;
      
      // Get calls made by this officer (from Activity model)
      let callsToday = 0;
      
      return {
        fullName: officer.name || officer.username,
        username: officer.username,
        loanType: officer.loanType,
        collections: collections.totalCollections,
        transactionCount: collections.transactionCount,
        assignedCustomers: assignedCount,
        efficiency: assignedCount > 0 ? Math.min(10, collections.totalCollections / (assignedCount * 1000)) : 0,
        callsToday: callsToday
      };
    })
    .sort((a, b) => b.collections - a.collections)
    .slice(0, 5);
    
    const summary = {
      totalOfficers: officers.length,
      totalCollections: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
      totalTransactions: transactions.length,
      totalAssignedCustomers: assignedCustomers.length,
      averageCollectionsPerOfficer: officers.length > 0 ? 
        transactions.reduce((sum, t) => sum + (t.amount || 0), 0) / officers.length : 0,
      successRate: transactions.length > 0 ? 
        (transactions.filter(t => t.status === 'SUCCESS').length / transactions.length) * 100 : 0,
      topPerformers,
      byLoanType: {}
    };
    
    // Group by loan type
    officers.forEach(officer => {
      if (!summary.byLoanType[officer.loanType]) {
        summary.byLoanType[officer.loanType] = {
          officers: 0,
          assignedCustomers: 0,
          collections: 0
        };
      }
      summary.byLoanType[officer.loanType].officers++;
      
      // Count assigned customers for this officer's loan type
      const officerCustomers = assignedCustomers.filter(c => 
        c.loanType === officer.loanType
      );
      summary.byLoanType[officer.loanType].assignedCustomers += officerCustomers.length;
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
      successRate: 0,
      topPerformers: [],
      byLoanType: {}
    };
  }
}

/**
 * @desc    Get recent activities
 */
async function getRecentActivities(limit = 10) {
  try {
    // This function is kept for backward compatibility
    // But we're now using ActivityLogger.getTeamActivities instead
    return [];
  } catch (error) {
    console.error('Recent activities error:', error);
    return [];
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
 * @desc    Get detailed officer performance
 * @route   GET /api/supervisor/officers/performance
 * @access  Private (Supervisor, Admin)
 */
exports.getOfficerPerformance = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { officerId, period = 'monthly' } = req.query;
    const user = req.user;
    
    console.log(`📈 Officer performance request from: ${user.username}, officerId: ${officerId}, period: ${period}`);
    
    if (!officerId) {
      return res.status(400).json({
        success: false,
        message: 'Officer ID is required'
      });
    }
    
    // Get officer details
    const officer = await User.findById(officerId)
      .select('name username email loanType isActive lastLogin');
    
    if (!officer) {
      // Log error
      await ActivityLogger.logError(
        user.id,
        'OFFICER_PERFORMANCE_VIEW',
        'Officer not found for performance view',
        { code: 'OFFICER_NOT_FOUND' },
        { officerId }
      );
      
      return res.status(404).json({
        success: false,
        message: 'Officer not found'
      });
    }
    
    // Get officer's assigned customers
    const assignedCustomers = await Customer.find({
      assignedTo: officerId,
      isActive: true
    }).select('customerName phoneNumber loanAmount arrearsAmount status lastContactDate loanType');
    
    // Get officer's transactions
    const transactions = await Transaction.find({
      initiatedByUserId: officerId
    }).sort({ createdAt: -1 });
    
    // Calculate performance metrics
    const successfulTransactions = transactions.filter(t => t.status === 'SUCCESS');
    const totalCollections = successfulTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const performance = {
      officer: {
        username: officer.username,
        name: officer.name,
        loanType: officer.loanType,
        email: officer.email,
        lastLogin: officer.lastLogin,
        isActive: officer.isActive
      },
      metrics: {
        assignedCustomers: assignedCustomers.length,
        totalCollections: totalCollections,
        transactionCount: transactions.length,
        successfulTransactions: successfulTransactions.length,
        successRate: transactions.length > 0 ? 
          (successfulTransactions.length / transactions.length) * 100 : 0,
        averageAmount: transactions.length > 0 ? 
          totalCollections / transactions.length : 0,
        totalLoanAmount: assignedCustomers.reduce((sum, c) => sum + (c.loanAmount || 0), 0),
        totalArrears: assignedCustomers.reduce((sum, c) => sum + (c.arrearsAmount || 0), 0)
      },
      assignedCustomers: assignedCustomers.map(customer => ({
        name: customer.customerName,
        phone: customer.phoneNumber,
        loanAmount: customer.loanAmount,
        arrears: customer.arrearsAmount,
        status: customer.status,
        loanType: customer.loanType,
        lastContact: customer.lastContactDate
      })),
      recentTransactions: transactions.slice(0, 10).map(t => ({
        amount: t.amount,
        status: t.status,
        date: t.createdAt,
        description: t.description
      }))
    };
    
    // Log officer performance view
    await ActivityLogger.logSupervisor(
      user.id,
      'OFFICER_PERFORMANCE_VIEW',
      `Viewed performance details for officer: ${officer.username}`,
      {
        officerId,
        officerName: officer.username,
        period,
        metrics: {
          transactions: transactions.length,
          collections: totalCollections,
          assignedCustomers: assignedCustomers.length
        },
        duration: Date.now() - startTime
      }
    );
    
    res.json({
      success: true,
      message: 'Officer performance data retrieved successfully',
      data: performance
    });
    
  } catch (error) {
    console.error('Officer performance error:', error);
    
    // Log error
    await ActivityLogger.logError(
      req.user?.id,
      'OFFICER_PERFORMANCE_VIEW',
      'Failed to get officer performance',
      error,
      {
        officerId: req.query.officerId,
        endpoint: req.originalUrl
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'Failed to get officer performance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    
    // Log successful assignment
    await ActivityLogger.logSupervisor(
      user.id,
      'LOAN_TYPE_ASSIGN',
      `Assigned ${loanType} specialization to officer: ${officer.name || officer.username}`,
      {
        officerId,
        officerName: officer.name || officer.username,
        oldLoanType,
        newLoanType: loanType,
        assignedBy: user.username,
        duration: Date.now() - startTime
      }
    );
    
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
        
        // Log the assignment activity
        await ActivityLogger.logCustomer(
          user.id,
          'CUSTOMER_ASSIGN',
          customer,
          {
            assignedOfficer: officer.name || officer.username,
            assignmentType: 'bulk'
          }
        );
        
      } catch (error) {
        result.data.failedCount++;
        result.data.details.push({
          customer: customer.customerName,
          error: error.message,
          success: false
        });
      }
    }
    
    // Log bulk assignment
    await ActivityLogger.logSupervisor(
      user.id,
      'BULK_ASSIGNMENT',
      `Performed bulk assignment: ${result.data.assignedCount} customers assigned`,
      {
        assignmentType: 'round_robin',
        loanType,
        limit: limit || 50,
        results: {
          assignedCount: result.data.assignedCount,
          failedCount: result.data.failedCount,
          officersInvolved: officers.length,
          duration: Date.now() - startTime
        }
      }
    );
    
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
      .select('username name email loanType')
      .lean();
    
    // Get transactions in period
    const transactions = await Transaction.find({
      createdAt: { $gte: start, $lte: end },
      status: 'SUCCESS'
    })
    .populate('initiatedByUserId', 'username name')
    .lean();
    
    // Get assigned customers
    const assignedCustomers = await Customer.find({
      assignedTo: { $in: officers.map(o => o._id) }
    });
    
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
          transactions.reduce((sum, t) => sum + (t.amount || 0), 0) / officers.length : 0
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
          officer: officer.username,
          name: officer.name,
          loanType: officer.loanType,
          email: officer.email,
          performance: {
            collections: totalCollections,
            transactions: officerTransactions.length,
            assignedCustomers: officerCustomers.length,
            averageAmount: officerTransactions.length > 0 ? 
              totalCollections / officerTransactions.length : 0
          }
        };
      }).sort((a, b) => b.performance.collections - a.performance.collections)
    };
    
    // Add ranking
    report.officers.forEach((officer, index) => {
      officer.rank = index + 1;
    });
    
    // Log report generation
    await ActivityLogger.logSupervisor(
      user.id,
      'TEAM_REPORT_GENERATE',
      'Generated team performance report',
      {
        dateRange: { start, end },
        format,
        reportSize: report.officers.length,
        statistics: report.summary,
        duration: Date.now() - startTime
      }
    );
    
    if (format === 'csv') {
      // Generate CSV
      const csvHeader = 'Rank,Officer,Name,Loan Type,Email,Collections,Transactions,Assigned Customers,Avg Amount\n';
      
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
          escapeCSV(o.officer),
          escapeCSV(o.name),
          o.loanType,
          o.email,
          o.performance.collections.toFixed(2),
          o.performance.transactions,
          o.performance.assignedCustomers,
          o.performance.averageAmount.toFixed(2)
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
      .select('username name email loanType isActive lastLogin')
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
    
    // Enhance officer data
    const enhancedOfficers = officers.map(officer => {
      const assignedCount = assignedCountMap[officer._id.toString()] || 0;
      const capacity = 50; // Default capacity
      const utilization = capacity > 0 ? (assignedCount / capacity) * 100 : 0;
      
      // Find loan type stats for this officer
      const loanTypeStat = loanTypeStats.find(stat => stat._id === officer.loanType);
      
      return {
        ...officer,
        stats: {
          assignedCustomers: assignedCount,
          capacity: capacity,
          utilization: utilization.toFixed(1) + '%',
          loanTypeCustomers: loanTypeStat ? loanTypeStat.customerCount : 0
        }
      };
    });
    
    // Log officers list view
    await ActivityLogger.logSupervisor(
      req.user.id,
      'OFFICER_PERFORMANCE_VIEW',
      `Viewed officers list (${enhancedOfficers.length} officers)`,
      {
        officerCount: enhancedOfficers.length,
        totalAssignedCustomers: assignedCounts.reduce((sum, item) => sum + item.count, 0),
        loanTypesCovered: [...new Set(officers.map(o => o.loanType).filter(Boolean))].length,
        duration: Date.now() - startTime
      }
    );
    
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