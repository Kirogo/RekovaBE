// routes/report.routes.js
const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisorController');
const { protect, authorize } = require('../middleware/auth');

// All report routes require authentication and supervisor/admin role
router.use(protect);
router.use(authorize('supervisor', 'admin'));

// Generate officer reports
router.post('/officer/:officerId/excel', supervisorController.generateOfficerExcelReport);
router.post('/officer/:officerId/pdf', supervisorController.generateOfficerPDFReport);
router.post('/officer/:officerId/chart', supervisorController.generateOfficerChart);

// Generate team report
router.get('/team', supervisorController.generateTeamReport);

module.exports = router;