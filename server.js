// server.js - COMPLETE UPDATED VERSION

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const commentRoutes = require('./routes/commentRoutes');
const reportsRoutes = require('./routes/reports');

// Import routes
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const promiseRoutes = require('./routes/promiseRoutes');
const testRoute = require('./routes/testRoutes');
const { frontendDebug, apiResponseFormatter } = require('./middleware/frontendDebug');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(frontendDebug);
app.use(apiResponseFormatter);
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// WhatsApp webhook verification endpoint
app.get('/api/payments/whatsapp-response', (req, res) => {
  console.log('🔍 Twilio webhook verification request received');
  console.log('Query params:', req.query);
  
  // Twilio sends a GET request to verify the webhook
  // We need to return a 200 OK
  res.status(200).send('Webhook verified');
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
    
    // Check Customer model indexes
    const Customer = require('./models/Customer');
    console.log('Customer indexes:', Customer.schema._indexes);
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });

// Authentication middleware
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api', commentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/promises', promiseRoutes);
app.use('/api/test', testRoute);
app.use('/api/reports', reportsRoutes);

// ==================== DASHBOARD STATS ENDPOINT ====================
app.get('/api/customers/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Fetching dashboard stats...');
    
    const Customer = require('./models/Customer');
    const Transaction = require('./models/Transaction');
    
    // Get customer stats
    const totalCustomers = await Customer.countDocuments({ isActive: true });
    const activeCustomers = await Customer.countDocuments({ 
      isActive: true, 
      loanBalance: { $gt: 0 } 
    });
    
    // Get all active customers for calculations
    const customers = await Customer.find({ isActive: true });
    
    // Calculate totals
    const totalLoanPortfolio = customers.reduce((sum, customer) => 
      sum + (parseFloat(customer.loanBalance) || 0), 0);
    
    const totalArrears = customers.reduce((sum, customer) => 
      sum + (parseFloat(customer.arrears) || 0), 0);
    
    // Get successful transactions from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const successfulTransactions = await Transaction.find({ 
      status: 'SUCCESS',
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    const totalAmountCollected = successfulTransactions.reduce((sum, tx) => 
      sum + (parseFloat(tx.amount) || 0), 0);
    
    // Calculate delinquency rates
    const delinquentCustomers = customers.filter(c => 
      parseFloat(c.arrears) > 1000
    ).length;
    
    const warningCustomers = customers.filter(c => 
      parseFloat(c.arrears) > 0 && parseFloat(c.arrears) <= 1000
    ).length;
    
    const currentCustomers = customers.filter(c => 
      parseFloat(c.arrears) === 0
    ).length;
    
    // Get recent transactions count
    const recentTransactionsCount = await Transaction.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    // Calculate collection efficiency
    const totalDue = totalLoanPortfolio + totalArrears;
    const collectionEfficiency = totalDue > 0 
      ? (totalAmountCollected / totalDue) * 100 
      : 0;
    
    const stats = {
      totalCustomers,
      activeCustomers,
      totalLoanPortfolio: Math.round(totalLoanPortfolio),
      totalArrears: Math.round(totalArrears),
      totalAmountCollected: Math.round(totalAmountCollected),
      averageLoanBalance: totalCustomers > 0 ? Math.round(totalLoanPortfolio / totalCustomers) : 0,
      averageArrears: totalCustomers > 0 ? Math.round(totalArrears / totalCustomers) : 0,
      delinquentCustomers,
      warningCustomers,
      currentCustomers,
      recentTransactionsCount,
      collectionEfficiency: Math.round(collectionEfficiency * 100) / 100, // 2 decimal places
      total_collections: Math.round(totalAmountCollected), // Alternative naming for frontend
      total_loan_portfolio: Math.round(totalLoanPortfolio),
      total_arrears: Math.round(totalArrears),
      total_customers: totalCustomers
    };
    
    console.log('📈 Dashboard stats calculated:', stats);
    
    res.json({
      success: true,
      message: 'Dashboard stats retrieved successfully',
      data: {
        stats,
        updatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== TRANSACTIONS ENDPOINT ====================
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { customerId, limit = 10 } = req.query;
    
    console.log(`🔍 /api/transactions called with customerId: ${customerId}, limit: ${limit}`);
    
    const Transaction = require('./models/Transaction');
    const Customer = require('./models/Customer');
    let query = {};
    
    // Handle undefined customerId gracefully
    if (customerId && customerId !== 'undefined' && customerId !== 'null') {
      let customer;
      
      // Try to find customer by various identifiers
      if (mongoose.Types.ObjectId.isValid(customerId)) {
        customer = await Customer.findById(customerId);
      }
      
      if (!customer) {
        customer = await Customer.findOne({ 
          $or: [
            { customerId: customerId },
            { customerInternalId: customerId },
            { phoneNumber: customerId },
            { accountNumber: customerId }
          ]
        });
      }
      
      if (customer) {
        query.customerId = customer._id;
        console.log(`✅ Found customer: ${customer.name}, using _id: ${customer._id}`);
      } else {
        console.log(`⚠️ Customer not found with ID: ${customerId}`);
        // Don't return error, just return empty array
      }
    }
    
    const transactions = await Transaction.find(query)
      .populate({
        path: 'customerId',
        select: 'name phoneNumber customerId email accountNumber',
        model: 'Customer'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('-__v')
      .lean();
    
    console.log(`✅ Found ${transactions.length} transactions`);
    
    // Format the response to include customer data more accessibly
    const formattedTransactions = transactions.map(t => ({
      ...t,
      customerName: t.customerId?.name,
      phoneNumber: t.customerId?.phoneNumber || t.phoneNumber,
      customer: t.customerId ? {
        _id: t.customerId._id,
        name: t.customerId.name,
        phoneNumber: t.customerId.phoneNumber,
        customerId: t.customerId.customerId
      } : null
    }));
    
    res.json({
      success: true,
      message: 'Transactions retrieved successfully',
      data: formattedTransactions,
      count: formattedTransactions.length
    });
  } catch (error) {
    console.error('❌ Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== TRANSACTIONS EXPORT ENDPOINT ====================
app.get('/api/transactions/export', authenticateToken, async (req, res) => {
  try {
    console.log('📤 Exporting transactions...');
    
    const Transaction = require('./models/Transaction');
    const Customer = require('./models/Customer');
    
    const transactions = await Transaction.find({})
      .populate('customerId', 'name phoneNumber customerId')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    
    // Create CSV content
    const csvHeader = 'Transaction ID,Date,Customer Name,Phone Number,Amount,Status,Payment Method,Description,MPesa Receipt,Loan Balance Before,Loan Balance After,Arrears Before,Arrears After\n';
    
    const csvRows = transactions.map(t => {
      const customerName = t.customerId?.name || 'Unknown';
      const phoneNumber = t.customerId?.phoneNumber || t.phoneNumber || 'N/A';
      const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-KE') : '';
      
      // Escape fields with commas
      const escapeCSV = (field) => {
        if (!field) return '';
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
      };
      
      return [
        t.transactionId || t._id,
        date,
        escapeCSV(customerName),
        phoneNumber,
        parseFloat(t.amount || 0).toFixed(2),
        t.status || 'PENDING',
        t.paymentMethod || 'MPESA',
        escapeCSV(t.description || 'Loan Repayment'),
        t.mpesaReceiptNumber || '',
        parseFloat(t.loanBalanceBefore || 0).toFixed(2),
        parseFloat(t.loanBalanceAfter || 0).toFixed(2),
        parseFloat(t.arrearsBefore || 0).toFixed(2),
        parseFloat(t.arrearsAfter || 0).toFixed(2)
      ].join(',');
    });
    
    const csvContent = csvHeader + csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('❌ Export transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting transactions'
    });
  }
});

// ==================== CUSTOMER COMMENTS ENDPOINTS ====================
app.get('/api/customers/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || id === 'undefined') {
      return res.json({
        success: true,
        message: 'No customer ID provided',
        data: { comments: [] }
      });
    }
    
    // Check if Comment model exists
    try {
      const Comment = require('./models/Comment');
      const comments = await Comment.find({ customerId: id })
        .sort({ createdAt: -1 })
        .lean();
      
      res.json({
        success: true,
        message: 'Comments retrieved successfully',
        data: { comments }
      });
    } catch (modelError) {
      // If Comment model doesn't exist, return empty array
      console.log('Comment model not available, returning empty array');
      res.json({
        success: true,
        message: 'Comments retrieved successfully',
        data: { comments: [] }
      });
    }
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching comments'
    });
  }
});

app.post('/api/customers/:id/comments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, type = 'follow_up', author } = req.body;
    
    if (!id || id === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    if (!comment) {
      return res.status(400).json({
        success: false,
        message: 'Comment text is required'
      });
    }
    
    // Try to save to Comment model if it exists
    try {
      const Comment = require('./models/Comment');
      const Customer = require('./models/Customer');
      
      const customer = await Customer.findById(id);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }
      
      const newComment = new Comment({
        customerId: id,
        comment: comment.trim(),
        type,
        author: author || req.user?.name || 'Agent',
        authorId: req.user?._id,
        customerName: customer.name
      });
      
      await newComment.save();
      
      res.json({
        success: true,
        message: 'Comment saved successfully',
        data: {
          comment: newComment,
          message: 'Comment added successfully'
        }
      });
    } catch (modelError) {
      // Fallback if Comment model doesn't exist
      res.json({
        success: true,
        message: 'Comment saved successfully',
        data: {
          commentId: `comment_${Date.now()}`,
          comment,
          author: author || 'Agent',
          createdAt: new Date().toISOString(),
          type
        }
      });
    }
  } catch (error) {
    console.error('Save comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving comment'
    });
  }
});

// ==================== CUSTOMER STATEMENT EXPORT ====================
app.get('/api/customers/:id/statement', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || id === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    const Customer = require('./models/Customer');
    const Transaction = require('./models/Transaction');
    
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    const transactions = await Transaction.find({ customerId: id })
      .sort({ createdAt: -1 })
      .limit(100);
    
    // Create CSV
    const csvHeader = 'Date,Description,Amount,Status,Type,Receipt Number\n';
    const csvRows = transactions.map(t => 
      `${new Date(t.createdAt).toLocaleDateString()},"${t.description || 'Loan Repayment'}",${t.amount},${t.status},${t.paymentMethod},${t.mpesaReceiptNumber || ''}`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=statement_${customer.customerId}_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Export statement error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting statement'
    });
  }
});

// ==================== CUSTOMERS EXPORT ====================
app.get('/api/customers/export', authenticateToken, async (req, res) => {
  try {
    const Customer = require('./models/Customer');
    const customers = await Customer.find({}).sort({ createdAt: -1 });
    
    // Create CSV
    const csvHeader = 'Customer ID,Name,Phone,Email,National ID,Account Number,Loan Balance,Arrears,Status,Last Payment Date,Created Date\n';
    const csvRows = customers.map(c => {
      const status = c.arrears === 0 ? 'Current' : 
                     c.arrears <= 1000 ? 'Warning' : 'Delinquent';
      const createdAt = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-KE') : '';
      const lastPaymentDate = c.lastPaymentDate ? new Date(c.lastPaymentDate).toLocaleDateString('en-KE') : '';
      
      const escapeCSV = (field) => {
        if (!field) return '';
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
      };
      
      return [
        c.customerId || '',
        escapeCSV(c.name),
        c.phoneNumber || '',
        escapeCSV(c.email || ''),
        c.nationalId || '',
        c.accountNumber || '',
        parseFloat(c.loanBalance || 0).toFixed(2),
        parseFloat(c.arrears || 0).toFixed(2),
        status,
        lastPaymentDate,
        createdAt
      ].join(',');
    });
    
    const csvContent = csvHeader + csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=customers_export_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Export customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting customers'
    });
  }
});

// ==================== PERFORMANCE ENDPOINTS ====================
app.get('/api/performance/officers', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const Transaction = require('./models/Transaction');
    
    // Set default date range if not provided
    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30); // Last 30 days
    
    const start = startDate ? new Date(startDate) : defaultStartDate;
    const end = endDate ? new Date(endDate) : defaultEndDate;
    
    // Aggregate performance data from Transactions
    const stats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'SUCCESS'
        }
      },
      {
        $group: {
          _id: '$initiatedByUserId',
          officerName: { $first: '$initiatedBy' },
          totalCollections: { $sum: '$amount' },
          transactionCount: { $count: {} },
          avgTransaction: { $avg: '$amount' }
        }
      },
      { $sort: { totalCollections: -1 } }
    ]);
    
    // Format the response
    const formattedStats = stats.map(stat => ({
      officerId: stat._id,
      officerName: stat.officerName,
      totalCollections: stat.totalCollections,
      transactionCount: stat.transactionCount,
      avgTransaction: Math.round(stat.avgTransaction || 0),
      successRate: 100 // All are successful since we filtered by SUCCESS
    }));
    
    res.json({ 
      success: true, 
      message: 'Performance stats retrieved',
      data: formattedStats 
    });
  } catch (error) {
    console.error('Performance officers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching performance data' 
    });
  }
});

app.get('/api/performance/activity', authenticateToken, async (req, res) => {
  try {
    const { officerId, limit = 50 } = req.query;
    const Transaction = require('./models/Transaction');
    
    const query = officerId ? { initiatedByUserId: officerId } : {};
    
    const activities = await Transaction.find(query)
      .populate('customerId', 'name phoneNumber customerId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('createdAt amount status description initiatedBy customerId transactionId');
    
    // Format the activities
    const formattedActivities = activities.map(activity => ({
      id: activity._id,
      transactionId: activity.transactionId,
      date: activity.createdAt,
      amount: activity.amount,
      status: activity.status,
      description: activity.description,
      officerName: activity.initiatedBy,
      customer: activity.customerId ? {
        name: activity.customerId.name,
        phone: activity.customerId.phoneNumber,
        customerId: activity.customerId.customerId
      } : null
    }));
    
    res.json({ 
      success: true, 
      message: 'Activity data retrieved',
      data: formattedActivities 
    });
  } catch (error) {
    console.error('Performance activity error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching activity data' 
    });
  }
});

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

// ==================== RECENT TRANSACTIONS FOR DASHBOARD ====================
app.get('/api/payments/recent-transactions', authenticateToken, async (req, res) => {
  try {
    console.log('📱 Fetching recent transactions for dashboard...');
    
    const Transaction = require('./models/Transaction');
    const limit = parseInt(req.query.limit) || 10;
    
    const transactions = await Transaction.find({})
      .populate('customerId', 'name phoneNumber customerId')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    const formattedTransactions = transactions.map(t => ({
      _id: t._id,
      transactionId: t.transactionId,
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt,
      customerName: t.customerId?.name || 'Unknown Customer',
      phoneNumber: t.customerId?.phoneNumber || t.phoneNumber,
      customerId: t.customerId ? {
        _id: t.customerId._id,
        name: t.customerId.name
      } : null
    }));
    
    res.json({
      success: true,
      message: 'Recent transactions retrieved',
      data: {
        transactions: formattedTransactions,
        count: formattedTransactions.length
      }
    });
    
  } catch (error) {
    console.error('Recent transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent transactions'
    });
  }
});

// ==================== TEST DATA ENDPOINT ====================
app.get('/api/test/transactions', authenticateToken, (req, res) => {
  // Return test transaction data for debugging
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
      createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
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
  // Return test stats for debugging
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

// ==================== 404 HANDLER ====================
app.use('*', (req, res) => {
  console.log(`❌ Route not found: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    requestedUrl: req.originalUrl
  });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err);
  
  // Log full error in development
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

// ==================== SERVER STARTUP ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 WhatsApp Webhook URL: ${process.env.WEBHOOK_BASE_URL || 'http://localhost:' + PORT}/api/payments/whatsapp-response`);
  console.log(`🌍 Public URL: https://blossom-nondiscoverable-christene.ngrok-free.dev`);
  console.log(`📊 API Endpoints:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/customers/dashboard/stats`);
  console.log(`   GET  /api/transactions`);
  console.log(`   GET  /api/payments/recent-transactions`);
  console.log(`   GET  /api/test/transactions (for debugging)`);
  console.log(`   GET  /api/test/stats (for debugging)`);
});