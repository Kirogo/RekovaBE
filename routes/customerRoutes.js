const express = require('express');
const router = express.Router();
const {
  createCustomer,
  getCustomers,
  getCustomer,
  getCustomerByPhone,
  updateCustomer,
  deleteCustomer,
  getDashboardStats
} = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Routes accessible to all authenticated users
router.route('/')
  .get(getCustomers) // All users can view customers
  .post(authorize('admin', 'supervisor'), createCustomer); // Only admins/supervisors can create

// Dashboard stats - accessible to ALL authenticated users
router.get('/dashboard/stats', getDashboardStats);


// Get customer by phone - all users can search
router.get('/phone/:phoneNumber', getCustomerByPhone);

// Customer detail routes
router.route('/:id')
  .get(getCustomer) // All users can view customer details
  .put(authorize('admin', 'supervisor'), updateCustomer) // Only admins/supervisors can update
  .delete(authorize('admin'), deleteCustomer); // Only admins can delete

module.exports = router;