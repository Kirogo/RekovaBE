//middleware/activityMiddleware.js
const ActivityLogger = require('../services/activityLogger');

/**
 * Middleware to automatically log activities based on route and method
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
      logActivity(req, res, body, startTime, user);
      return originalSend.call(this, body);
    };
    
    res.json = function(body) {
      logActivity(req, res, body, startTime, user);
      return originalJson.call(this, body);
    };
    
    next();
  };
};

/**
 * Helper function to log activity based on route and response
 */
async function logActivity(req, res, responseBody, startTime, user) {
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
    
    // Map routes to actions - ADD MORE ROUTES AS NEEDED
    if (originalUrl.includes('/api/auth/login') && method === 'POST') {
      // Login is already logged in authController, skip to avoid duplicates
      return;
    }
    
    else if (originalUrl.includes('/api/transactions') && method === 'POST' && responseData.success) {
      // Transaction creation
      await ActivityLogger.log({
        userId: user.id,
        action: 'TRANSACTION_SUCCESS',
        description: `${user.username} processed payment transaction`,
        resourceType: 'TRANSACTION',
        resourceId: responseData.data?._id,
        amount: req.body.amount || responseData.data?.amount,
        duration,
        tags: ['transaction', 'payment']
      });
    }
    
    else if (originalUrl.includes('/api/customers/') && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      // Customer creation or update
      const action = method === 'POST' ? 'CUSTOMER_CREATE' : 'CUSTOMER_UPDATE';
      await ActivityLogger.log({
        userId: user.id,
        action,
        description: `${user.username} ${method === 'POST' ? 'created' : 'updated'} customer`,
        resourceType: 'CUSTOMER',
        resourceId: responseData.data?._id || req.params.id,
        duration,
        tags: ['customer', method === 'POST' ? 'create' : 'update']
      });
    }
    
    else if (originalUrl.includes('/api/promises') && method === 'POST' && responseData.success) {
      // Promise creation
      await ActivityLogger.log({
        userId: user.id,
        action: 'PROMISE_CREATE',
        description: `${user.username} recorded payment promise`,
        resourceType: 'PROMISE',
        resourceId: responseData.data?._id,
        amount: req.body.promiseAmount || req.body.amount,
        duration,
        tags: ['promise', 'collection']
      });
    }
    
    else if (originalUrl.includes('/api/comments') && method === 'POST' && responseData.success) {
      // Comment/note added (treated as a call/contact)
      await ActivityLogger.log({
        userId: user.id,
        action: 'PROMISE_FOLLOWUP',
        description: `${user.username} added comment/note`,
        resourceType: 'CUSTOMER',
        resourceId: req.body.customerId,
        duration,
        tags: ['call', 'comment', 'followup']
      });
    }
    
    else if (originalUrl.includes('/api/supervisor/assignments/bulk') && method === 'POST' && responseData.success) {
      // Bulk assignment
      await ActivityLogger.log({
        userId: user.id,
        action: 'BULK_ASSIGNMENT',
        description: `${user.username} performed bulk assignment`,
        resourceType: 'SYSTEM',
        duration,
        tags: ['assignment', 'bulk', 'supervisor']
      });
    }
    
    // Log general successful POST, PUT, DELETE actions
    else if (['POST', 'PUT', 'DELETE'].includes(method) && statusCode >= 200 && statusCode < 300) {
      await ActivityLogger.log({
        userId: user.id,
        action: 'SYSTEM_VIEW',
        description: `${user.username} performed ${method} action on ${originalUrl}`,
        duration,
        tags: ['system', method.toLowerCase()]
      });
    }
  } catch (error) {
    console.error('Activity logging middleware error:', error);
    // Don't throw error to avoid breaking the response
  }
}

module.exports = activityMiddleware;