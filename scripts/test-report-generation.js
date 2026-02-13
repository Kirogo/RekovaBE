// scripts/test-report-generation.js
const ReportGenerator = require('../services/reportGenerator');
const path = require('path');
const fs = require('fs');

async function testReportGeneration() {
    console.log('🧪 Testing Report Generation...\n');
    
    // Sample officer data (similar to what the API returns)
    const officerData = {
        _id: '697b26a910037b36676a669f',
        officer: {
            _id: '697b26a910037b36676a669f',
            username: 'john.doe',
            name: 'John Doe',
            loanType: 'Digital Loans',
            email: 'john.doe@company.com',
            phone: '+254 712 345 678'
        },
        employeeId: 'EMP697b26',
        performance: {
            collectionRate: 78.3,
            callConversion: 64,
            efficiency: 8.2,
            customerSatisfaction: 4.2
        },
        collections: {
            total: 450000,
            monthly: 125000,
            weekly: 35000,
            today: 8500
        },
        customers: {
            totalAssigned: 45,
            active: 32,
            overdue: 8,
            newThisMonth: 5
        },
        calls: {
            today: 12,
            weekly: 48,
            averageDuration: '4:32'
        },
        assignments: {
            completed: 78,
            pending: 5,
            inProgress: 12
        },
        payments: {
            average: 32500,
            pending: 125000,
            overdue: 75000
        }
    };
    
    const activities = [
        {
            time: new Date(),
            type: 'payment',
            details: 'Payment of KES 5,000 received from John Doe',
            amount: 5000
        },
        {
            time: new Date(Date.now() - 3600000),
            type: 'call',
            details: 'Follow-up call with Jane Smith',
            amount: null
        },
        {
            time: new Date(Date.now() - 7200000),
            type: 'promise',
            details: 'Promise to pay KES 7,500 by Bob Johnson',
            amount: 7500
        }
    ];
    
    // Test 1: Excel Generation
    console.log('📊 Testing Excel Generation...');
    try {
        const workbook = await ReportGenerator.generateOfficerExcelReport(
            '697b26a910037b36676a669f',
            officerData,
            activities
        );
        
        const testOutputDir = path.join(__dirname, '../test-output');
        if (!fs.existsSync(testOutputDir)) {
            fs.mkdirSync(testOutputDir, { recursive: true });
        }
        
        const excelPath = path.join(testOutputDir, 'test-officer-report.xlsx');
        await workbook.xlsx.writeFile(excelPath);
        console.log(`✅ Excel report generated: ${excelPath}\n`);
    } catch (error) {
        console.error('❌ Excel generation failed:', error.message, '\n');
    }
    
    // Test 2: PDF Generation
    console.log('📄 Testing PDF Generation...');
    try {
        const pdfBuffer = await ReportGenerator.generateOfficerPDFReport(
            '697b26a910037b36676a669f',
            officerData,
            activities
        );
        
        const testOutputDir = path.join(__dirname, '../test-output');
        const pdfPath = path.join(testOutputDir, 'test-officer-report.pdf');
        fs.writeFileSync(pdfPath, pdfBuffer);
        console.log(`✅ PDF report generated: ${pdfPath}\n`);
    } catch (error) {
        console.error('❌ PDF generation failed:', error.message, '\n');
    }
    
    // Test 3: Chart Generation
    console.log('📈 Testing Chart Generation...');
    try {
        const chartBuffer = await ReportGenerator.generatePerformanceChart(
            '697b26a910037b36676a669f',
            officerData
        );
        
        const testOutputDir = path.join(__dirname, '../test-output');
        const chartPath = path.join(testOutputDir, 'test-performance-chart.png');
        fs.writeFileSync(chartPath, chartBuffer);
        console.log(`✅ Chart generated: ${chartPath}\n`);
    } catch (error) {
        console.error('❌ Chart generation failed:', error.message, '\n');
    }
    
    console.log('🎉 Report generation tests completed!');
}

// Run the test
testReportGeneration().catch(console.error);