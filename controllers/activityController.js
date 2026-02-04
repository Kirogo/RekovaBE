const Activity = require('../models/Activity');
const ActivityLogger = require('../services/activityLogger');

class ActivityController {
  /**
   * @desc    Get user's own activities
   * @route   GET /api/activities/my-activities
   * @access  Private (All users)
   */
   static async getMyActivities(req, res) {
    const startTime = Date.now();
    
    try {
      const userId = req.user.id;
      const {
        page = 1,
        limit = 50,
        action,
        resourceType,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = { userId };

      if (action) query.action = action;
      if (resourceType) query.resourceType = resourceType;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Sorting
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Execute query
      const [activities, total] = await Promise.all([
        Activity.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Activity.countDocuments(query)
      ]);

      // Log this activity - Use SYSTEM_VIEW instead of VIEW
      await ActivityLogger.logSafe(
        userId,
        `Viewed personal activity log (${activities.length} records)`,
        {
          resourceType: 'SYSTEM',
          requestDetails: {
            page: pageNum,
            limit: limitNum,
            filters: { action, resourceType, startDate, endDate }
          },
          tags: ['activity', 'log', 'view'],
          duration: Date.now() - startTime
        }
      );

      res.json({
        success: true,
        data: {
          activities,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Get my activities error:', error);
      
      // Log error safely
      await ActivityLogger.logError(
        req.user.id,
        'SYSTEM_ERROR',
        'Failed to fetch personal activities',
        error,
        { endpoint: req.originalUrl }
      );
      
      res.status(500).json({
        success: false,
        message: 'Server error fetching activities'
      });
    }
  }

  /**
   * @desc    Get system activities (Admin/Supervisor only)
   * @route   GET /api/activities/system
   * @access  Private (Admin, Supervisor)
   */
  static async getSystemActivities(req, res) {
    const startTime = Date.now();
    
    try {
      const userRole = req.user.role;
      
      // Check permissions
      if (!['admin', 'supervisor'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin or Supervisor role required.'
        });
      }

      const {
        page = 1,
        limit = 100,
        userId,
        action,
        resourceType,
        role,
        startDate,
        endDate,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
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

      // Sorting
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Execute query
      const [activities, total] = await Promise.all([
        Activity.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Activity.countDocuments(query)
      ]);

      // Log this activity - Use SYSTEM_VIEW
      await ActivityLogger.logSafe(
        req.user.id,
        `${userRole} viewed system activity log (${activities.length} records)`,
        {
          resourceType: 'SYSTEM',
          requestDetails: {
            page: pageNum,
            limit: limitNum,
            filters: { userId, action, resourceType, role, startDate, endDate }
          },
          tags: ['activity', 'log', 'system', 'admin'],
          duration: Date.now() - startTime
        }
      );

      res.json({
        success: true,
        data: {
          activities,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Get system activities error:', error);
      
      await ActivityLogger.logError(
        req.user.id,
        'SYSTEM_ERROR',
        'Failed to fetch system activities',
        error,
        { endpoint: req.originalUrl }
      );
      
      res.status(500).json({
        success: false,
        message: 'Server error fetching system activities'
      });
    }
  }

  /**
   * @desc    Get activity statistics
   * @route   GET /api/activities/stats
   * @access  Private (Admin, Supervisor)
   */
  static async getActivityStats(req, res) {
    try {
      const userRole = req.user.role;
      
      // Check permissions
      if (!['admin', 'supervisor'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin or Supervisor role required.'
        });
      }

      const {
        startDate,
        endDate,
        userId,
        role,
        groupBy = 'day' // day, week, month, hour
      } = req.query;

      // Get overall statistics
      const stats = await Activity.getStats({ startDate, endDate, userId, role });

      // Get time-based statistics
      const timeStats = await Activity.aggregate([
        {
          $match: {
            ...(startDate || endDate ? {
              createdAt: {
                ...(startDate ? { $gte: new Date(startDate) } : {}),
                ...(endDate ? { $lte: new Date(endDate) } : {})
              }
            } : {}),
            ...(userId ? { userId } : {}),
            ...(role ? { 'userDetails.role': role } : {})
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: groupBy === 'hour' ? '%Y-%m-%d %H:00' : 
                        groupBy === 'week' ? '%Y-%U' : 
                        groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            count: { $sum: 1 },
            successCount: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } },
            avgDuration: { $avg: '$duration' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        {
          $project: {
            date: '$_id',
            count: 1,
            successCount: 1,
            successRate: {
              $cond: [
                { $eq: ['$count', 0] },
                0,
                { $multiply: [{ $divide: ['$successCount', '$count'] }, 100] }
              ]
            },
            avgDuration: 1,
            uniqueUserCount: { $size: '$uniqueUsers' }
          }
        },
        { $sort: { date: 1 } }
      ]);

      // Get most active users
      const activeUsers = await Activity.aggregate([
        {
          $match: {
            ...(startDate || endDate ? {
              createdAt: {
                ...(startDate ? { $gte: new Date(startDate) } : {}),
                ...(endDate ? { $lte: new Date(endDate) } : {})
              }
            } : {})
          }
        },
        {
          $group: {
            _id: '$userId',
            userDetails: { $first: '$userDetails' },
            activityCount: { $sum: 1 },
            lastActivity: { $max: '$createdAt' },
            successCount: { $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] } }
          }
        },
        {
          $project: {
            userId: '$_id',
            username: '$userDetails.username',
            fullName: '$userDetails.fullName',
            role: '$userDetails.role',
            activityCount: 1,
            lastActivity: 1,
            successRate: {
              $cond: [
                { $eq: ['$activityCount', 0] },
                0,
                { $multiply: [{ $divide: ['$successCount', '$activityCount'] }, 100] }
              ]
            }
          }
        },
        { $sort: { activityCount: -1 } },
        { $limit: 10 }
      ]);

      // Log this activity
      await ActivityLogger.log({
        userId: req.user.id,
        action: 'REPORT_GENERATE',
        description: `${userRole} generated activity statistics report`,
        resourceType: 'REPORT',
        requestDetails: {
          startDate,
          endDate,
          userId,
          role,
          groupBy
        },
        tags: ['statistics', 'report', 'analytics']
      });

      res.json({
        success: true,
        data: {
          overview: stats.overall,
          timeSeries: timeStats,
          activeUsers,
          topActions: stats.topActions,
          roleDistribution: stats.roleDistribution
        }
      });
    } catch (error) {
      console.error('Get activity stats error:', error);
      
      await ActivityLogger.logError(
        req.user.id,
        'SYSTEM_ERROR',
        'Failed to generate activity statistics',
        error,
        { endpoint: req.originalUrl }
      );
      
      res.status(500).json({
        success: false,
        message: 'Server error generating statistics'
      });
    }
  }

  /**
   * @desc    Search activities
   * @route   GET /api/activities/search
   * @access  Private (Admin, Supervisor)
   */
  static async searchActivities(req, res) {
    try {
      const userRole = req.user.role;
      
      // Check permissions
      if (!['admin', 'supervisor'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin or Supervisor role required.'
        });
      }

      const {
        q = '',
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build search query
      const query = {};

      if (q.trim()) {
        query.$or = [
          { description: { $regex: q, $options: 'i' } },
          { 'userDetails.username': { $regex: q, $options: 'i' } },
          { 'userDetails.fullName': { $regex: q, $options: 'i' } },
          { 'resourceDetails.name': { $regex: q, $options: 'i' } },
          { 'resourceDetails.customerId': { $regex: q, $options: 'i' } },
          { 'resourceDetails.transactionId': { $regex: q, $options: 'i' } }
        ];
      }

      // Sorting
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Execute query
      const [activities, total] = await Promise.all([
        Activity.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Activity.countDocuments(query)
      ]);

      // Log this activity
      await ActivityLogger.log({
        userId: req.user.id,
        action: 'SYSTEM_SEARCH',
        description: `Searched activities with query: "${q}" (${activities.length} results)`,
        resourceType: 'SYSTEM',
        requestDetails: {
          query: q,
          page: pageNum,
          limit: limitNum
        },
        tags: ['search', 'activity', 'log']
      });

      res.json({
        success: true,
        data: {
          activities,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum)
          },
          searchQuery: q
        }
      });
    } catch (error) {
      console.error('Search activities error:', error);
      
      await ActivityLogger.logError(
        req.user.id,
        'SYSTEM_ERROR',
        'Failed to search activities',
        error,
        { endpoint: req.originalUrl, query: req.query.q }
      );
      
      res.status(500).json({
        success: false,
        message: 'Server error searching activities'
      });
    }
  }

  /**
   * @desc    Export activities to CSV
   * @route   GET /api/activities/export
   * @access  Private (Admin, Supervisor)
   */
  static async exportActivities(req, res) {
    try {
      const userRole = req.user.role;
      
      // Check permissions
      if (!['admin', 'supervisor'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin or Supervisor role required.'
        });
      }

      const {
        startDate,
        endDate,
        userId,
        action,
        resourceType,
        role
      } = req.query;

      // Build query
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

      // Get activities
      const activities = await Activity.find(query)
        .sort({ createdAt: -1 })
        .limit(5000) // Limit exports to 5000 records
        .lean();

      // Create CSV
      const csvHeader = [
        'Timestamp',
        'User ID',
        'Username',
        'Full Name',
        'Role',
        'Action',
        'Description',
        'Resource Type',
        'Resource ID',
        'Status',
        'Duration (ms)',
        'IP Address',
        'Tags'
      ].join(',');

      const csvRows = activities.map(activity => {
        const row = [
          activity.createdAt.toISOString(),
          activity.userId,
          activity.userDetails?.username || '',
          activity.userDetails?.fullName || '',
          activity.userDetails?.role || '',
          activity.action,
          escapeCSV(activity.description),
          activity.resourceType || '',
          activity.resourceId || '',
          activity.status,
          activity.duration || 0,
          activity.ipAddress || '',
          activity.tags?.join(';') || ''
        ];
        
        return row.join(',');
      });

      const csvContent = csvHeader + '\n' + csvRows.join('\n');

      // Log export activity
      await ActivityLogger.log({
        userId: req.user.id,
        action: 'DATA_EXPORT',
        description: `Exported ${activities.length} activity records to CSV`,
        resourceType: 'REPORT',
        requestDetails: {
          startDate,
          endDate,
          userId,
          action,
          resourceType,
          role,
          recordCount: activities.length
        },
        tags: ['export', 'csv', 'activity']
      });

      // Set response headers
      const filename = `activities_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);

    } catch (error) {
      console.error('Export activities error:', error);
      
      await ActivityLogger.logError(
        req.user.id,
        'SYSTEM_ERROR',
        'Failed to export activities',
        error,
        { endpoint: req.originalUrl }
      );
      
      res.status(500).json({
        success: false,
        message: 'Server error exporting activities'
      });
    }
  }

  /**
   * @desc    Clear old activities (Admin only)
   * @route   DELETE /api/activities/cleanup
   * @access  Private (Admin only)
   */
  static async cleanupActivities(req, res) {
    try {
      // Only admin can cleanup
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin role required.'
        });
      }

      const { days = 90 } = req.query;
      
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

      // Find and count activities to delete
      const activitiesToDelete = await Activity.find({
        createdAt: { $lt: cutoffDate }
      });

      const count = activitiesToDelete.length;

      if (count === 0) {
        return res.json({
          success: true,
          message: 'No old activities to clean up'
        });
      }

      // Delete old activities
      const result = await Activity.deleteMany({
        createdAt: { $lt: cutoffDate }
      });

      // Log cleanup activity
      await ActivityLogger.log({
        userId: req.user.id,
        action: 'SYSTEM_CLEANUP',
        description: `Cleaned up ${result.deletedCount} activity records older than ${days} days`,
        resourceType: 'SYSTEM',
        requestDetails: {
          cutoffDate: cutoffDate.toISOString(),
          days,
          deletedCount: result.deletedCount
        },
        tags: ['cleanup', 'maintenance', 'system']
      });

      res.json({
        success: true,
        message: `Successfully cleaned up ${result.deletedCount} activity records older than ${days} days`,
        data: {
          deletedCount: result.deletedCount,
          cutoffDate: cutoffDate.toISOString()
        }
      });

    } catch (error) {
      console.error('Cleanup activities error:', error);
      
      await ActivityLogger.logError(
        req.user.id,
        'SYSTEM_ERROR',
        'Failed to cleanup old activities',
        error,
        { endpoint: req.originalUrl, days: req.query.days }
      );
      
      res.status(500).json({
        success: false,
        message: 'Server error cleaning up activities'
      });
    }
  }
}

// Helper function to escape CSV values
function escapeCSV(value) {
  if (!value) return '';
  const stringValue = String(value);
  
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

module.exports = ActivityController;