const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    index: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  // UPDATED: Changed 'agent' to 'officer' and added descriptions
  role: {
    type: String,
    enum: {
      values: ['admin', 'supervisor', 'officer'],
      message: '{VALUE} is not a valid role'
    },
    default: 'officer'
  },
  department: {
    type: String,
    default: 'Collections'
  },
  // Permissions based on role
  permissions: {
    canManageUsers: { type: Boolean, default: false },
    canApproveTransactions: { type: Boolean, default: false },
    canViewAllPerformance: { type: Boolean, default: false },
    canExportData: { type: Boolean, default: false },
    canManageSettings: { type: Boolean, default: false },
    transactionLimit: { 
      type: Number, 
      default: 50000, // KES 50,000 default limit
      min: 0 
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastLogin: {
    type: Date
  },
  assignedCustomers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  }],
  teamMembers: [{  // For supervisors to track their team
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Enhanced Performance Metrics
  performanceMetrics: {
    dailyTarget: { 
      type: Number, 
      default: 50000,
      min: 0
    },
    monthlyTarget: { 
      type: Number, 
      default: 1000000,
      min: 0
    },
    totalCollections: { 
      type: Number, 
      default: 0,
      min: 0
    },
    totalTransactions: {
      type: Number,
      default: 0,
      min: 0
    },
    successfulTransactions: {
      type: Number,
      default: 0,
      min: 0
    },
    failedTransactions: {
      type: Number,
      default: 0,
      min: 0
    },
    averageTransactionAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    efficiencyRating: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 10
    },
    lastActive: Date,
    loginCount: {
      type: Number,
      default: 0
    },
    // Officer-specific metrics
    promisesCreated: { type: Number, default: 0 },
    promisesFulfilled: { type: Number, default: 0 },
    followUpsCompleted: { type: Number, default: 0 },
    customerComments: { type: Number, default: 0 }
  },
  // Streak tracking
  currentStreak: { 
    type: Number, 
    default: 0 
  },
  longestStreak: { 
    type: Number, 
    default: 0 
  },
  // Achievements
  achievements: [{
    title: String,
    description: String,
    earnedAt: Date,
    icon: String,
    type: {
      type: String,
      enum: ['collection', 'efficiency', 'consistency', 'speed', 'teamwork']
    }
  }],
  // Daily activity tracking
  dailyActivity: [{
    date: {
      type: Date,
      default: Date.now
    },
    transactions: {
      type: Number,
      default: 0
    },
    amountCollected: {
      type: Number,
      default: 0
    },
    promisesCreated: {
      type: Number,
      default: 0
    },
    promisesFulfilled: {
      type: Number,
      default: 0
    },
    commentsAdded: {
      type: Number,
      default: 0
    },
    loginTime: Date,
    logoutTime: Date,
    activeDuration: Number // in minutes
  }],
  // Performance history
  performanceHistory: [{
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    startDate: Date,
    endDate: Date,
    totalCollections: Number,
    totalTransactions: Number,
    successRate: Number,
    averageAmount: Number,
    rank: Number
  }],
  settings: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      dailyReports: { type: Boolean, default: true },
      performanceAlerts: { type: Boolean, default: true },
      teamUpdates: { type: Boolean, default: false }
    },
    dashboardView: {
      type: String,
      enum: ['compact', 'detailed', 'analytical'],
      default: 'detailed'
    }
  },
  createdBy: {
   type: mongoose.Schema.Types.Mixed,
  default: 'system'
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username;
});

// Virtual for current performance score
UserSchema.virtual('performanceScore').get(function() {
  const metrics = this.performanceMetrics;
  if (!metrics || metrics.totalTransactions === 0) return 0;
  
  const successRate = metrics.successfulTransactions / metrics.totalTransactions;
  const targetAchievement = metrics.totalCollections / (metrics.monthlyTarget || 1);
  const efficiency = metrics.efficiencyRating / 10;
  
  return ((successRate * 0.4) + (targetAchievement * 0.3) + (efficiency * 0.3)) * 100;
});

// Virtual for role description
UserSchema.virtual('roleDescription').get(function() {
  const roleDescriptions = {
    'admin': 'Full system administrator with all privileges',
    'supervisor': 'Team leader with transaction approval authority',
    'officer': 'Collections officer with standard privileges'
  };
  return roleDescriptions[this.role] || 'Unknown role';
});

// Virtual for permissions summary
UserSchema.virtual('permissionsSummary').get(function() {
  if (!this.permissions) return [];
  
  const summaries = [];
  if (this.permissions.canManageUsers) summaries.push('Manage Users');
  if (this.permissions.canApproveTransactions) summaries.push('Approve Transactions');
  if (this.permissions.canViewAllPerformance) summaries.push('View All Performance');
  if (this.permissions.canExportData) summaries.push('Export Data');
  if (this.permissions.canManageSettings) summaries.push('Manage Settings');
  
  return summaries;
});

// Pre-save middleware to set permissions based on role
UserSchema.pre('save', function(next) {
  try {
    // Only calculate efficiency if performance metrics exist
    if (this.performanceMetrics) {
      const metrics = this.performanceMetrics;
      
      // Add defensive checks for all properties
      const successful = metrics.successfulTransactions || 0;
      const total = metrics.totalTransactions || 0;
      const collections = metrics.totalCollections || 0;
      const monthlyTarget = metrics.monthlyTarget || 1;
      const avgAmount = metrics.averageTransactionAmount || 0;
      
      if (total > 0) {
        // Calculate efficiency rating (0-10 scale)
        const successRate = successful / total;
        const targetProgress = Math.min(collections / monthlyTarget, 1);
        const averageScore = Math.min(avgAmount / 10000, 1); // Normalize to 10,000 KES
        
        // Weighted calculation
        const calculatedRating = (
          (successRate * 0.5) + 
          (targetProgress * 0.3) + 
          (averageScore * 0.2)
        ) * 10;
        
        // Ensure it stays within 0-10 range
        metrics.efficiencyRating = Math.max(0, Math.min(calculatedRating, 10));
        
        // Update average transaction amount if needed
        if (total > 0 && collections > 0) {
          metrics.averageTransactionAmount = collections / total;
        }
      } else {
        // Reset if no transactions
        metrics.efficiencyRating = 0;
      }
    }
    
    // Set permissions based on role
    if (this.isModified('role') || !this.permissions) {
      switch (this.role) {
        case 'admin':
          this.permissions = {
            canManageUsers: true,
            canApproveTransactions: true,
            canViewAllPerformance: true,
            canExportData: true,
            canManageSettings: true,
            transactionLimit: 0
          };
          break;
          
        case 'supervisor':
          this.permissions = {
            canManageUsers: false,
            canApproveTransactions: true,
            canViewAllPerformance: true,
            canExportData: true,
            canManageSettings: false,
            transactionLimit: 0
          };
          break;
          
        case 'officer':
        case 'agent': // Support old 'agent' role temporarily
          this.permissions = {
            canManageUsers: false,
            canApproveTransactions: false,
            canViewAllPerformance: true,
            canExportData: false,
            canManageSettings: false,
            transactionLimit: 50000
          };
          break;
      }
    }
    
    // Call next() to continue the save operation
    if (typeof next === 'function') {
      next();
    }
  } catch (error) {
    console.error('Error in User pre-save middleware:', error);
    if (typeof next === 'function') {
      next(error);
    } else {
      throw error;
    }
  }
});

// Static method to get users by role
UserSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

// Static method to get team members for a supervisor
UserSchema.statics.getTeamMembers = function(supervisorId) {
  return this.find({ 
    role: 'officer',
    isActive: true 
  }).sort({ 'performanceMetrics.totalCollections': -1 });
};

// Indexes for performance queries
UserSchema.index({ 'performanceMetrics.totalCollections': -1 });
UserSchema.index({ 'performanceMetrics.efficiencyRating': -1 });
UserSchema.index({ role: 1, 'performanceMetrics.totalCollections': -1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ 'permissions.canApproveTransactions': 1 });

module.exports = mongoose.model('User', UserSchema);