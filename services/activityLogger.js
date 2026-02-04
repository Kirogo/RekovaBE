//services/activityService.js
const Activity = require('../models/Activity');
const User = require('../models/User');

class ActivityLogger {
  /**
   * Log user activity with proper action mapping
   * @param {Object} options - Activity options
   */
  static async log(options) {
    try {
      const {
        userId,
        action,
        description,
        resourceType = null,
        resourceId = null,
        resourceDetails = {},
        ipAddress = null,
        userAgent = null,
        requestDetails = {},
        status = 'SUCCESS',
        errorDetails = null,
        sessionId = null,
        duration = 0,
        tags = [],
        amount = null
      } = options;

      // Get user details
      let userDetails = {};
      try {
        const user = await User.findById(userId).select('username fullName role department loanType').lean();
        if (user) {
          userDetails = {
            username: user.username,
            fullName: user.fullName || user.username,
            role: user.role,
            department: user.department,
            loanType: user.loanType
          };
        }
      } catch (userError) {
        console.warn('Failed to fetch user details for activity logging:', userError.message);
      }

      // Map generic actions to specific ones
      let mappedAction = action;
      if (action === 'VIEW') {
        if (resourceType === 'CUSTOMER') {
          mappedAction = 'CUSTOMER_VIEW';
        } else if (resourceType === 'TRANSACTION') {
          mappedAction = 'TRANSACTION_VIEW';
        } else if (resourceType === 'PROMISE') {
          mappedAction = 'PROMISE_VIEW';
        } else if (resourceType === 'USER') {
          mappedAction = 'USER_VIEW';
        } else {
          mappedAction = 'SYSTEM_VIEW';
        }
      }

      // Prepare activity data
      const activityData = {
        userId,
        userDetails,
        action: mappedAction,
        description,
        resourceType,
        resourceId,
        resourceDetails,
        ipAddress,
        userAgent,
        requestDetails,
        status,
        sessionId,
        duration,
        tags: Array.isArray(tags) ? tags : [tags],
        amount
      };

      // Add error details if provided
      if (errorDetails) {
        activityData.errorDetails = {
          message: errorDetails.message || String(errorDetails),
          stack: errorDetails.stack,
          code: errorDetails.code
        };
      }

      // Log the activity (don't await to avoid blocking)
      Activity.log(activityData).catch(error => {
        console.error('Background activity logging failed:', error.message);
      });

      return true;
    } catch (error) {
      console.error('Activity logging setup error:', error.message);
      return false;
    }
  }

  /**
   * Log authentication activity
   */
  static async logAuth(userId, action, ipAddress = null, userAgent = null, details = {}) {
    const descriptions = {
      'LOGIN': 'User logged in to the system',
      'LOGOUT': 'User logged out of the system',
      'PASSWORD_CHANGE': 'User changed their password'
    };

    return this.log({
      userId,
      action,
      description: descriptions[action] || `User ${action.toLowerCase()} action`,
      ipAddress,
      userAgent,
      requestDetails: details,
      tags: ['authentication', 'security']
    });
  }

  /**
   * Log customer activity
   */
  static async logCustomer(userId, action, customer, details = {}) {
    const descriptions = {
      'CUSTOMER_CREATE': 'Created new customer',
      'CUSTOMER_UPDATE': 'Updated customer information',
      'CUSTOMER_VIEW': 'Viewed customer details',
      'CUSTOMER_DELETE': 'Deactivated customer',
      'CUSTOMER_ASSIGN': 'Assigned customer to officer',
      'CUSTOMER_REASSIGN': 'Reassigned customer to different officer'
    };

    return this.log({
      userId,
      action,
      description: `${descriptions[action]}: ${customer.name} (${customer.phoneNumber})`,
      resourceType: 'CUSTOMER',
      resourceId: customer._id,
      resourceDetails: {
        customerId: customer.customerId,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        loanBalance: customer.loanBalance,
        arrears: customer.arrears,
        loanType: customer.loanType
      },
      requestDetails: details,
      tags: ['customer', 'management']
    });
  }

  /**
   * Log transaction activity
   */
  static async logTransaction(userId, action, transaction, details = {}) {
    const descriptions = {
      'TRANSACTION_INITIATE': 'Initiated payment transaction',
      'TRANSACTION_SUCCESS': 'Transaction completed successfully',
      'TRANSACTION_FAIL': 'Transaction failed',
      'TRANSACTION_EXPIRE': 'Transaction expired',
      'TRANSACTION_CANCEL': 'Cancelled transaction',
      'TRANSACTION_VIEW': 'Viewed transaction details'
    };

    return this.log({
      userId,
      action,
      description: `${descriptions[action]}: Ksh ${transaction.amount} for ${transaction.customerName || 'customer'}`,
      resourceType: 'TRANSACTION',
      resourceId: transaction._id,
      resourceDetails: {
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        status: transaction.status,
        customerId: transaction.customerId,
        paymentMethod: transaction.paymentMethod
      },
      requestDetails: details,
      amount: transaction.amount,
      tags: ['transaction', 'payment']
    });
  }

  /**
   * Log promise activity
   */
  static async logPromise(userId, action, promise, details = {}) {
    const descriptions = {
      'PROMISE_CREATE': 'Created payment promise',
      'PROMISE_UPDATE': 'Updated promise details',
      'PROMISE_FULFILL': 'Marked promise as fulfilled',
      'PROMISE_BREAK': 'Marked promise as broken',
      'PROMISE_FOLLOWUP': 'Followed up on promise',
      'PROMISE_VIEW': 'Viewed promise details'
    };

    return this.log({
      userId,
      action,
      description: `${descriptions[action]}: Ksh ${promise.promiseAmount} due ${promise.promiseDate}`,
      resourceType: 'PROMISE',
      resourceId: promise._id,
      resourceDetails: {
        promiseId: promise.promiseId,
        amount: promise.promiseAmount,
        dueDate: promise.promiseDate,
        status: promise.status,
        customerId: promise.customerId
      },
      requestDetails: details,
      amount: promise.promiseAmount,
      tags: ['promise', 'collection']
    });
  }

  /**
   * Log phone call activity
   */
  static async logPhoneCall(userId, customer, callDetails = {}) {
    const { duration = 0, callType = 'followup', notes = '', outcome = '' } = callDetails;
    
    return this.log({
      userId,
      action: 'PROMISE_FOLLOWUP',
      description: `Made ${callType} call to customer ${customer.name || customer.customerName}`,
      resourceType: 'CUSTOMER',
      resourceId: customer._id,
      resourceDetails: {
        customerId: customer.customerId,
        name: customer.name || customer.customerName,
        phoneNumber: customer.phoneNumber,
        callDuration: duration,
        callType,
        outcome
      },
      requestDetails: { notes },
      duration: duration * 1000, // Convert to milliseconds
      tags: ['call', 'customer', 'followup']
    });
  }

  /**
   * Log payment collection
   */
  static async logPaymentCollection(userId, customer, amount, paymentMethod = 'M-PESA') {
    return this.log({
      userId,
      action: 'TRANSACTION_SUCCESS',
      description: `Collected payment of Ksh ${amount} from ${customer.name || customer.customerName}`,
      resourceType: 'TRANSACTION',
      resourceDetails: {
        customerId: customer.customerId,
        name: customer.name || customer.customerName,
        phoneNumber: customer.phoneNumber,
        paymentMethod
      },
      amount,
      tags: ['payment', 'collection', 'transaction']
    });
  }

  /**
   * Log promise made
   */
  static async logPromiseMade(userId, customer, amount, dueDate) {
    return this.log({
      userId,
      action: 'PROMISE_CREATE',
      description: `Recorded promise of Ksh ${amount} from ${customer.name || customer.customerName} due ${dueDate}`,
      resourceType: 'PROMISE',
      resourceDetails: {
        customerId: customer.customerId,
        name: customer.name || customer.customerName,
        phoneNumber: customer.phoneNumber,
        promiseAmount: amount,
        dueDate
      },
      amount,
      tags: ['promise', 'collection', 'customer']
    });
  }

  /**
   * Log user login (enhanced)
   */
  static async logLogin(user, ipAddress = null, userAgent = null) {
    return this.logAuth(user._id, 'LOGIN', ipAddress, userAgent, {
      success: true,
      username: user.username,
      role: user.role
    });
  }

  /**
   * Log comment/note added
   */
  static async logComment(userId, customer, comment, commentType = 'note') {
    return this.log({
      userId,
      action: 'PROMISE_FOLLOWUP',
      description: `Added ${commentType} for customer ${customer.name || customer.customerName}`,
      resourceType: 'CUSTOMER',
      resourceId: customer._id,
      resourceDetails: {
        customerId: customer.customerId,
        name: customer.name || customer.customerName,
        commentType,
        commentPreview: comment.substring(0, 100) + (comment.length > 100 ? '...' : '')
      },
      tags: ['comment', 'customer', 'followup']
    });
  }

  /**
   * Log promise due soon (for supervisor alerts)
   */
  static async logPromiseDueSoon(userId, customer, promise) {
    return this.log({
      userId,
      action: 'PROMISE_FOLLOWUP',
      description: `Promise of Ksh ${promise.promiseAmount} from ${customer.name || customer.customerName} is due soon`,
      resourceType: 'PROMISE',
      resourceId: promise._id,
      resourceDetails: {
        customerId: customer.customerId,
        name: customer.name || customer.customerName,
        promiseAmount: promise.promiseAmount,
        dueDate: promise.promiseDate,
        status: 'due_soon'
      },
      amount: promise.promiseAmount,
      tags: ['promise', 'due_soon', 'alert', 'supervisor']
    });
  }

  /**
   * Log user management activity (admin/supervisor only)
   */
  static async logUserManagement(userId, action, targetUser, details = {}) {
    const descriptions = {
      'USER_CREATE': 'Created new user account',
      'USER_UPDATE': 'Updated user account',
      'USER_DEACTIVATE': 'Deactivated user account',
      'USER_VIEW': 'Viewed user details'
    };

    return this.log({
      userId,
      action,
      description: `${descriptions[action]}: ${targetUser.username} (${targetUser.role})`,
      resourceType: 'USER',
      resourceId: targetUser._id,
      resourceDetails: {
        username: targetUser.username,
        role: targetUser.role,
        email: targetUser.email,
        fullName: targetUser.fullName
      },
      requestDetails: details,
      tags: ['user', 'management', 'admin']
    });
  }

  /**
   * Log system activity
   */
  static async logSystem(userId, action, description, details = {}) {
    // Map generic VIEW to SYSTEM_VIEW
    const mappedAction = action === 'VIEW' ? 'SYSTEM_VIEW' : action;
    
    return this.log({
      userId,
      action: mappedAction,
      description,
      resourceType: 'SYSTEM',
      requestDetails: details,
      tags: ['system', 'administration']
    });
  }

  /**
   * Log supervisor activity
   */
  static async logSupervisor(userId, action, description, details = {}) {
    return this.log({
      userId,
      action,
      description,
      resourceType: 'SYSTEM',
      requestDetails: details,
      tags: ['supervisor', 'management', 'team']
    });
  }

  /**
   * Log error activity
   */
  static async logError(userId, action, description, error, details = {}) {
    return this.log({
      userId,
      action,
      description,
      status: 'FAILED',
      errorDetails: error,
      requestDetails: details,
      tags: ['error', 'failure']
    });
  }

  /**
   * Log activity with timing
   */
  static async logWithTiming(userId, action, description, startTime, options = {}) {
    const duration = Date.now() - startTime;
    
    return this.log({
      userId,
      action,
      description,
      duration,
      ...options
    });
  }

  /**
   * Simple log method that won't fail
   */
  static async logSafe(userId, description, options = {}) {
    try {
      return await this.log({
        userId,
        action: 'SYSTEM_VIEW',
        description,
        ...options
      });
    } catch (error) {
      console.warn('Safe log failed:', error.message);
      return false;
    }
  }

  /**
   * Get recent team activities for supervisor dashboard - FILTERED VERSION
   * Only shows important activities: logins, transactions, calls, promises, and alerts
   */
  static async getTeamActivities(teamMemberIds, limit = 15) {
    try {
      // Only get IMPORTANT activities for supervisor
      const importantActions = [
        'LOGIN',                    // Officer logins
        'TRANSACTION_SUCCESS',      // Successful payments
        'TRANSACTION_INITIATE',     // Payment initiated
        'PROMISE_FOLLOWUP',         // Calls and follow-ups
        'PROMISE_CREATE',           // Promises made
        'PROMISE_FULFILL',          // Promises fulfilled (payments received)
        'PROMISE_BREAK',            // Broken promises
        'CUSTOMER_ASSIGN',          // Customer assignments
        'BULK_ASSIGNMENT'           // Bulk assignments
      ];

      const activities = await Activity.find({
        userId: { $in: teamMemberIds },
        action: { $in: importantActions }  // FILTER: Only important activities
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

      // Transform activities to match frontend format
      return activities.map(activity => {
        // Map action to activity type for frontend
        let activityType = 'activity';
        if (activity.action === 'LOGIN') activityType = 'login';
        else if (activity.action === 'TRANSACTION_SUCCESS' || activity.action === 'TRANSACTION_INITIATE') activityType = 'transaction';
        else if (activity.action === 'PROMISE_FOLLOWUP') activityType = 'call';
        else if (activity.action === 'PROMISE_CREATE') activityType = 'promise_made';
        else if (activity.action === 'PROMISE_FULFILL') activityType = 'promise_fulfilled';
        else if (activity.action === 'PROMISE_BREAK') activityType = 'promise_broken';
        else if (activity.action === 'CUSTOMER_ASSIGN' || activity.action === 'BULK_ASSIGNMENT') activityType = 'assignment';
        // We're intentionally NOT including CUSTOMER_VIEW, USER_VIEW, etc.

        return {
          type: activityType,
          officer: activity.userDetails?.fullName || activity.userDetails?.username || 'Unknown',
          time: activity.createdAt,
          details: activity.description,
          amount: activity.amount || null,
          action: activity.action,
          resourceType: activity.resourceType,
          isImportant: true  // Flag for important activities
        };
      });
    } catch (error) {
      console.error('Error fetching team activities:', error);
      return [];
    }
  }

  /**
   * Get activity statistics for dashboard
   */
  static async getActivityStats(teamMemberIds, startDate = null, endDate = null) {
    try {
      const match = {
        userId: { $in: teamMemberIds }
      };

      if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate) match.createdAt.$lte = new Date(endDate);
      }

      const stats = await Activity.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      return stats;
    } catch (error) {
      console.error('Error fetching activity stats:', error);
      return [];
    }
  }

  /**
   * Get important activity summary for supervisor (counts of important activities)
   */
  static async getImportantActivitySummary(teamMemberIds, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const importantActions = [
        'LOGIN',
        'TRANSACTION_SUCCESS',
        'PROMISE_FOLLOWUP',
        'PROMISE_CREATE',
        'PROMISE_FULFILL',
        'PROMISE_BREAK'
      ];

      const summary = await Activity.aggregate([
        {
          $match: {
            userId: { $in: teamMemberIds },
            action: { $in: importantActions },
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      // Format the summary
      const formattedSummary = {
        logins: summary.find(s => s._id === 'LOGIN')?.count || 0,
        transactions: summary.find(s => s._id === 'TRANSACTION_SUCCESS')?.count || 0,
        calls: summary.find(s => s._id === 'PROMISE_FOLLOWUP')?.count || 0,
        promisesMade: summary.find(s => s._id === 'PROMISE_CREATE')?.count || 0,
        promisesFulfilled: summary.find(s => s._id === 'PROMISE_FULFILL')?.count || 0,
        promisesBroken: summary.find(s => s._id === 'PROMISE_BREAK')?.count || 0,
        totalCollections: summary.find(s => s._id === 'TRANSACTION_SUCCESS')?.totalAmount || 0,
        totalPromises: summary.find(s => s._id === 'PROMISE_CREATE')?.totalAmount || 0
      };

      return formattedSummary;
    } catch (error) {
      console.error('Error fetching activity summary:', error);
      return {
        logins: 0,
        transactions: 0,
        calls: 0,
        promisesMade: 0,
        promisesFulfilled: 0,
        promisesBroken: 0,
        totalCollections: 0,
        totalPromises: 0
      };
    }
  }
}

module.exports = ActivityLogger;