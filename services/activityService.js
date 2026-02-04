// services/activityService.js
const Activity = require('../models/Activity');
const User = require('../models/User');

class ActivityService {
  // Log user login
  static async logLogin(user, ipAddress = null, userAgent = null) {
    try {
      return await Activity.log({
        userId: user._id,
        userDetails: {
          username: user.username,
          fullName: user.fullName || user.username,
          role: user.role,
          department: user.department,
          loanType: user.loanType
        },
        action: 'LOGIN',
        description: `${user.username} logged into the system`,
        resourceType: 'SYSTEM',
        ipAddress,
        userAgent,
        tags: ['authentication', 'login']
      });
    } catch (error) {
      console.error('Error logging login activity:', error);
      return null;
    }
  }

  // Log phone call
  static async logCall(user, customer, callType, duration = 0, notes = '') {
    try {
      return await Activity.log({
        userId: user._id,
        userDetails: {
          username: user.username,
          fullName: user.fullName || user.username,
          role: user.role,
          department: user.department,
          loanType: user.loanType
        },
        action: 'PROMISE_FOLLOWUP', // Using this for calls
        description: `${user.username} made a ${callType} call to customer ${customer.name}`,
        resourceType: 'CUSTOMER',
        resourceId: customer._id,
        resourceDetails: {
          customerId: customer.customerId,
          name: customer.name,
          phoneNumber: customer.phoneNumber
        },
        metadata: {
          callType,
          duration,
          notes
        },
        duration,
        tags: ['call', 'followup', 'customer']
      });
    } catch (error) {
      console.error('Error logging call activity:', error);
      return null;
    }
  }

  // Log promise creation
  static async logPromiseMade(user, customer, promise) {
    try {
      return await Activity.log({
        userId: user._id,
        userDetails: {
          username: user.username,
          fullName: user.fullName || user.username,
          role: user.role,
          department: user.department,
          loanType: user.loanType
        },
        action: 'PROMISE_CREATE',
        description: `${user.username} recorded a promise from ${customer.name} to pay KES ${promise.amount}`,
        resourceType: 'PROMISE',
        resourceId: promise._id,
        resourceDetails: {
          customerId: customer.customerId,
          customerName: customer.name,
          promiseAmount: promise.amount,
          promiseDate: promise.dueDate
        },
        amount: promise.amount,
        tags: ['promise', 'collection', 'customer']
      });
    } catch (error) {
      console.error('Error logging promise activity:', error);
      return null;
    }
  }

  // Log transaction/payment
  static async logPayment(user, customer, transaction) {
    try {
      return await Activity.log({
        userId: user._id,
        userDetails: {
          username: user.username,
          fullName: user.fullName || user.username,
          role: user.role,
          department: user.department,
          loanType: user.loanType
        },
        action: 'TRANSACTION_SUCCESS',
        description: `${user.username} processed payment of KES ${transaction.amount} from ${customer.name}`,
        resourceType: 'TRANSACTION',
        resourceId: transaction._id,
        resourceDetails: {
          customerId: customer.customerId,
          customerName: customer.name,
          transactionId: transaction.transactionId,
          amount: transaction.amount,
          paymentMethod: transaction.paymentMethod
        },
        amount: transaction.amount,
        status: 'SUCCESS',
        tags: ['payment', 'transaction', 'collection']
      });
    } catch (error) {
      console.error('Error logging payment activity:', error);
      return null;
    }
  }

  // Log customer assignment
  static async logAssignment(user, customer, assignedOfficer = null) {
    try {
      return await Activity.log({
        userId: user._id,
        userDetails: {
          username: user.username,
          fullName: user.fullName || user.username,
          role: user.role,
          department: user.department,
          loanType: user.loanType
        },
        action: assignedOfficer ? 'CUSTOMER_ASSIGN' : 'CUSTOMER_VIEW',
        description: `${user.username} ${assignedOfficer ? 'assigned customer ' + customer.name + ' to ' + assignedOfficer.username : 'viewed customer ' + customer.name}`,
        resourceType: 'CUSTOMER',
        resourceId: customer._id,
        resourceDetails: {
          customerId: customer.customerId,
          customerName: customer.name,
          assignedOfficer: assignedOfficer ? {
            id: assignedOfficer._id,
            username: assignedOfficer.username
          } : null
        },
        tags: ['customer', 'assignment']
      });
    } catch (error) {
      console.error('Error logging assignment activity:', error);
      return null;
    }
  }

  // Get recent activities for supervisor dashboard
  static async getSupervisorActivities(teamMemberIds, limit = 20) {
    try {
      const activities = await Activity.find({
        userId: { $in: teamMemberIds }
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

      // Transform activities to match frontend format
      return activities.map(activity => ({
        type: this.mapActionToType(activity.action),
        officer: activity.userDetails?.fullName || activity.userDetails?.username || 'Unknown',
        time: activity.createdAt,
        details: activity.description,
        amount: activity.amount || null,
        action: activity.action,
        resourceType: activity.resourceType
      }));
    } catch (error) {
      console.error('Error fetching supervisor activities:', error);
      return [];
    }
  }

  // Helper method to map action to frontend type
  static mapActionToType(action) {
    const typeMap = {
      'LOGIN': 'login',
      'PROMISE_FOLLOWUP': 'call',
      'PROMISE_CREATE': 'promise_made',
      'TRANSACTION_SUCCESS': 'transaction',
      'CUSTOMER_ASSIGN': 'assignment',
      'CUSTOMER_VIEW': 'customer_update',
      'USER_VIEW': 'user_login'
    };
    
    return typeMap[action] || 'activity';
  }

  // Get activity statistics for dashboard
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
}

module.exports = ActivityService;