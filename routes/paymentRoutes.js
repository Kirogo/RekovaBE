// routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { protect, authorize } = require("../middleware/auth");

// Public routes
router.post("/whatsapp-response", paymentController.processWhatsAppResponse);
router.get("/test", paymentController.testEndpoint);

// Apply protect middleware to all routes below
router.use(protect);

// All authenticated users can access these
router.get("/recent-transactions", paymentController.getRecentTransactions);
router.get("/transactions", paymentController.getTransactions);
router.get("/status/:transactionId", paymentController.getTransactionStatus);

// Officer-specific transaction routes
router.get("/my-transactions", paymentController.getMyTransactions);
router.get("/my-collections", paymentController.getMyCollections);

// Payment actions (all authenticated users)
router.post("/initiate", paymentController.initiateSTKPush);
router.post("/process-pin", paymentController.processPin);
router.post("/manual-pin", paymentController.manualPinEntry);
router.get("/transaction/:id", paymentController.getTransactionById);
router.get("/debug-transaction", paymentController.debugTransactionModel);

// Admin/Supervisor only routes
router.get("/dashboard/stats", 
  authorize("admin", "supervisor"), 
  paymentController.getDashboardStats
);

router.post("/mark-failed/:transactionId", 
  authorize("admin", "supervisor"), 
  paymentController.markTransactionFailed
);

router.post("/cancel/:transactionId", 
  authorize("admin", "supervisor"), 
  paymentController.cancelTransaction
);

module.exports = router;