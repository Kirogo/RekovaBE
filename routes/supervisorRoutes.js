// routes/supervisorRoutes.js
const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisorController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication and supervisor/admin role
router.use(protect);
router.use(authorize('supervisor', 'admin'));

// ==================== DASHBOARD ROUTES ====================
router.get('/dashboard', supervisorController.getDashboardOverview);

// ==================== OFFICER MANAGEMENT ROUTES ====================
router.get('/officers', supervisorController.getOfficers);
router.get('/officers/performance', supervisorController.getOfficerPerformance);
router.get('/officers/collections', supervisorController.getOfficerCollections);
router.get('/officers/customers', supervisorController.getOfficerCustomers);
router.get('/officers/:officerId/performance', supervisorController.getOfficerPerformanceById);
router.get('/officers/:officerId/activities', supervisorController.getOfficerActivities);
router.post('/officers/assign-specialization', supervisorController.assignLoanTypeSpecialization);

// ==================== LOAN TYPE ROUTES ====================
router.get('/loan-types/:loanType/officers', async (req, res) => {
    try {
        const { loanType } = req.params;
        const officers = await User.find({ 
            loanType: loanType,
            role: 'officer',
            isActive: true 
        }).select('name username email assignedCustomers efficiency');
        
        res.json({
            success: true,
            data: { officers }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching officers for loan type'
        });
    }
});

// ==================== ASSIGNMENT ROUTES ====================
router.post('/assignments/bulk', supervisorController.runBulkAssignment);

// ==================== REPORT ROUTES ====================
router.post('/reports/officer/:officerId/excel', supervisorController.generateOfficerExcelReport);
router.post('/reports/officer/:officerId/pdf', supervisorController.generateOfficerPDFReport);
router.post('/reports/officer/:officerId/chart', supervisorController.generateOfficerChart);
router.get('/reports/team', supervisorController.generateTeamReport);

module.exports = router;