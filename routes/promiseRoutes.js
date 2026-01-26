// backend/routes/promiseRoutes.js

const express = require('express');
const router = express.Router();
const PromiseController = require('../controllers/promiseController');
const PromiseModel = require('../models/Promise'); // Import Promise model
const Customer = require('../models/Customer'); // Import Customer model

console.log('🔧 Loading promise routes...');

try {
  // Try to load the auth middleware
  const authMiddleware = require('../middleware/auth');
  console.log('✅ Auth middleware loaded:', Object.keys(authMiddleware));
  
  // Check what's exported
  let protectMiddleware;
  if (authMiddleware.protect) {
    protectMiddleware = authMiddleware.protect;
    console.log('✅ Using protect middleware');
  } else if (authMiddleware.authenticateToken) {
    protectMiddleware = authMiddleware.authenticateToken;
    console.log('✅ Using authenticateToken middleware');
  } else {
    // Fallback
    console.log('⚠️ No auth middleware found, using development fallback');
    protectMiddleware = (req, res, next) => {
      req.user = { 
        _id: 'dev-user', 
        id: 'dev-user',
        username: 'developer',
        name: 'Development User'
      };
      next();
    };
  }
  
  // Apply authentication middleware to all routes
  router.use(protectMiddleware);
  
} catch (error) {
  console.error('❌ Error loading auth middleware:', error.message);
  console.log('⚠️ Using development fallback middleware');
  
  // Development fallback
  router.use((req, res, next) => {
    req.user = { 
      _id: 'dev-user', 
      id: 'dev-user',
      username: 'developer',
      name: 'Development User'
    };
    next();
  });
}

// Custom getPromises route with search functionality
router.get('/', async (req, res) => {
  try {
    const {
      status,
      promiseType,
      startDate,
      endDate,
      customerName, // This is the search parameter
      page = 1,
      limit = 20,
      sortBy = 'promiseDate',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};

    // Status filter
    if (status && status !== '') {
      filter.status = status;
    }

    // Promise type filter
    if (promiseType && promiseType !== '') {
      filter.promiseType = promiseType;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.promiseDate = {};
      if (startDate) {
        filter.promiseDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.promiseDate.$lte = new Date(endDate);
      }
    }

    // Customer name search - NEW: Handle customer name search
    if (customerName && customerName.trim() !== '') {
      try {
        // First, find customers whose names match the search term
        const customers = await Customer.find({
          name: { $regex: customerName, $options: 'i' }
        }).select('_id');

        // Get array of customer IDs
        const customerIds = customers.map(customer => customer._id);
        
        // Filter promises by customer IDs
        if (customerIds.length > 0) {
          filter.customerId = { $in: customerIds };
        } else {
          // If no customers found, return empty results
          filter.customerId = { $in: [] };
        }
      } catch (error) {
        console.error('Error searching customers:', error);
        return res.status(500).json({
          success: false,
          message: 'Error searching customers'
        });
      }
    }

    // Calculate skip for pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Fetch promises with population
    const promises = await PromiseModel.find(filter)
      .populate('customerId', 'name customerId phoneNumber')
      .populate('createdBy', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Count total documents for pagination
    const total = await PromiseModel.countDocuments(filter);

    // Calculate statistics
    const statistics = {
      total: await PromiseModel.countDocuments(),
      pending: await PromiseModel.countDocuments({ status: 'PENDING' }),
      fulfilled: await PromiseModel.countDocuments({ status: 'FULFILLED' }),
      broken: await PromiseModel.countDocuments({ status: 'BROKEN' }),
      rescheduled: await PromiseModel.countDocuments({ status: 'RESCHEDULED' }),
      cancelled: await PromiseModel.countDocuments({ status: 'CANCELLED' }),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    };

    // Calculate fulfillment rate
    statistics.fulfillmentRate = statistics.total > 0 
      ? Math.round((statistics.fulfilled / statistics.total) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        promises,
        statistics
      }
    });

  } catch (error) {
    console.error('Error fetching promises:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Promise routes - REMOVE the duplicate router.get('/', PromiseController.getPromises)
router.post('/', PromiseController.createPromise);
// REMOVE: router.get('/', PromiseController.getPromises); // This is duplicate
router.get('/export', PromiseController.exportPromises);
router.get('/follow-up', PromiseController.getFollowUpPromises);
router.get('/customer/:customerId', PromiseController.getCustomerPromises);
router.patch('/:promiseId/status', PromiseController.updatePromiseStatus);

// Test route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Promise routes are working!',
    user: req.user ? req.user.username : 'No user',
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Promise routes loaded successfully with', router.stack.length, 'routes');

module.exports = router;