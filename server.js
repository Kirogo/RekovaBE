// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');

// Import middleware
const { frontendDebug, apiResponseFormatter } = require('./middleware/frontendDebug');

// Create a simple request logger middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
};

// Import routes
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const commentRoutes = require('./routes/commentRoutes');
const reportsRoutes = require('./routes/reports');
const paymentRoutes = require('./routes/paymentRoutes');
const promiseRoutes = require('./routes/promiseRoutes');
const testRoute = require('./routes/testRoutes');
const transactionRoutes = require('./routes/transactions');
const supervisorRoutes = require('./routes/supervisorRoutes');
const activityRoutes = require('./routes/activityRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

// Safe middleware application with error handling
try {
  app.use(frontendDebug);
} catch (e) {
  console.log('⚠️ frontendDebug middleware not available, using default');
  app.use((req, res, next) => next());
}

try {
  app.use(apiResponseFormatter);
} catch (e) {
  console.log('⚠️ apiResponseFormatter middleware not available, using default');
  app.use((req, res, next) => next());
}

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required'
      });
    }
    
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
    
  } catch (error) {
    console.error('Auth error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// ==================== ROUTE SETUP ====================
// Public routes
app.use('/api/auth', authRoutes);

// WhatsApp webhook verification endpoint (public)
app.get('/api/payments/whatsapp-response', (req, res) => {
  console.log('🔍 Twilio webhook verification request received');
  console.log('Query params:', req.query);
  res.status(200).send('Webhook verified');
});

// Protected routes
app.use('/api/customers', authenticateToken, customerRoutes);
app.use('/api/comments', authenticateToken, commentRoutes);
app.use('/api/payments', authenticateToken, paymentRoutes);
app.use('/api/promises', authenticateToken, promiseRoutes);
app.use('/api/test', authenticateToken, testRoute);
app.use('/api/reports', authenticateToken, reportsRoutes);
app.use('/api/supervisor', authenticateToken, supervisorRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/activities', authenticateToken, activityRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);

// ==================== HEALTH CHECK ENDPOINT ====================
app.get('/api/health', (req, res) => {
  const health = {
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.json(health);
});

// ==================== TEST ENDPOINTS ====================
app.get('/api/test/transactions', authenticateToken, (req, res) => {
  const testTransactions = [
    {
      _id: 'test_1',
      transactionId: 'TXN123456',
      amount: 5000,
      status: 'SUCCESS',
      createdAt: new Date().toISOString(),
      customerId: {
        _id: 'cust_1',
        name: 'John Doe',
        phoneNumber: '254712345678'
      },
      customerName: 'John Doe',
      phoneNumber: '254712345678'
    },
    {
      _id: 'test_2',
      transactionId: 'TXN789012',
      amount: 3000,
      status: 'PENDING',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      customerId: {
        _id: 'cust_2',
        name: 'Jane Smith',
        phoneNumber: '254723456789'
      },
      customerName: 'Jane Smith',
      phoneNumber: '254723456789'
    }
  ];
  
  res.json({
    success: true,
    message: 'Test transactions',
    data: testTransactions,
    count: testTransactions.length
  });
});

app.get('/api/test/stats', authenticateToken, (req, res) => {
  const testStats = {
    totalCustomers: 150,
    totalLoanPortfolio: 4500000,
    totalArrears: 750000,
    totalAmountCollected: 1250000,
    total_customers: 150,
    total_loan_portfolio: 4500000,
    total_arrears: 750000,
    total_collections: 1250000,
    activeCustomers: 142,
    delinquentCustomers: 18,
    warningCustomers: 35,
    currentCustomers: 97,
    recentTransactionsCount: 48,
    collectionEfficiency: 27.8,
    averageLoanBalance: 31690,
    averageArrears: 5282
  };
  
  res.json({
    success: true,
    message: 'Test dashboard stats',
    data: {
      stats: testStats,
      updatedAt: new Date().toISOString()
    }
  });
});

app.get('/api/activities/status', authenticateToken, async (req, res) => {
  try {
    const Activity = require('./models/Activity');
    
    const totalActivities = await Activity.countDocuments();
    const recentActivities = await Activity.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    const userActivities = await Activity.countDocuments({ userId: req.user.id });
    
    res.json({
      success: true,
      data: {
        status: 'active',
        totals: {
          allTime: totalActivities,
          last24Hours: recentActivities,
          userTotal: userActivities
        },
        userInfo: {
          userId: req.user.id,
          username: req.user.username,
          role: req.user.role
        }
      }
    });
  } catch (error) {
    console.error('Activity status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity status'
    });
  }
});

// ==================== ERROR HANDLERS ====================
app.use('*', (req, res) => {
  console.log(`❌ Route not found: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestedUrl: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err);
  
  if (process.env.NODE_ENV === 'development') {
    console.error('Error stack:', err.stack);
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    timestamp: new Date().toISOString()
  });
});

// ==================== DATABASE CONNECTION ====================
let isDBConnected = false;

const connectDB = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    isDBConnected = true;
    
    // Initialize cron jobs after DB connection
    console.log('⏰ Initializing cron jobs...');
    try {
      const paymentController = require('./controllers/paymentController');
      paymentController.initializeCronJobs();
    } catch (error) {
      console.log('⚠️ Could not initialize cron jobs:', error.message);
    }
    
    // Skip WhatsApp initialization to avoid crashes
    console.log('⚠️ WhatsAppService initialization skipped to prevent crashes');
    
    // Initialize activity logging cleanup
    initializeActivityCleanup();
    
    return true;
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️ Will retry connection in background...');
    isDBConnected = false;
    
    // Retry connection after 5 seconds
    setTimeout(connectDB, 5000);
    return false;
  }
};

// ==================== ACTIVITY CLEANUP ====================
const initializeActivityCleanup = () => {
  try {
    const Activity = require('./models/Activity');
    
    cron.schedule('0 2 * * *', async () => {
      try {
        console.log('🧹 Running activity log cleanup job...');
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const result = await Activity.deleteMany({
          createdAt: { $lt: ninetyDaysAgo }
        });
        
        console.log(`✅ Cleaned up ${result.deletedCount} activity records older than 90 days`);
      } catch (error) {
        console.error('❌ Activity cleanup job error:', error);
      }
    });
    
    console.log('✅ Activity cleanup scheduled to run daily at 2 AM');
  } catch (error) {
    console.warn('⚠️ Could not initialize activity cleanup:', error.message);
  }
};

// ==================== START SERVER ====================
const startServer = async () => {
  console.log('🚀 Starting server...');
  
  // Try to connect to DB, but don't crash if it fails
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.log('⚠️ Starting server without database connection...');
  }
  
  const PORT = process.env.PORT || 5000;
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔑 Login endpoint: POST http://localhost:${PORT}/api/auth/login`);
    console.log(`📱 Frontend URLs:`);
    console.log(`   - http://localhost:5173`);
    console.log(`   - http://localhost:3000`);
  });
};

// ==================== PROCESS HANDLERS ====================
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.log('⚠️ Server will continue running despite uncaught exception');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  mongoose.connection.close(false, () => {
    console.log('MongoDB connection closed.');
    process.exit(0);
  });
});

// ==================== START APPLICATION ====================
startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});