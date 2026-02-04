// models/Activity.js
const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  // User who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // User details (for quick access without populating)
  userDetails: {
    username: String,
    fullName: String,
    role: String,
    department: String,
    loanType: String
  },
  
  // Action performed - FIXED: Removed generic VIEW, added specific ones
  action: {
    type: String,
    required: true,
    enum: [
      // Authentication
      'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE',
      
      // Customer Operations
      'CUSTOMER_CREATE', 'CUSTOMER_UPDATE', 'CUSTOMER_VIEW', 'CUSTOMER_DELETE',
      
      // Transaction Operations
      'TRANSACTION_INITIATE', 'TRANSACTION_SUCCESS', 'TRANSACTION_FAIL', 
      'TRANSACTION_EXPIRE', 'TRANSACTION_CANCEL', 'TRANSACTION_VIEW',
      
      // Promise Operations
      'PROMISE_CREATE', 'PROMISE_UPDATE', 'PROMISE_FULFILL', 'PROMISE_BREAK',
      'PROMISE_FOLLOWUP', 'PROMISE_VIEW',
      
      // Assignment Operations
      'CUSTOMER_ASSIGN', 'CUSTOMER_REASSIGN', 'BULK_ASSIGNMENT',
      
      // User Management (Admin/Supervisor only)
      'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'USER_VIEW',
      
      // System Operations
      'REPORT_GENERATE', 'DATA_EXPORT', 'SETTINGS_UPDATE', 'SYSTEM_VIEW',
      
      // Supervisor Operations
      'SUPERVISOR_DASHBOARD_VIEW', 'OFFICER_PERFORMANCE_VIEW',
      'TEAM_REPORT_GENERATE', 'LOAN_TYPE_ASSIGN'
    ]
  },
  
  // Action description (human-readable)
  description: {
    type: String,
    required: true
  },
  
  // Resource involved (customer, transaction, etc.)
  resourceType: {
    type: String,
    enum: ['CUSTOMER', 'TRANSACTION', 'PROMISE', 'USER', 'SYSTEM', 'REPORT', null],
    default: null
  },
  
  // Resource ID (if applicable)
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  
  // Resource details for quick access
  resourceDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // IP address for security tracking
  ipAddress: {
    type: String,
    trim: true
  },
  
  // User agent/browser info
  userAgent: {
    type: String,
    trim: true
  },
  
  // Request details
  requestDetails: {
    method: String,
    url: String,
    params: mongoose.Schema.Types.Mixed,
    query: mongoose.Schema.Types.Mixed,
    body: mongoose.Schema.Types.Mixed
  },
  
  // Status of the action
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'PENDING'],
    default: 'SUCCESS'
  },
  
  // Error details if failed
  errorDetails: {
    message: String,
    stack: String,
    code: String
  },
  
  // Location if available (from IP geolocation)
  location: {
    country: String,
    city: String,
    timezone: String
  },
  
  // For search and categorization
  tags: [{
    type: String,
    index: true
  }],
  
  // Session ID for grouping related activities
  sessionId: {
    type: String,
    index: true
  },
  
  // Duration in milliseconds (for performance tracking)
  duration: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for common queries
ActivitySchema.index({ createdAt: -1 });
ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ action: 1, createdAt: -1 });
ActivitySchema.index({ resourceType: 1, resourceId: 1 });
ActivitySchema.index({ 'userDetails.role': 1, createdAt: -1 });
ActivitySchema.index({ status: 1, createdAt: -1 });
ActivitySchema.index({ tags: 1, createdAt: -1 });

// Virtual for readable timestamp
ActivitySchema.virtual('readableTime').get(function() {
  return this.createdAt.toLocaleString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
});

// Virtual for action category
ActivitySchema.virtual('category').get(function() {
  const categories = {
    'LOGIN': 'authentication',
    'LOGOUT': 'authentication',
    'PASSWORD_CHANGE': 'authentication',
    
    'CUSTOMER_CREATE': 'customer',
    'CUSTOMER_UPDATE': 'customer',
    'CUSTOMER_VIEW': 'customer',
    'CUSTOMER_DELETE': 'customer',
    
    'TRANSACTION_INITIATE': 'transaction',
    'TRANSACTION_SUCCESS': 'transaction',
    'TRANSACTION_FAIL': 'transaction',
    'TRANSACTION_EXPIRE': 'transaction',
    'TRANSACTION_CANCEL': 'transaction',
    'TRANSACTION_VIEW': 'transaction',
    
    'PROMISE_CREATE': 'promise',
    'PROMISE_UPDATE': 'promise',
    'PROMISE_FULFILL': 'promise',
    'PROMISE_BREAK': 'promise',
    'PROMISE_FOLLOWUP': 'promise',
    'PROMISE_VIEW': 'promise',
    
    'USER_CREATE': 'user',
    'USER_UPDATE': 'user',
    'USER_DEACTIVATE': 'user',
    'USER_VIEW': 'user',
    
    'CUSTOMER_ASSIGN': 'assignment',
    'CUSTOMER_REASSIGN': 'assignment',
    'BULK_ASSIGNMENT': 'assignment',
    
    'REPORT_GENERATE': 'system',
    'DATA_EXPORT': 'system',
    'SETTINGS_UPDATE': 'system',
    'SYSTEM_VIEW': 'system',
    
    'SUPERVISOR_DASHBOARD_VIEW': 'supervisor',
    'OFFICER_PERFORMANCE_VIEW': 'supervisor',
    'TEAM_REPORT_GENERATE': 'supervisor',
    'LOAN_TYPE_ASSIGN': 'supervisor'
  };
  
  return categories[this.action] || 'general';
});

// Static method to log activity with error handling
ActivitySchema.statics.log = async function(data) {
  try {
    // Map generic VIEW actions to specific ones
    if (data.action === 'VIEW') {
      if (data.resourceType === 'CUSTOMER') {
        data.action = 'CUSTOMER_VIEW';
      } else if (data.resourceType === 'TRANSACTION') {
        data.action = 'TRANSACTION_VIEW';
      } else if (data.resourceType === 'PROMISE') {
        data.action = 'PROMISE_VIEW';
      } else if (data.resourceType === 'USER') {
        data.action = 'USER_VIEW';
      } else {
        data.action = 'SYSTEM_VIEW';
      }
    }
    
    const activity = new this(data);
    return await activity.save();
  } catch (error) {
    console.error('Failed to log activity:', error.message);
    // Don't throw - just log the error
    return null;
  }
};

// Static method to get user activities
ActivitySchema.statics.getUserActivities = async function(userId, options = {}) {
  const { limit = 50, page = 1, action, resourceType, startDate, endDate } = options;
  const skip = (page - 1) * limit;
  
  const query = { userId };
  
  if (action) query.action = action;
  if (resourceType) query.resourceType = resourceType;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const [activities, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  return {
    activities,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  };
};

// Static method to get system activities
ActivitySchema.statics.getSystemActivities = async function(options = {}) {
  const { 
    limit = 100, 
    page = 1, 
    userId, 
    action, 
    resourceType, 
    role,
    startDate, 
    endDate 
  } = options;
  
  const skip = (page - 1) * limit;
  
  const query = {};
  
  if (userId) query.userId = userId;
  if (action) query.action = action;
  if (resourceType) query.resourceType = resourceType;
  if (role) query['userDetails.role'] = role;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const [activities, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  return {
    activities,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  };
};

// Static method to get activity statistics
ActivitySchema.statics.getStats = async function(options = {}) {
  const { startDate, endDate, userId, role } = options;
  
  const match = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  if (userId) match.userId = userId;
  if (role) match['userDetails.role'] = role;
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalActivities: { $sum: 1 },
        successfulActivities: { 
          $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } 
        },
        failedActivities: { 
          $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } 
        },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        totalActivities: 1,
        successfulActivities: 1,
        failedActivities: 1,
        successRate: {
          $cond: [
            { $eq: ['$totalActivities', 0] },
            0,
            { $multiply: [{ $divide: ['$successfulActivities', '$totalActivities'] }, 100] }
          ]
        },
        uniqueUserCount: { $size: '$uniqueUsers' }
      }
    }
  ]);
  
  const actionStats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  
  const roleStats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userDetails.role',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  return {
    overall: stats[0] || {
      totalActivities: 0,
      successfulActivities: 0,
      failedActivities: 0,
      successRate: 0,
      uniqueUserCount: 0
    },
    topActions: actionStats,
    roleDistribution: roleStats
  };
};

module.exports = mongoose.model('Activity', ActivitySchema);