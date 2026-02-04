// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const ActivityLogger = require('../services/activityLogger');
const { protect, authorize } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);
router.post('/simple-login', authController.simpleLogin); // For testing
router.post('/simple-register', authController.simpleRegister); // For testing

// Protected routes (all routes below require authentication)
router.get('/me', protect, authController.getCurrentUser);
router.get('/permissions', protect, authController.getPermissions);
router.post('/logout', protect, authController.logout);
router.put('/change-password', protect, authController.changePassword);

// Admin only routes
router.get('/debug', protect, authorize('admin'), authController.debugUsers);
router.get('/roles', protect, authorize('admin'), authController.getRoles);
router.post('/register', protect, authorize('admin'), authController.register);

// User management routes
router.get('/users', protect, authorize('admin'), userController.getUsers);
router.get('/leaderboard', protect, userController.getLeaderboard);

// Auth test route
router.get('/test', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Auth test successful',
    user: {
      id: req.user._id,
      username: req.user.username,
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;