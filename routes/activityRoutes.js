const express = require('express');
const router = express.Router();
const ActivityController = require('../controllers/activityController');
const { protect, authorize } = require('../middleware/auth');

// Apply authentication to all activity routes
router.use(protect);

/**
 * @desc    Get user's own activities
 * @route   GET /api/activities/my-activities
 * @access  Private (All authenticated users)
 */
router.get('/my-activities', ActivityController.getMyActivities);

/**
 * @desc    Get system activities
 * @route   GET /api/activities/system
 * @access  Private (Admin, Supervisor)
 */
router.get('/system', authorize('admin', 'supervisor'), ActivityController.getSystemActivities);

/**
 * @desc    Get activity statistics
 * @route   GET /api/activities/stats
 * @access  Private (Admin, Supervisor)
 */
router.get('/stats', authorize('admin', 'supervisor'), ActivityController.getActivityStats);

/**
 * @desc    Search activities
 * @route   GET /api/activities/search
 * @access  Private (Admin, Supervisor)
 */
router.get('/search', authorize('admin', 'supervisor'), ActivityController.searchActivities);

/**
 * @desc    Export activities to CSV
 * @route   GET /api/activities/export
 * @access  Private (Admin, Supervisor)
 */
router.get('/export', authorize('admin', 'supervisor'), ActivityController.exportActivities);

/**
 * @desc    Cleanup old activities
 * @route   DELETE /api/activities/cleanup
 * @access  Private (Admin only)
 */
router.delete('/cleanup', authorize('admin'), ActivityController.cleanupActivities);

module.exports = router;