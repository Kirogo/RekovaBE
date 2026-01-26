const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Public routes
router.post('/whatsapp-response', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.processWhatsAppResponse(req, res);
});

router.get('/test', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.testEndpoint(req, res);
});

// Apply protect middleware to all routes below
router.use(protect);

// All authenticated users can access these
router.get('/recent-transactions', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.getRecentTransactions(req, res);
});

router.get('/transactions', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.getTransactions(req, res);
});

router.get('/status/:transactionId', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.getTransactionStatus(req, res);
});

// Payment actions
router.post('/initiate', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.initiateSTKPush(req, res);
});

router.post('/process-pin', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.processPin(req, res);
});

router.post('/manual-pin', (req, res) => {
  const paymentController = require('../controllers/paymentController');
  paymentController.manualPinEntry(req, res);
});

// Admin/Supervisor only routes
router.get('/dashboard/stats', (req, res) => {
  const { authorize } = require('../middleware/auth');
  // Check if user is admin/supervisor
  if (!['admin', 'supervisor'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin/Supervisor only.'
    });
  }
  const paymentController = require('../controllers/paymentController');
  paymentController.getDashboardStats(req, res);
});

router.post('/mark-failed/:transactionId', (req, res) => {
  const { authorize } = require('../middleware/auth');
  if (!['admin', 'supervisor'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin/Supervisor only.'
    });
  }
  const paymentController = require('../controllers/paymentController');
  paymentController.markTransactionFailed(req, res);
});

router.post('/cancel/:transactionId', (req, res) => {
  const { authorize } = require('../middleware/auth');
  if (!['admin', 'supervisor'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin/Supervisor only.'
    });
  }
  const paymentController = require('../controllers/paymentController');
  paymentController.cancelTransaction(req, res);
});

module.exports = router;