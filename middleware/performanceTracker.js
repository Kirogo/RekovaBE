// middleware/performanceTracker.js
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Promise = require('../models/Promise');

class PerformanceTracker {
  /**
   * Update user performance metrics after a transaction
   */
  static async trackTransaction(userId, transaction) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      const metrics = user.performanceMetrics;
      
      // Update transaction counts
      metrics.totalTransactions += 1;
      
      if (transaction.status === 'SUCCESS') {
        metrics.successfulTransactions += 1;
        metrics.totalCollections += transaction.amount;
        
        // Update average transaction amount
        const totalSuccessful = metrics.successfulTransactions;
        metrics.averageTransactionAmount = (
          (metrics.averageTransactionAmount * (totalSuccessful - 1)) + transaction.amount
        ) / totalSuccessful;
      } else if (transaction.status === 'FAILED') {
        metrics.failedTransactions += 1;
      }
      
      // Update daily activity
      await this.updateDailyActivity(user, 'transaction', transaction);
      
      // Update streak if transaction is successful
      if (transaction.status === 'SUCCESS') {
        await this.updateStreak(user);
      }
      
      await user.save();
      
      // Log performance update weekly
      await this.logPerformanceHistory(user);
      
    } catch (error) {
      console.error('Error tracking transaction performance:', error);
    }
  }

  /**
   * Update user performance metrics after a promise
   */
  static async trackPromise(userId, promise) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Update daily activity
      await this.updateDailyActivity(user, 'promise', promise);
      
      // If promise fulfilled, track it in performance
      if (promise.status === 'FULFILLED') {
        const metrics = user.performanceMetrics;
        metrics.totalCollections += promise.promiseAmount;
        metrics.successfulTransactions += 1;
        metrics.totalTransactions += 1;
        
        await user.save();
      }
      
    } catch (error) {
      console.error('Error tracking promise performance:', error);
    }
  }

  /**
   * Update daily activity record
   */
  static async updateDailyActivity(user, activityType, data) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let dailyRecord = user.dailyActivity.find(record => 
        record.date.toDateString() === today.toDateString()
      );
      
      if (!dailyRecord) {
        dailyRecord = {
          date: today,
          transactions: 0,
          amountCollected: 0,
          promisesCreated: 0,
          promisesFulfilled: 0,
          commentsAdded: 0
        };
        user.dailyActivity.push(dailyRecord);
      }
      
      switch (activityType) {
        case 'transaction':
          if (data.status === 'SUCCESS') {
            dailyRecord.transactions += 1;
            dailyRecord.amountCollected += data.amount;
          }
          break;
        case 'promise':
          if (data.status === 'PENDING') {
            dailyRecord.promisesCreated += 1;
          } else if (data.status === 'FULFILLED') {
            dailyRecord.promisesFulfilled += 1;
            dailyRecord.amountCollected += data.promiseAmount;
          }
          break;
        case 'comment':
          dailyRecord.commentsAdded += 1;
          break;
        case 'login':
          dailyRecord.loginTime = new Date();
          break;
        case 'logout':
          dailyRecord.logoutTime = new Date();
          if (dailyRecord.loginTime) {
            const duration = (dailyRecord.logoutTime - dailyRecord.loginTime) / (1000 * 60); // minutes
            dailyRecord.activeDuration = duration;
          }
          break;
      }
      
      await user.save();
      
    } catch (error) {
      console.error('Error updating daily activity:', error);
    }
  }

  /**
   * Update user streak
   */
  static async updateStreak(user) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Check if there was activity yesterday
      const hadActivityYesterday = user.dailyActivity.some(record => 
        record.date.toDateString() === yesterday.toDateString() &&
        (record.transactions > 0 || record.amountCollected > 0)
      );
      
      if (hadActivityYesterday) {
        user.currentStreak += 1;
        if (user.currentStreak > user.longestStreak) {
          user.longestStreak = user.currentStreak;
        }
      } else {
        // Reset streak if missed a day
        user.currentStreak = 1;
      }
      
      await user.save();
      
      // Check for streak achievements
      await this.checkAchievements(user);
      
    } catch (error) {
      console.error('Error updating streak:', error);
    }
  }

  /**
   * Check and award achievements
   */
  static async checkAchievements(user) {
    const achievements = [];
    const metrics = user.performanceMetrics;
    
    // Streak achievements
    if (user.currentStreak >= 7 && !user.achievements.some(a => a.title === 'Week Warrior')) {
      achievements.push({
        title: 'Week Warrior',
        description: 'Maintained 7-day activity streak',
        earnedAt: new Date(),
        icon: '🔥',
        type: 'consistency'
      });
    }
    
    if (user.currentStreak >= 30 && !user.achievements.some(a => a.title === 'Monthly Master')) {
      achievements.push({
        title: 'Monthly Master',
        description: 'Maintained 30-day activity streak',
        earnedAt: new Date(),
        icon: '🏆',
        type: 'consistency'
      });
    }
    
    // Collection achievements
    if (metrics.totalCollections >= 1000000 && !user.achievements.some(a => a.title === 'Millionaire Maker')) {
      achievements.push({
        title: 'Millionaire Maker',
        description: 'Collected over 1,000,000 KES',
        earnedAt: new Date(),
        icon: '💰',
        type: 'collection'
      });
    }
    
    // Efficiency achievements
    if (metrics.efficiencyRating >= 9 && !user.achievements.some(a => a.title === 'Efficiency Expert')) {
      achievements.push({
        title: 'Efficiency Expert',
        description: 'Achieved 9+ efficiency rating',
        earnedAt: new Date(),
        icon: '⚡',
        type: 'efficiency'
      });
    }
    
    if (achievements.length > 0) {
      user.achievements.push(...achievements);
      await user.save();
    }
  }

  /**
   * Log performance history periodically
   */
  static async logPerformanceHistory(user) {
    try {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday
      
      // Log weekly performance every Monday
      if (dayOfWeek === 1) {
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        
        const weeklyTransactions = await Transaction.countDocuments({
          initiatedByUserId: user._id,
          createdAt: { $gte: lastWeekStart, $lt: today }
        });
        
        const weeklyCollections = await Transaction.aggregate([
          {
            $match: {
              initiatedByUserId: user._id,
              status: 'SUCCESS',
              createdAt: { $gte: lastWeekStart, $lt: today }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);
        
        user.performanceHistory.push({
          period: 'weekly',
          startDate: lastWeekStart,
          endDate: today,
          totalCollections: weeklyCollections[0]?.total || 0,
          totalTransactions: weeklyTransactions,
          successRate: weeklyTransactions > 0 ? 
            (await Transaction.countDocuments({
              initiatedByUserId: user._id,
              status: 'SUCCESS',
              createdAt: { $gte: lastWeekStart, $lt: today }
            })) / weeklyTransactions : 0,
          averageAmount: weeklyCollections[0]?.total / weeklyTransactions || 0,
          rank: await this.calculateRank(user._id, 'weekly')
        });
        
        await user.save();
      }
      
    } catch (error) {
      console.error('Error logging performance history:', error);
    }
  }

  /**
   * Calculate user rank for a period
   */
  static async calculateRank(userId, period) {
    try {
      const users = await User.find({ role: 'agent' })
        .sort({ 'performanceMetrics.totalCollections': -1 });
      
      const userIndex = users.findIndex(user => user._id.toString() === userId.toString());
      return userIndex + 1; // 1-based rank
      
    } catch (error) {
      console.error('Error calculating rank:', error);
      return 0;
    }
  }

  /**
   * Get real-time leaderboard
   */
  static async getLeaderboard(timeframe = 'daily') {
    try {
      let dateFilter = {};
      const now = new Date();
      
      switch (timeframe) {
        case 'daily':
          const todayStart = new Date(now);
          todayStart.setHours(0, 0, 0, 0);
          dateFilter = { createdAt: { $gte: todayStart } };
          break;
        case 'weekly':
          const weekStart = new Date(now);
          weekStart.setDate(weekStart.getDate() - 7);
          dateFilter = { createdAt: { $gte: weekStart } };
          break;
        case 'monthly':
          const monthStart = new Date(now);
          monthStart.setMonth(monthStart.getMonth() - 1);
          dateFilter = { createdAt: { $gte: monthStart } };
          break;
      }
      
      // Aggregate performance data
      const leaderboard = await Transaction.aggregate([
        {
          $match: {
            ...dateFilter,
            status: 'SUCCESS'
          }
        },
        {
          $group: {
            _id: '$initiatedByUserId',
            totalAmount: { $sum: '$amount' },
            transactionCount: { $count: {} },
            avgAmount: { $avg: '$amount' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
        {
          $project: {
            _id: 1,
            officerName: { $ifNull: ['$user.username', 'Unknown'] },
            totalCollections: '$totalAmount',
            transactionCount: 1,
            avgTransaction: '$avgAmount',
            efficiencyRating: { $ifNull: ['$user.performanceMetrics.efficiencyRating', 0] },
            successRate: 1
          }
        },
        {
          $sort: { totalCollections: -1 }
        }
      ]);
      
      // Calculate success rates
      for (const entry of leaderboard) {
        const totalTransactions = await Transaction.countDocuments({
          initiatedByUserId: entry._id,
          ...dateFilter
        });
        entry.successRate = totalTransactions > 0 ? 
          (entry.transactionCount / totalTransactions) * 100 : 0;
      }
      
      return leaderboard;
      
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }
}

module.exports = PerformanceTracker;