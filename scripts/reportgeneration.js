// scripts/test-report-generation.js
const ReportGenerator = require('../services/reportGenerator');
const path = require('path');
const fs = require('fs');

async function testReportGeneration() {
    console.log('🧪 Testing Report Generation...\n');

    const testOfficerId = '694956695c314fbc61ee18af';
    const testOfficerData = {
        officer: {
            name: 'Sarah Wangechi',
            username: 'sarah.wangechi',
            email: 'sarah.wangechi@ncbagroup.com',
            phone: '254712345682',
            loanType: 'Credit Cards'
        },
        performance: {
            collectionRate: 78.3,
            callConversion: 64.0,
            efficiency: 8.5,
            customerSatisfaction: 4.2
        },
        collections: {
            total: 323500,
            monthly: 125000,
            weekly: 32500,
            today: 8500
        },
        customers: {
            totalAssigned: 2,
            active: 1,
            overdue: 1,
            newThisMonth: 0
        },
        calls: {
            today: 8,
            weekly: 32,
            averageDuration: '4:32'
        },
        assignments: {
            completed: 3,
            pending: 0,
            inProgress: 0
        },
        payments: {
            pending: 0,
            overdue: 20000,
            average: 32500
        },
        employeeId: `EMP${testOfficerId.slice(-6)}`,
        joinDate: '2026-01-29'
    };

    const testCollections = [
        { date: '2026-02-12', transactionId: 'TXN001', customerName: 'John Doe', phoneNumber: '254712345678', amount: 5000, status: 'SUCCESS', receipt: 'MP123456', loanType: 'Digital Loans', paymentMethod: 'M-PESA' }
    ];

    const testCustomers = [
        { name: 'John Doe', phone: '254712345678', loanType: 'Digital Loans', loanAmount: 50000, arrears: 5000, status: 'OVERDUE', lastContact: '2026-02-12', nextFollowUp: '2026-02-13', promiseAmount: 5000, promiseDate: '2026-02-15' }
    ];

    // Test Excel Generation
    try {
        console.log('📊 Testing Excel generation...');
        const workbook = await ReportGenerator.generateOfficerExcelReport(
            testOfficerId,
            testOfficerData,
            testCollections,
            testCustomers
        );
        
        const buffer = await ReportGenerator.workbookToBuffer(workbook);
        fs.writeFileSync(path.join(__dirname, '../test-output.xlsx'), buffer);
        console.log('✅ Excel generated successfully: test-output.xlsx\n');
    } catch (error) {
        console.error('❌ Excel generation failed:', error.message);
    }

    // Test PDF Generation
    try {
        console.log('📄 Testing PDF generation...');
        const pdfBuffer = await ReportGenerator.generateOfficerPDFReport(
            testOfficerId,
            testOfficerData,
            []
        );
        fs.writeFileSync(path.join(__dirname, '../test-output.pdf'), pdfBuffer);
        console.log('✅ PDF generated successfully: test-output.pdf\n');
    } catch (error) {
        console.error('❌ PDF generation failed:', error.message);
    }

    // Test Chart Generation
    try {
        console.log('📈 Testing Chart generation...');
        const chartBuffer = await ReportGenerator.generatePerformanceChart(
            testOfficerId,
            testOfficerData
        );
        fs.writeFileSync(path.join(__dirname, '../test-output.png'), chartBuffer);
        console.log('✅ Chart generated successfully: test-output.png\n');
    } catch (error) {
        console.error('❌ Chart generation failed:', error.message);
    }
}

testReportGeneration();