// routes/transactions.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");

// Apply protect middleware to all routes
router.use(protect);

// Import controller functions from paymentController
const paymentController = require("../controllers/paymentController");

// Officer-specific transaction routes
router.get("/my-transactions", paymentController.getMyTransactions);
router.get("/my-collections", paymentController.getMyCollections);

// General transaction routes
router.get("/", async (req, res) => {
  try {
    const Transaction = require("../models/Transaction");
    const Customer = require("../models/Customer");
    
    const { customerId, limit = 10 } = req.query;
    let query = {};
    
    if (customerId && customerId !== 'undefined' && customerId !== 'null') {
      const customer = await Customer.findById(customerId);
      if (customer) {
        query.customerId = customer._id;
      }
    }
    
    const transactions = await Transaction.find(query)
      .populate("customerId", "name phoneNumber customerId")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();
    
    res.json({
      success: true,
      data: { transactions }
    });
  } catch (error) {
    console.error("❌ Get transactions error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching transactions"
    });
  }
});

module.exports = router;