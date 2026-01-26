// routes/reports.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const Promise = require('../models/Promise');
const User = require('../models/User');
const Comment = require('../models/Comment');
const PerformanceTracker = require('../middleware/performanceTracker');

// @desc    Get summary statistics
// @route   GET /api/reports/summary
// @access  Private
router.get('/summary', protect, authorize('admin', 'supervisor', 'agent'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Create date filter if dates provided
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get total customers count
    const totalCustomers = await Customer.countDocuments();
    
    // Get active customers (isActive = true)
    const activeCustomers = await Customer.countDocuments({ isActive: true });
    
    // Calculate portfolio value (sum of loanBalance)
    const portfolioResult = await Customer.aggregate([
      {
        $group: {
          _id: null,
          portfolioValue: { $sum: '$loanBalance' },
          totalArrears: { $sum: '$arrears' }
        }
      }
    ]);
    
    const portfolioValue = portfolioResult[0]?.portfolioValue || 0;
    const arrearsAmount = portfolioResult[0]?.totalArrears || 0;
    
    // Get transactions statistics
    const transactionFilter = dateFilter;
    const transactions = await Transaction.find(transactionFilter);
    
    const successfulTransactions = transactions.filter(t => t.status === 'SUCCESS');
    const failedTransactions = transactions.filter(t => t.status === 'FAILED');
    const pendingTransactions = transactions.filter(t => t.status === 'PENDING');
    
    const totalCollections = successfulTransactions.reduce((sum, t) => sum + t.amount, 0);
    const avgTransaction = successfulTransactions.length > 0 
      ? totalCollections / successfulTransactions.length 
      : 0;
    
    // Calculate collection rate (based on arrears reduction)
    const collectionRate = arrearsAmount > 0 
      ? ((totalCollections / portfolioValue) * 100).toFixed(1)
      : 0;
    
    // Get today's date for daily collections
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const todayTransactions = await Transaction.find({
      status: 'SUCCESS',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    
    const dailyCollections = todayTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    // Get promises statistics
    const promises = await Promise.find(dateFilter);
    const totalPromises = promises.length;
    const fulfilledPromises = promises.filter(p => p.status === 'FULFILLED').length;
    const pendingPromises = promises.filter(p => p.status === 'PENDING').length;
    
    // Calculate promise fulfillment rate
    const promiseFulfillmentRate = totalPromises > 0 
      ? (fulfilledPromises / totalPromises * 100).toFixed(1)
      : 0;

    // Calculate week-over-week change (simplified)
    const lastWeekStart = new Date();
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);
    const lastWeekEnd = new Date();
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
    
    const lastWeekTransactions = await Transaction.find({
      status: 'SUCCESS',
      createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd }
    });
    
    const lastWeekCollections = lastWeekTransactions.reduce((sum, t) => sum + t.amount, 0);
    const thisWeekChange = lastWeekCollections > 0 
      ? ((totalCollections - lastWeekCollections) / lastWeekCollections * 100).toFixed(1)
      : 0;

    // Calculate month-over-month change
    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 2);
    const lastMonthEnd = new Date();
    lastMonthEnd.setMonth(lastMonthEnd.getMonth() - 1);
    
    const lastMonthTransactions = await Transaction.find({
      status: 'SUCCESS',
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }
    });
    
    const lastMonthCollections = lastMonthTransactions.reduce((sum, t) => sum + t.amount, 0);
    const thisMonthChange = lastMonthCollections > 0 
      ? ((totalCollections - lastMonthCollections) / lastMonthCollections * 100).toFixed(1)
      : 0;

    // Today's performance (percentage of daily target)
    const todayTarget = 50000; // Default daily target
    const todayPerformance = todayTarget > 0 
      ? (dailyCollections / todayTarget * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        totalCollections: parseFloat(totalCollections.toFixed(2)),
        dailyCollections: parseFloat(dailyCollections.toFixed(2)),
        successfulTransactions: successfulTransactions.length,
        failedTransactions: failedTransactions.length,
        pendingTransactions: pendingTransactions.length,
        activeCustomers: activeCustomers,
        totalCustomers: totalCustomers,
        collectionRate: parseFloat(collectionRate),
        avgTransaction: parseFloat(avgTransaction.toFixed(2)),
        portfolioValue: parseFloat(portfolioValue.toFixed(2)),
        arrearsAmount: parseFloat(arrearsAmount.toFixed(2)),
        totalPromises: totalPromises,
        fulfilledPromises: fulfilledPromises,
        pendingPromises: pendingPromises,
        promiseFulfillmentRate: parseFloat(promiseFulfillmentRate),
        thisWeekChange: parseFloat(thisWeekChange),
        thisMonthChange: parseFloat(thisMonthChange),
        todayPerformance: parseFloat(todayPerformance)
      }
    });
  } catch (error) {
    console.error('Error fetching reports summary:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get performance analytics
// @route   GET /api/reports/performance
// @access  Private
router.get('/performance', protect, authorize('admin', 'supervisor', 'agent'), async (req, res) => {
  try {
    const { startDate, endDate, timeframe = 'week' } = req.query;
    
    // Create date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get all agents (users with agent role)
    const agents = await User.find({ role: 'agent' }).select('-password');
    
    // Get transactions for the period
    const transactions = await Transaction.find(dateFilter);
    
    // Calculate performance for each agent
    const officerPerformance = await Promise.all(
      agents.map(async (agent) => {
        // Get agent's transactions
        const agentTransactions = transactions.filter(t => 
          t.initiatedByUserId && t.initiatedByUserId.toString() === agent._id.toString()
        );
        
        const successfulTransactions = agentTransactions.filter(t => t.status === 'SUCCESS');
        const failedTransactions = agentTransactions.filter(t => t.status === 'FAILED');
        const pendingTransactions = agentTransactions.filter(t => t.status === 'PENDING');
        
        const totalCollections = successfulTransactions.reduce((sum, t) => sum + t.amount, 0);
        const transactionCount = agentTransactions.length;
        const successRate = transactionCount > 0 
          ? successfulTransactions.length / transactionCount 
          : 0;
        
        const avgTransaction = successfulTransactions.length > 0 
          ? totalCollections / successfulTransactions.length 
          : 0;
        
        // Get agent's daily target from performanceMetrics
        const dailyTarget = agent.performanceMetrics?.dailyTarget || 50000;
        
        // Calculate target achievement (simplified)
        const daysInPeriod = startDate && endDate 
          ? Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) || 30
          : 30;
        const targetAchievement = dailyTarget * daysInPeriod > 0 
          ? totalCollections / (dailyTarget * daysInPeriod)
          : 0;
        
        // Calculate efficiency rating (simplified)
        const efficiencyRating = calculateEfficiencyRating(agentTransactions);
        
        // Calculate current streak (consecutive days with successful transactions)
        const currentStreak = await calculateAgentStreak(agent._id);
        
        // Get agent's promises
        const agentPromises = await Promise.find({
          createdBy: agent._id,
          ...dateFilter
        });
        
        const promiseSuccessRate = agentPromises.length > 0
          ? agentPromises.filter(p => p.status === 'FULFILLED').length / agentPromises.length
          : 0;

        return {
          _id: agent._id,
          officerName: agent.username,
          totalCollections,
          transactionCount,
          successRate,
          avgTransaction,
          dailyTarget,
          targetAchievement,
          efficiencyRating,
          currentStreak,
          promiseCount: agentPromises.length,
          promiseSuccessRate,
          failedTransactions: failedTransactions.length,
          pendingTransactions: pendingTransactions.length
        };
      })
    );
    
    // Sort by total collections for leaderboard
    const leaderboard = [...officerPerformance].sort((a, b) => b.totalCollections - a.totalCollections);
    
    // Calculate real-time stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const todayTransactions = await Transaction.find({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    
    const todayCollections = todayTransactions
      .filter(t => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Get active agents (agents with activity today)
    const activeAgents = new Set(
      todayTransactions.map(t => t.initiatedByUserId?.toString())
    ).size;
    
    // Calculate collection rate for today
    const todaySuccessTransactions = todayTransactions.filter(t => t.status === 'SUCCESS').length;
    const todaySuccessRate = todayTransactions.length > 0
      ? (todaySuccessTransactions / todayTransactions.length * 100).toFixed(1)
      : 0;
    
    // Calculate average response time (simplified - time between transaction creation and success)
    const successfulTodayTransactions = await Transaction.find({
      status: 'SUCCESS',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    }).select('createdAt processedAt');
    
    let totalResponseTime = 0;
    let responseCount = 0;
    
    successfulTodayTransactions.forEach(transaction => {
      if (transaction.processedAt) {
        const responseTime = (transaction.processedAt - transaction.createdAt) / (1000 * 60); // in minutes
        totalResponseTime += responseTime;
        responseCount++;
      }
    });
    
    const avgResponseTime = responseCount > 0 
      ? Math.round(totalResponseTime / responseCount) + 'min'
      : '0min';
    
    // Calculate team metrics
    const totalTeamCollections = officerPerformance.reduce((sum, o) => sum + o.totalCollections, 0);
    const teamSuccessRate = officerPerformance.length > 0 
      ? officerPerformance.reduce((sum, o) => sum + o.successRate, 0) / officerPerformance.length
      : 0;
    const avgTransactionsPerOfficer = officerPerformance.length > 0
      ? officerPerformance.reduce((sum, o) => sum + o.transactionCount, 0) / officerPerformance.length
      : 0;
    const topPerformer = leaderboard[0] || null;

    res.json({
      success: true,
      data: {
        officers: officerPerformance,
        leaderboard,
        realTimeStats: {
          todayCollections: parseFloat(todayCollections.toFixed(2)),
          activeOfficers: activeAgents,
          pendingTransactions: todayTransactions.filter(t => t.status === 'PENDING').length,
          avgResponseTime,
          collectionRate: `${todaySuccessRate}%`
        },
        teamMetrics: {
          totalTeamCollections: parseFloat(totalTeamCollections.toFixed(2)),
          teamSuccessRate: parseFloat((teamSuccessRate * 100).toFixed(1)),
          avgTransactionsPerOfficer: parseFloat(avgTransactionsPerOfficer.toFixed(1)),
          topPerformer: topPerformer
        }
      }
    });
  } catch (error) {
    console.error('Error fetching performance data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get activity timeline
// @route   GET /api/reports/activity-timeline
// @access  Private
router.get('/activity-timeline', protect, authorize('admin', 'supervisor', 'agent'), async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Get recent transactions
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('customerId', 'name phoneNumber')
      .populate('initiatedByUserId', 'username');
    
    // Get recent promises
    const promises = await Promise.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('customerId', 'name phoneNumber')
      .populate('createdBy', 'username');
    
    // Combine and sort activities
    const activities = [
      ...transactions.map(t => ({
        _id: t._id,
        type: 'transaction',
        createdAt: t.createdAt,
        amount: t.amount,
        status: t.status,
        description: getTransactionDescription(t),
        initiatedBy: t.initiatedByUserId?.username || 'System',
        customerId: {
          name: t.customerId?.name || 'Unknown Customer',
          phoneNumber: t.customerId?.phoneNumber || t.phoneNumber
        }
      })),
      ...promises.map(p => ({
        _id: p._id,
        type: 'promise',
        createdAt: p.createdAt,
        amount: p.promiseAmount,
        status: p.status,
        description: getPromiseDescription(p),
        initiatedBy: p.createdBy?.username || 'System',
        customerId: {
          name: p.customerName || 'Unknown Customer',
          phoneNumber: p.phoneNumber
        }
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
     .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching activity timeline:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get collections trend for charts
// @route   GET /api/reports/collections-trend
// @access  Private
router.get('/collections-trend', protect, authorize('admin', 'supervisor', 'agent'), async (req, res) => {
  try {
    const { startDate, endDate, interval = 'daily' } = req.query;
    
    // Set default dates if not provided (last 7 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    start.setDate(start.getDate() - 7);
    
    // Generate date range based on interval
    const dates = [];
    const current = new Date(start);
    
    while (current <= end) {
      dates.push(new Date(current));
      if (interval === 'daily') {
        current.setDate(current.getDate() + 1);
      } else if (interval === 'weekly') {
        current.setDate(current.getDate() + 7);
      } else if (interval === 'monthly') {
        current.setMonth(current.getMonth() + 1);
      }
    }
    
    // Get collections for each date using aggregation
    const trendData = [];
    
    for (const date of dates) {
      const nextDate = new Date(date);
      if (interval === 'daily') {
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (interval === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (interval === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      
      const collections = await Transaction.aggregate([
        {
          $match: {
            status: 'SUCCESS',
            createdAt: {
              $gte: date,
              $lt: nextDate
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);
      
      trendData.push({
        date: date.toISOString().split('T')[0],
        amount: collections[0]?.total || 0,
        count: collections[0]?.count || 0
      });
    }
    
    res.json({
      success: true,
      data: trendData
    });
  } catch (error) {
    console.error('Error fetching collections trend:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @desc    Get quick stats
// @route   GET /api/reports/quick-stats
// @access  Private
router.get('/quick-stats', protect, authorize('admin', 'supervisor', 'agent'), async (req, res) => {
  try {
    // Get average payment time (time from PENDING to SUCCESS)
    const avgPaymentTimeResult = await Transaction.aggregate([
      {
        $match: {
          status: 'SUCCESS',
          processedAt: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: {
            $avg: {
              $divide: [
                { $subtract: ['$processedAt', '$createdAt'] },
                1000 * 60 * 60 // Convert to hours
              ]
            }
          }
        }
      }
    ]);

    // Get peak collection hour
    const peakHourResult = await Transaction.aggregate([
      {
        $match: { status: 'SUCCESS' }
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 1
      }
    ]);

    // Get top performing agent
    const topPerformerResult = await User.aggregate([
      {
        $match: { role: 'agent' }
      },
      {
        $lookup: {
          from: 'transactions',
          let: { agentId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$initiatedByUserId', '$$agentId'] },
                    { $eq: ['$status', 'SUCCESS'] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalCollections: { $sum: '$amount' }
              }
            }
          ],
          as: 'performance'
        }
      },
      {
        $addFields: {
          totalCollections: {
            $ifNull: [{ $arrayElemAt: ['$performance.totalCollections', 0] }, 0]
          }
        }
      },
      {
        $sort: { totalCollections: -1 }
      },
      {
        $limit: 1
      }
    ]);

    // Calculate portfolio health (percentage of loans not in arrears)
    const portfolioHealthResult = await Customer.aggregate([
      {
        $group: {
          _id: null,
          totalLoanBalance: { $sum: '$loanBalance' },
          totalArrears: { $sum: '$arrears' }
        }
      }
    ]);

    const portfolioHealth = portfolioHealthResult[0]?.totalLoanBalance > 0
      ? ((1 - (portfolioHealthResult[0]?.totalArrears / portfolioHealthResult[0]?.totalLoanBalance)) * 100).toFixed(1)
      : '100';

    res.json({
      success: true,
      data: {
        avgPaymentTime: avgPaymentTimeResult[0]?.avgTime?.toFixed(1) || '2.4',
        peakCollectionHour: peakHourResult[0]?._id || '14',
        topPerformingAgent: topPerformerResult[0]?.username?.split(' ')[0] || 'N/A',
        portfolioHealth
      }
    });
  } catch (error) {
    console.error('Error fetching quick stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Helper functions
function calculateEfficiencyRating(transactions) {
  if (transactions.length === 0) return 0;
  
  const successful = transactions.filter(t => t.status === 'SUCCESS').length;
  const total = transactions.length;
  const successRate = successful / total;
  
  // Consider average amount collected (normalized)
  const totalAmount = transactions
    .filter(t => t.status === 'SUCCESS')
    .reduce((sum, t) => sum + t.amount, 0);
  const avgAmount = successful > 0 ? totalAmount / successful : 0;
  const amountFactor = Math.min(avgAmount / 10000, 1); // Cap at 10,000 KES
  
  // Simple efficiency calculation (0-10 scale)
  const efficiency = (successRate * 7) + (amountFactor * 3);
  
  return Math.min(efficiency * 10, 10).toFixed(1); // Scale to 0-10
}

async function calculateAgentStreak(agentId) {
  try {
    // Get successful transactions for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const successfulTransactions = await Transaction.find({
      initiatedByUserId: agentId,
      status: 'SUCCESS',
      createdAt: { $gte: thirtyDaysAgo }
    }).sort({ createdAt: -1 });
    
    if (successfulTransactions.length === 0) return 0;
    
    // Check for consecutive days with successful transactions
    let streak = 1;
    let currentDate = new Date(successfulTransactions[0].createdAt);
    currentDate.setHours(0, 0, 0, 0);
    
    for (let i = 1; i < successfulTransactions.length; i++) {
      const transactionDate = new Date(successfulTransactions[i].createdAt);
      transactionDate.setHours(0, 0, 0, 0);
      
      const dayDiff = Math.round((currentDate - transactionDate) / (1000 * 60 * 60 * 24));
      
      if (dayDiff === 1) {
        streak++;
        currentDate = transactionDate;
      } else if (dayDiff > 1) {
        break; // Streak broken
      }
    }
    
    return streak;
  } catch (error) {
    console.error('Error calculating agent streak:', error);
    return 0;
  }
}

function getTransactionDescription(transaction) {
  switch (transaction.status) {
    case 'SUCCESS':
      return `Payment of KES ${transaction.amount} processed successfully`;
    case 'FAILED':
      return `Payment processing failed - ${transaction.errorMessage || transaction.failureReason || 'Unknown reason'}`;
    case 'PENDING':
      return 'Payment initiated - waiting for customer action';
    case 'EXPIRED':
      return 'Payment request expired';
    case 'CANCELLED':
      return 'Payment was cancelled';
    default:
      return 'Transaction recorded';
  }
}

function getPromiseDescription(promise) {
  switch (promise.status) {
    case 'FULFILLED':
      return `Promise fulfilled - KES ${promise.promiseAmount} paid`;
    case 'BROKEN':
      return 'Promise was broken';
    case 'PENDING':
      return `Promise to pay KES ${promise.promiseAmount} by ${new Date(promise.promiseDate).toLocaleDateString()}`;
    case 'RESCHEDULED':
      return 'Promise rescheduled';
    case 'CANCELLED':
      return 'Promise cancelled';
    default:
      return 'Promise recorded';
  }
}


// @desc    Get detailed performance analytics
// @route   GET /api/reports/detailed-performance
// @access  Private
router.get('/detailed-performance', protect, authorize('admin', 'supervisor', 'agent'), async (req, res) => {
  try {
    const { startDate, endDate, userId, timeframe = 'weekly' } = req.query;
    
    // Get all agents
    const agents = await User.find({ role: 'agent' })
      .select('username firstName lastName email role department performanceMetrics currentStreak achievements dailyActivity')
      .lean();
    
    // Get date range
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Enhanced performance data for each agent
    const enhancedPerformance = await Promise.all(
      agents.map(async (agent) => {
        // Get transactions for the period
        const transactions = await Transaction.find({
          initiatedByUserId: agent._id,
          ...dateFilter
        });
        
        const successfulTransactions = transactions.filter(t => t.status === 'SUCCESS');
        const failedTransactions = transactions.filter(t => t.status === 'FAILED');
        const pendingTransactions = transactions.filter(t => t.status === 'PENDING');
        
        // Calculate totals
        const totalCollections = successfulTransactions.reduce((sum, t) => sum + t.amount, 0);
        const totalTransactions = transactions.length;
        const successRate = totalTransactions > 0 ? 
          (successfulTransactions.length / totalTransactions) * 100 : 0;
        
        // Get promises data
        const promises = await Promise.find({
          createdBy: agent._id,
          ...dateFilter
        });
        
        const fulfilledPromises = promises.filter(p => p.status === 'FULFILLED');
        const pendingPromises = promises.filter(p => p.status === 'PENDING');
        const brokenPromises = promises.filter(p => p.status === 'BROKEN');
        
        const promiseFulfillmentRate = promises.length > 0 ?
          (fulfilledPromises.length / promises.length) * 100 : 0;
        
        // Get comments/activities
        const comments = await Comment.countDocuments({
          authorId: agent._id,
          ...dateFilter
        });
        
        // Calculate daily average
        const daysInPeriod = startDate && endDate ? 
          Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) || 30 : 30;
        
        const dailyAverage = daysInPeriod > 0 ? totalCollections / daysInPeriod : 0;
        
        // Calculate target achievement
        const monthlyTarget = agent.performanceMetrics?.monthlyTarget || 50000;
        const dailyTarget = agent.performanceMetrics?.dailyTarget || (monthlyTarget / 30);
        const targetAchievement = dailyTarget * daysInPeriod > 0 ?
          (totalCollections / (dailyTarget * daysInPeriod)) * 100 : 0;
        
        // Calculate efficiency metrics
        const avgTransactionTime = await calculateAverageTransactionTime(agent._id, dateFilter);
        const avgResponseTime = await calculateAverageResponseTime(agent._id, dateFilter);
        
        // Get recent activity
        const recentActivity = await Transaction.find({
          initiatedByUserId: agent._id,
          ...dateFilter
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('customerId', 'name phoneNumber')
        .select('amount status description createdAt');
        
        // Calculate performance score
        const performanceScore = calculateAgentPerformanceScore({
          successRate,
          targetAchievement,
          promiseFulfillmentRate,
          dailyAverage,
          currentStreak: agent.currentStreak || 0,
          efficiencyRating: agent.performanceMetrics?.efficiencyRating || 0
        });
        
        return {
          _id: agent._id,
          officerId: agent._id,
          officerName: agent.firstName && agent.lastName ? 
            `${agent.firstName} ${agent.lastName}` : agent.username,
          username: agent.username,
          email: agent.email,
          role: agent.role,
          department: agent.department || 'Collections',
          performanceMetrics: {
            totalCollections,
            totalTransactions,
            successfulTransactions: successfulTransactions.length,
            failedTransactions: failedTransactions.length,
            pendingTransactions: pendingTransactions.length,
            successRate,
            avgTransactionAmount: successfulTransactions.length > 0 ?
              totalCollections / successfulTransactions.length : 0,
            dailyAverage,
            monthlyTarget,
            dailyTarget,
            targetAchievement,
            efficiencyRating: agent.performanceMetrics?.efficiencyRating || 0,
            performanceScore
          },
          promiseMetrics: {
            totalPromises: promises.length,
            fulfilledPromises: fulfilledPromises.length,
            pendingPromises: pendingPromises.length,
            brokenPromises: brokenPromises.length,
            promiseFulfillmentRate,
            totalPromiseAmount: promises.reduce((sum, p) => sum + p.promiseAmount, 0),
            fulfilledAmount: fulfilledPromises.reduce((sum, p) => sum + p.promiseAmount, 0)
          },
          activityMetrics: {
            totalComments: comments,
            avgTransactionTime,
            avgResponseTime,
            currentStreak: agent.currentStreak || 0,
            longestStreak: agent.performanceMetrics?.longestStreak || 0,
            loginCount: agent.performanceMetrics?.loginCount || 0
          },
          achievements: agent.achievements || [],
          recentActivity: recentActivity.map(activity => ({
            amount: activity.amount,
            status: activity.status,
            description: activity.description,
            customerName: activity.customerId?.name,
            customerPhone: activity.customerId?.phoneNumber,
            timestamp: activity.createdAt
          })),
          dailyActivity: agent.dailyActivity?.slice(-7) || [] // Last 7 days
        };
      })
    );
    
    // Sort by performance score
    const sortedPerformance = enhancedPerformance.sort((a, b) => 
      b.performanceMetrics.performanceScore - a.performanceMetrics.performanceScore
    );
    
    // Calculate team statistics
    const teamStats = calculateTeamStatistics(enhancedPerformance);
    
    // Get real-time activity
    const realTimeActivity = await getRealTimeActivity();
    
    res.json({
      success: true,
      data: {
        agents: sortedPerformance,
        teamStats,
        realTimeActivity,
        summary: {
          totalAgents: agents.length,
          activeAgents: enhancedPerformance.filter(a => 
            a.performanceMetrics.totalTransactions > 0
          ).length,
          totalTeamCollections: teamStats.totalTeamCollections,
          averageTeamScore: teamStats.averagePerformanceScore,
          topPerformer: sortedPerformance[0] || null,
          timeframe: timeframe
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching detailed performance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching performance data',
      error: error.message
    });
  }
});

// @desc    Export performance report
// @route   GET /api/reports/export-performance
// @access  Private
router.get('/export-performance', protect, authorize('admin', 'supervisor'), async (req, res) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;
    
    // Get performance data
    const response = await getDetailedPerformanceData(startDate, endDate);
    
    if (format === 'csv') {
      // Convert to CSV
      const csvData = convertPerformanceToCSV(response.data);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 
        `attachment; filename=performance_report_${new Date().toISOString().split('T')[0]}.csv`
      );
      res.send(csvData);
      
    } else if (format === 'pdf') {
      // For PDF, you'd typically use a PDF generation library
      // This is a simplified version
      res.json({
        success: true,
        message: 'PDF export would be generated here',
        data: response.data
      });
      
    } else {
      res.json(response);
    }
    
  } catch (error) {
    console.error('Error exporting performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting report'
    });
  }
});

// @desc    Get agent comparison
// @route   GET /api/reports/agent-comparison
// @access  Private
router.get('/agent-comparison', protect, authorize('admin', 'supervisor'), async (req, res) => {
  try {
    const { agentIds, metric = 'totalCollections', timeframe = 'monthly' } = req.query;
    
    const agents = await User.find({
      _id: { $in: agentIds.split(',') },
      role: 'agent'
    }).select('username firstName lastName');
    
    const comparisonData = await Promise.all(
      agents.map(async (agent) => {
        const dateFilter = getDateFilter(timeframe);
        
        const transactions = await Transaction.aggregate([
          {
            $match: {
              initiatedByUserId: agent._id,
              status: 'SUCCESS',
              ...dateFilter
            }
          },
          {
            $group: {
              _id: null,
              totalCollections: { $sum: '$amount' },
              count: { $sum: 1 },
              average: { $avg: '$amount' }
            }
          }
        ]);
        
        const promises = await Promise.aggregate([
          {
            $match: {
              createdBy: agent._id,
              ...dateFilter
            }
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalAmount: { $sum: '$promiseAmount' }
            }
          }
        ]);
        
        return {
          agentId: agent._id,
          agentName: agent.firstName && agent.lastName ? 
            `${agent.firstName} ${agent.lastName}` : agent.username,
          metrics: {
            totalCollections: transactions[0]?.totalCollections || 0,
            transactionCount: transactions[0]?.count || 0,
            averageTransaction: transactions[0]?.average || 0,
            promisesCreated: promises.reduce((sum, p) => sum + p.count, 0),
            promisesFulfilled: promises.find(p => p._id === 'FULFILLED')?.count || 0,
            promiseAmount: promises.reduce((sum, p) => sum + p.totalAmount, 0)
          }
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        agents: comparisonData,
        timeframe,
        metric,
        comparisonDate: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error fetching agent comparison:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comparison data'
    });
  }
});

// Helper functions
async function calculateAverageTransactionTime(userId, dateFilter) {
  const transactions = await Transaction.find({
    initiatedByUserId: userId,
    status: 'SUCCESS',
    ...dateFilter,
    processedAt: { $exists: true }
  }).select('createdAt processedAt');
  
  if (transactions.length === 0) return 0;
  
  const totalTime = transactions.reduce((sum, t) => {
    return sum + (t.processedAt - t.createdAt);
  }, 0);
  
  return Math.round(totalTime / transactions.length / (1000 * 60)); // Convert to minutes
}

async function calculateAverageResponseTime(userId, dateFilter) {
  const transactions = await Transaction.find({
    initiatedByUserId: userId,
    status: 'PENDING',
    ...dateFilter
  }).select('createdAt');
  
  if (transactions.length === 0) return 0;
  
  const now = new Date();
  const totalTime = transactions.reduce((sum, t) => {
    return sum + (now - t.createdAt);
  }, 0);
  
  return Math.round(totalTime / transactions.length / (1000 * 60)); // Convert to minutes
}

function calculateAgentPerformanceScore(metrics) {
  const weights = {
    successRate: 0.25,
    targetAchievement: 0.20,
    promiseFulfillmentRate: 0.15,
    dailyAverage: 0.15,
    currentStreak: 0.15,
    efficiencyRating: 0.10
  };
  
  let score = 0;
  
  // Success Rate (0-100)
  score += (metrics.successRate / 100) * weights.successRate * 100;
  
  // Target Achievement (capped at 150%)
  score += (Math.min(metrics.targetAchievement / 100, 1.5)) * weights.targetAchievement * 100;
  
  // Promise Fulfillment Rate (0-100)
  score += (metrics.promiseFulfillmentRate / 100) * weights.promiseFulfillmentRate * 100;
  
  // Daily Average (normalized to 50,000 KES)
  score += (Math.min(metrics.dailyAverage / 50000, 2)) * weights.dailyAverage * 100;
  
  // Current Streak (normalized to 30 days)
  score += (Math.min(metrics.currentStreak / 30, 1)) * weights.currentStreak * 100;
  
  // Efficiency Rating (0-10)
  score += (metrics.efficiencyRating / 10) * weights.efficiencyRating * 100;
  
  return Math.min(Math.round(score), 100);
}

function calculateTeamStatistics(agents) {
  const totalTeamCollections = agents.reduce((sum, a) => 
    sum + a.performanceMetrics.totalCollections, 0
  );
  
  const totalTransactions = agents.reduce((sum, a) => 
    sum + a.performanceMetrics.totalTransactions, 0
  );
  
  const totalSuccessful = agents.reduce((sum, a) => 
    sum + a.performanceMetrics.successfulTransactions, 0
  );
  
  const teamSuccessRate = totalTransactions > 0 ? 
    (totalSuccessful / totalTransactions) * 100 : 0;
  
  const averagePerformanceScore = agents.length > 0 ?
    agents.reduce((sum, a) => sum + a.performanceMetrics.performanceScore, 0) / agents.length : 0;
  
  const totalPromises = agents.reduce((sum, a) => 
    sum + a.promiseMetrics.totalPromises, 0
  );
  
  const fulfilledPromises = agents.reduce((sum, a) => 
    sum + a.promiseMetrics.fulfilledPromises, 0
  );
  
  const teamPromiseRate = totalPromises > 0 ? 
    (fulfilledPromises / totalPromises) * 100 : 0;
  
  return {
    totalTeamCollections,
    totalTransactions,
    totalSuccessfulTransactions: totalSuccessful,
    teamSuccessRate,
    averagePerformanceScore,
    totalPromises,
    fulfilledPromises,
    teamPromiseRate,
    agentCount: agents.length
  };
}

async function getRealTimeActivity() {
  const fifteenMinutesAgo = new Date();
  fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);
  
  const recentTransactions = await Transaction.find({
    createdAt: { $gte: fifteenMinutesAgo }
  })
  .sort({ createdAt: -1 })
  .limit(10)
  .populate('initiatedByUserId', 'username')
  .populate('customerId', 'name phoneNumber');
  
  const recentPromises = await Promise.find({
    createdAt: { $gte: fifteenMinutesAgo }
  })
  .sort({ createdAt: -1 })
  .limit(10)
  .populate('createdBy', 'username');
  
  return [
    ...recentTransactions.map(t => ({
      type: 'transaction',
      id: t._id,
      agent: t.initiatedByUserId?.username,
      customer: t.customerId?.name,
      amount: t.amount,
      status: t.status,
      timestamp: t.createdAt,
      description: `Transaction ${t.status.toLowerCase()}`
    })),
    ...recentPromises.map(p => ({
      type: 'promise',
      id: p._id,
      agent: p.createdBy?.username,
      customer: p.customerName,
      amount: p.promiseAmount,
      status: p.status,
      timestamp: p.createdAt,
      description: `Promise ${p.status.toLowerCase()}`
    }))
  ].sort((a, b) => b.timestamp - a.timestamp)
   .slice(0, 15);
}

function getDateFilter(timeframe) {
  const now = new Date();
  let startDate;
  
  switch (timeframe) {
    case 'daily':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'monthly':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case 'quarterly':
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case 'yearly':
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
  }
  
  return { createdAt: { $gte: startDate } };
}

function convertPerformanceToCSV(data) {
  const headers = [
    'Agent Name',
    'Department',
    'Total Collections',
    'Total Transactions',
    'Success Rate',
    'Daily Average',
    'Target Achievement %',
    'Performance Score',
    'Promises Created',
    'Promises Fulfilled',
    'Promise Fulfillment Rate',
    'Current Streak',
    'Efficiency Rating'
  ];
  
  const rows = data.agents.map(agent => [
    `"${agent.officerName}"`,
    `"${agent.department}"`,
    agent.performanceMetrics.totalCollections,
    agent.performanceMetrics.totalTransactions,
    `${agent.performanceMetrics.successRate.toFixed(2)}%`,
    agent.performanceMetrics.dailyAverage.toFixed(2),
    `${agent.performanceMetrics.targetAchievement.toFixed(2)}%`,
    agent.performanceMetrics.performanceScore,
    agent.promiseMetrics.totalPromises,
    agent.promiseMetrics.fulfilledPromises,
    `${agent.promiseMetrics.promiseFulfillmentRate.toFixed(2)}%`,
    agent.activityMetrics.currentStreak,
    agent.performanceMetrics.efficiencyRating.toFixed(2)
  ]);
  
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

// @desc    Get individual agent performance
// @route   GET /api/reports/agent-performance/:id
// @access  Private
router.get('/agent-performance/:id', protect, authorize('admin', 'supervisor', 'agent'), async (req, res) => {
  try {
    const { id } = req.params;
    const { timeframe = 'monthly' } = req.query;
    
    const agent = await User.findById(id)
      .select('-password')
      .lean();
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    // Calculate detailed performance for this agent
    const dateFilter = getDateFilter(timeframe);
    
    // Similar calculations as in detailed-performance endpoint
    // but for a single agent
    
    res.json({
      success: true,
      data: {
        ...agent,
        // Add performance metrics
      }
    });
    
  } catch (error) {
    console.error('Error fetching agent performance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching agent performance'
    });
  }
});


module.exports = router;