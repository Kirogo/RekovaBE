//middleware/activityMiddleware.js
const ActivityLogger = require('../services/activityLogger');

/**
 * Middleware to automatically log IMPORTANT activities only
 */
const activityMiddleware = (options = {}) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    const user = req.user;
    
    if (!user) {
      return next();
    }
    
    // Store original response methods
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Override response methods to log after response
    res.send = function(body) {
      logImportantActivity(req, res, body, startTime, user);
      return originalSend.call(this, body);
    };
    
    res.json = function(body) {
      logImportantActivity(req, res, body, startTime, user);
      return originalJson.call(this, body);
    };
    
    next();
  };
};

/**
 * Helper function to log ONLY IMPORTANT activities based on route and method
 */
async function logImportantActivity(req, res, responseBody, startTime, user) {
  try {
    const duration = Date.now() - startTime;
    const { method, originalUrl } = req;
    const statusCode = res.statusCode;
    
    // Skip logging for certain routes or methods
    if (method === 'GET' && originalUrl.includes('/static/')) {
      return;
    }
    
    // Parse response body to get resource info
    let responseData;
    try {
      responseData = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
    } catch (e) {
      responseData = {};
    }
    
    // Only log successful responses (2xx and 3xx)
    if (statusCode >= 400) {
      return;
    }
    
    // IMPORTANT: Only log specific important actions for supervisor monitoring
    if (originalUrl.includes('/api/auth/login') && method === 'POST') {
      // Login is already logged in authController, skip to avoid duplicates
      return;
    }
    
    else if (originalUrl.includes('/api/transactions') && method === 'POST' && responseData.success) {
      // IMPORTANT: Transaction creation (payment made)
      await ActivityLogger.log({
        userId: user.id,
        action: 'TRANSACTION_SUCCESS',
        description: `${user.username} processed payment of Ksh ${req.body.amount || responseData.data?.amount}`,
        resourceType: 'TRANSACTION',
        resourceId: responseData.data?._id,
        amount: req.body.amount || responseData.data?.amount,
        duration,
        tags: ['transaction', 'payment', 'important']
      });
    }
    
    else if (originalUrl.includes('/api/customers') && method === 'POST' && responseData.success) {
      // IMPORTANT: New customer created
      await ActivityLogger.log({
        userId: user.id,
        action: 'CUSTOMER_CREATE',
        description: `${user.username} created new customer: ${req.body.customerName || 'New Customer'}`,
        resourceType: 'CUSTOMER',
        resourceId: responseData.data?._id,
        duration,
        tags: ['customer', 'create', 'important']
      });
    }
    
    else if (originalUrl.includes('/api/promises') && method === 'POST' && responseData.success) {
      // IMPORTANT: Promise created
      const amount = req.body.promiseAmount || req.body.amount || 0;
      await ActivityLogger.log({
        userId: user.id,
        action: 'PROMISE_CREATE',
        description: `${user.username} recorded promise of Ksh ${amount}`,
        resourceType: 'PROMISE',
        resourceId: responseData.data?._id,
        amount: amount,
        duration,
        tags: ['promise', 'collection', 'important']
      });
    }
    
    else if (originalUrl.includes('/api/promises/') && method === 'PUT' && responseData.success) {
      // IMPORTANT: Promise updated (fulfilled or broken)
      if (req.body.status === 'fulfilled') {
        await ActivityLogger.log({
          userId: user.id,
          action: 'PROMISE_FULFILL',
          description: `${user.username} marked promise as fulfilled`,
          resourceType: 'PROMISE',
          resourceId: req.params.id,
          duration,
          tags: ['promise', 'fulfilled', 'important']
        });
      } else if (req.body.status === 'broken') {
        await ActivityLogger.log({
          userId: user.id,
          action: 'PROMISE_BREAK',
          description: `${user.username} marked promise as broken`,
          resourceType: 'PROMISE',
          resourceId: req.params.id,
          duration,
          tags: ['promise', 'broken', 'important', 'alert']
        });
      }
    }
    
    else if (originalUrl.includes('/api/comments') && method === 'POST' && responseData.success) {
      // IMPORTANT: Comment/note added (treated as customer contact)
      await ActivityLogger.log({
        userId: user.id,
        action: 'PROMISE_FOLLOWUP',
        description: `${user.username} added comment/note for customer`,
        resourceType: 'CUSTOMER',
        resourceId: req.body.customerId,
        duration,
        tags: ['call', 'comment', 'followup', 'important']
      });
    }
    
    else if (originalUrl.includes('/api/supervisor/assignments/bulk') && method === 'POST' && responseData.success) {
      // IMPORTANT: Bulk assignment (supervisor action)
      await ActivityLogger.log({
        userId: user.id,
        action: 'BULK_ASSIGNMENT',
        description: `${user.username} performed bulk assignment of ${responseData.data?.assignedCount || 0} customers`,
        resourceType: 'SYSTEM',
        duration,
        tags: ['assignment', 'bulk', 'supervisor', 'important']
      });
    }
    
    else if (originalUrl.includes('/api/supervisor/officers/assign-specialization') && method === 'POST' && responseData.success) {
      // IMPORTANT: Officer specialization assigned (supervisor action)
      await ActivityLogger.log({
        userId: user.id,
        action: 'USER_UPDATE',
        description: `${user.username} assigned loan type specialization to officer`,
        resourceType: 'USER',
        resourceId: req.body.officerId,
        duration,
        tags: ['specialization', 'officer', 'supervisor', 'important']
      });
    }
    
    // IMPORTANT: Skip logging VIEW actions (CUSTOMER_VIEW, USER_VIEW, etc.)
    // These are not important for supervisor monitoring
    
  } catch (error) {
    console.error('Activity logging middleware error:', error);
    // Don't throw error to avoid breaking the response
  }
}

module.exports = activityMiddleware;