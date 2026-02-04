const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisorController');
const { protect, authorize } = require('../middleware/auth');
const activityMiddleware = require('../middleware/activityMiddleware');

// Apply authentication to all supervisor routes
router.use(protect);

// Apply activity logging middleware for supervisor routes
router.use(activityMiddleware());

// Apply authorization - only supervisors and admins can access these routes
router.use(authorize('supervisor', 'admin'));

// Dashboard overview
router.get('/dashboard', supervisorController.getDashboardOverview);

// Officer management
router.get('/officers', supervisorController.getOfficers);
router.get('/officers/performance', supervisorController.getOfficerPerformance);
router.post('/officers/assign-specialization', supervisorController.assignLoanTypeSpecialization);

// Assignment management
router.post('/assignments/bulk', supervisorController.runBulkAssignment);

// Reports
router.get('/reports/team', supervisorController.generateTeamReport);

module.exports = router;