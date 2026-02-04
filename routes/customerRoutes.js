// routes/customerRoutes.js
const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { protect, authorize } = require("../middleware/auth");

// Apply protect middleware to all routes
router.use(protect);

// Routes accessible to all authenticated users
router
  .route("/")
  .get(customerController.getCustomers) // All users can view customers
  .post(authorize("admin", "supervisor"), customerController.createCustomer); // Only admins/supervisors can create

// Dashboard stats - accessible to ALL authenticated users
router.get("/dashboard/stats", customerController.getDashboardStats);

// Officer-specific routes
router.get("/assigned-to-me", customerController.getMyAssignedCustomers);

router.get("/dashboard/officer-stats", customerController.getOfficerDashboardStats);

// Get customer by phone - all users can search
router.get("/phone/:phoneNumber", customerController.getCustomerByPhone);

// Customer detail routes
router
  .route("/:id")
  .get(customerController.getCustomer) // All users can view customer details
  .put(authorize("admin", "supervisor"), customerController.updateCustomer) // Only admins/supervisors can update
  .delete(authorize("admin"), customerController.deleteCustomer); // Only admins can delete

module.exports = router;