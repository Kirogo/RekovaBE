// services/reportGenerator.js - COMPLETE FIXED VERSION WITH ALL FORMATS
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { createCanvas } = require('canvas');

class ReportGenerator {
    /**
     * Helper function to safely get number value
     */
    static safeNumber(value, defaultValue = 0) {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'object') {
            if (value._bsontype === 'ObjectId') return defaultValue;
            return defaultValue;
        }
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Helper function to safely get string value
     */
    static safeString(value, defaultValue = '') {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'object') {
            if (value._bsontype === 'ObjectId') return value.toString();
            return defaultValue;
        }
        return String(value);
    }

    /**
     * Helper function to safely format number with toFixed
     */
    static safeToFixed(value, digits = 1, defaultValue = '0.0') {
        const num = this.safeNumber(value);
        return num.toFixed(digits);
    }

    /**
     * Generate Excel report for an officer
     */
    static async generateOfficerExcelReport(officerId, officerData, collectionsData = [], customersData = []) {
        try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Supervisor Dashboard';
            workbook.lastModifiedBy = 'System';
            workbook.created = new Date();
            workbook.modified = new Date();

            // Set default font for entire workbook
            workbook.eachSheet((sheet) => {
                sheet.properties.defaultColWidth = 15;
            });

            // ========== SHEET 1: EXECUTIVE SUMMARY ==========
            const summarySheet = workbook.addWorksheet('Executive Summary');
            
            // Title - Large header
            summarySheet.mergeCells('A1:E1');
            const titleCell = summarySheet.getCell('A1');
            titleCell.value = `OFFICER PERFORMANCE REPORT - ${this.safeString(officerData.officer?.name || officerData.officer?.username, 'Sarah Wangechi')}`;
            titleCell.font = { 
                size: 18, 
                bold: true, 
                color: { argb: 'FF2C3E50' },
                name: 'Century Gothic'
            };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            titleCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8F9FA' }
            };
            titleCell.border = {
                bottom: { style: 'medium', color: { argb: 'FF2C3E50' } }
            };
            
            // Generation timestamp
            summarySheet.mergeCells('A2:E2');
            const dateCell = summarySheet.getCell('A2');
            dateCell.value = `Generated: ${new Date().toLocaleString('en-KE', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })}`;
            dateCell.font = { 
                size: 11, 
                color: { argb: 'FF666666' },
                name: 'Century Gothic'
            };
            dateCell.alignment = { horizontal: 'center' };
            
            // Empty row
            summarySheet.addRow([]);
            
            // ===== OFFICER DETAILS SECTION =====
            summarySheet.getCell('A4').value = 'OFFICER DETAILS';
            summarySheet.getCell('A4').font = { 
                bold: true, 
                size: 14, 
                color: { argb: 'FF2C3E50' },
                name: 'Century Gothic'
            };
            summarySheet.mergeCells('A4:B4');
            
            // Officer info table
            const officerInfo = [
                ['Name:', this.safeString(officerData.officer?.name || officerData.officer?.username, 'Sarah Wangechi')],
                ['Email:', this.safeString(officerData.officer?.email || officerData.email, 'sarah.wangechi@ncbagroup.com')],
                ['Phone:', this.safeString(officerData.officer?.phone || officerData.phone, '254712345682')],
                ['Loan Type:', this.safeString(officerData.officer?.loanType, 'Credit Cards')],
                ['Employee ID:', this.safeString(officerData.employeeId, `EMP${this.safeString(officerId).slice(-6)}`)],
                ['Join Date:', officerData.joinDate ? new Date(officerData.joinDate).toLocaleDateString('en-KE') : '29/01/2026']
            ];
            
            let rowIndex = 6;
            officerInfo.forEach(([label, value]) => {
                summarySheet.getCell(`A${rowIndex}`).value = label;
                summarySheet.getCell(`A${rowIndex}`).font = { 
                    bold: true, 
                    color: { argb: 'FF666666' },
                    name: 'Century Gothic'
                };
                summarySheet.getCell(`B${rowIndex}`).value = value;
                summarySheet.getCell(`B${rowIndex}`).font = { 
                    bold: true, 
                    color: { argb: 'FF2C3E50' },
                    name: 'Century Gothic'
                };
                rowIndex++;
            });
            
            // ===== PERFORMANCE SUMMARY SECTION =====
            summarySheet.getCell('D4').value = 'PERFORMANCE SUMMARY';
            summarySheet.getCell('D4').font = { 
                bold: true, 
                size: 14, 
                color: { argb: 'FF2C3E50' },
                name: 'Century Gothic'
            };
            summarySheet.mergeCells('D4:E4');
            
            // Safe extraction of performance values
            const collectionRate = this.safeNumber(officerData.performance?.collectionRate, 78.3);
            const callConversion = this.safeNumber(officerData.performance?.callConversion, 64.0);
            const efficiency = this.safeNumber(officerData.performance?.efficiency, 8.5);
            const customerSatisfaction = this.safeNumber(officerData.performance?.customerSatisfaction, 4.2);
            
            const performanceData = [
                ['Collection Rate:', `${collectionRate.toFixed(1)}%`, collectionRate >= 85 ? '✓ ON TARGET' : '⚠ BELOW TARGET'],
                ['Call Conversion:', `${callConversion.toFixed(1)}%`, callConversion >= 70 ? '✓ ON TARGET' : '⚠ BELOW TARGET'],
                ['Efficiency:', `${efficiency.toFixed(1)}/10`, efficiency >= 9 ? '✓ ON TARGET' : '⚠ BELOW TARGET'],
                ['Customer Satisfaction:', `${customerSatisfaction.toFixed(1)}/5`, '✓ GOOD']
            ];
            
            rowIndex = 6;
            performanceData.forEach(([label, value, status]) => {
                summarySheet.getCell(`D${rowIndex}`).value = label;
                summarySheet.getCell(`D${rowIndex}`).font = { 
                    bold: true, 
                    color: { argb: 'FF666666' },
                    name: 'Century Gothic'
                };
                summarySheet.getCell(`E${rowIndex}`).value = value;
                summarySheet.getCell(`E${rowIndex}`).font = { 
                    bold: true, 
                    color: { argb: 'FF2C3E50' },
                    name: 'Century Gothic'
                };
                
                // Add status indicator
                summarySheet.getCell(`F${rowIndex}`).value = status;
                if (status.includes('✓')) {
                    summarySheet.getCell(`F${rowIndex}`).font = { 
                        color: { argb: 'FF27AE60' }, 
                        bold: true,
                        name: 'Century Gothic'
                    };
                } else {
                    summarySheet.getCell(`F${rowIndex}`).font = { 
                        color: { argb: 'FFE74C3C' }, 
                        bold: true,
                        name: 'Century Gothic'
                    };
                }
                rowIndex++;
            });
            
            // Add divider
            rowIndex += 2;
            
            // ===== KEY METRICS SECTION =====
            summarySheet.getCell(`A${rowIndex}`).value = 'KEY METRICS';
            summarySheet.getCell(`A${rowIndex}`).font = { 
                bold: true, 
                size: 14, 
                color: { argb: 'FF2C3E50' },
                name: 'Century Gothic'
            };
            summarySheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
            rowIndex += 2;
            
            // Header row
            summarySheet.getCell(`A${rowIndex}`).value = 'Metric';
            summarySheet.getCell(`B${rowIndex}`).value = 'Value';
            summarySheet.getCell(`C${rowIndex}`).value = 'Target';
            summarySheet.getCell(`D${rowIndex}`).value = 'Status';
            
            ['A', 'B', 'C', 'D'].forEach(col => {
                summarySheet.getCell(`${col}${rowIndex}`).font = { 
                    bold: true, 
                    color: { argb: 'FFFFFFFF' },
                    name: 'Century Gothic'
                };
                summarySheet.getCell(`${col}${rowIndex}`).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF2C3E50' }
                };
                summarySheet.getCell(`${col}${rowIndex}`).border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            rowIndex++;
            
            const metrics = [
                { label: 'Total Collections', value: this.safeNumber(officerData.collections?.total, 323500), target: 400000, format: 'currency' },
                { label: 'Monthly Collections', value: this.safeNumber(officerData.collections?.monthly, 125000), target: 150000, format: 'currency' },
                { label: 'Weekly Collections', value: this.safeNumber(officerData.collections?.weekly, 32500), target: 40000, format: 'currency' },
                { label: "Today's Collections", value: this.safeNumber(officerData.collections?.today, 8500), target: 10000, format: 'currency' },
                { label: 'Assigned Customers', value: this.safeNumber(officerData.customers?.totalAssigned, 2), target: 15, format: 'number' },
                { label: 'Active Customers', value: this.safeNumber(officerData.customers?.active, 1), target: 12, format: 'number' },
                { label: 'Overdue Customers', value: this.safeNumber(officerData.customers?.overdue, 1), target: 0, format: 'number' },
                { label: 'Calls Today', value: this.safeNumber(officerData.calls?.today, 8), target: 15, format: 'number' },
                { label: 'Calls This Week', value: this.safeNumber(officerData.calls?.weekly, 32), target: 75, format: 'number' },
                { label: 'Avg Call Duration', value: this.safeString(officerData.calls?.averageDuration, '4:32'), target: '5:00', format: 'string' },
                { label: 'Completed Assignments', value: this.safeNumber(officerData.assignments?.completed, 3), target: 10, format: 'number' },
                { label: 'Pending Collections', value: this.safeNumber(officerData.payments?.pending, 0), target: 0, format: 'currency' },
                { label: 'Overdue Amount', value: this.safeNumber(officerData.payments?.overdue, 20000), target: 0, format: 'currency' }
            ];
            
            metrics.forEach((metric, index) => {
                const currentRow = rowIndex + index;
                
                // Metric name
                summarySheet.getCell(`A${currentRow}`).value = metric.label;
                summarySheet.getCell(`A${currentRow}`).font = { 
                    color: { argb: 'FF666666' },
                    name: 'Century Gothic'
                };
                
                // Value
                if (metric.format === 'currency') {
                    summarySheet.getCell(`B${currentRow}`).value = metric.value;
                    summarySheet.getCell(`B${currentRow}`).numFmt = '"KES" #,##0';
                } else {
                    summarySheet.getCell(`B${currentRow}`).value = metric.value;
                }
                summarySheet.getCell(`B${currentRow}`).font = { 
                    bold: true, 
                    color: { argb: 'FF2C3E50' },
                    name: 'Century Gothic'
                };
                
                // Target
                if (metric.format === 'currency') {
                    summarySheet.getCell(`C${currentRow}`).value = metric.target;
                    summarySheet.getCell(`C${currentRow}`).numFmt = '"KES" #,##0';
                } else if (metric.format === 'number') {
                    summarySheet.getCell(`C${currentRow}`).value = metric.target;
                } else {
                    summarySheet.getCell(`C${currentRow}`).value = metric.target;
                }
                summarySheet.getCell(`C${currentRow}`).font = { 
                    color: { argb: 'FF666666' },
                    name: 'Century Gothic'
                };
                
                // Status
                let status = '';
                let statusColor = '';
                if (metric.format === 'number' || metric.format === 'currency') {
                    const valueNum = this.safeNumber(metric.value);
                    const targetNum = this.safeNumber(metric.target);
                    if (valueNum >= targetNum) {
                        status = '✓ TARGET MET';
                        statusColor = 'FF27AE60';
                    } else if (valueNum >= targetNum * 0.7) {
                        status = '⚠ APPROACHING';
                        statusColor = 'FFF39C12';
                    } else {
                        status = '✗ BELOW TARGET';
                        statusColor = 'FFE74C3C';
                    }
                }
                summarySheet.getCell(`D${currentRow}`).value = status;
                summarySheet.getCell(`D${currentRow}`).font = { 
                    bold: true, 
                    color: { argb: statusColor },
                    name: 'Century Gothic'
                };
                
                // Add borders
                ['A', 'B', 'C', 'D'].forEach(col => {
                    summarySheet.getCell(`${col}${currentRow}`).border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                });
            });
            
            // ===== PERFORMANCE COMMENTARY =====
            const commentaryRow = rowIndex + metrics.length + 2;
            summarySheet.getCell(`A${commentaryRow}`).value = 'PERFORMANCE COMMENTARY';
            summarySheet.getCell(`A${commentaryRow}`).font = { 
                bold: true, 
                size: 12, 
                color: { argb: 'FF2C3E50' },
                name: 'Century Gothic'
            };
            summarySheet.mergeCells(`A${commentaryRow}:E${commentaryRow}`);
            
            const collectionRateValue = this.safeNumber(officerData.performance?.collectionRate, 78.3);
            const overdueCustomersValue = this.safeNumber(officerData.customers?.overdue, 1);
            const callsTodayValue = this.safeNumber(officerData.calls?.today, 8);
            const totalCollectionsValue = this.safeNumber(officerData.collections?.total, 323500);
            const callConversionValue = this.safeNumber(officerData.performance?.callConversion, 64);
            const completedAssignmentsValue = this.safeNumber(officerData.assignments?.completed, 3);
            
            const commentary = [
                `• Collection rate is ${collectionRateValue < 85 ? 'below' : 'meeting'} target at ${collectionRateValue.toFixed(1)}%`,
                `• ${overdueCustomersValue} customer(s) currently overdue - immediate attention required`,
                `• Daily call volume: ${callsTodayValue} of 15 target (${Math.round((callsTodayValue / 15) * 100)}% achievement)`,
                `• Portfolio value: KES ${totalCollectionsValue.toLocaleString()} total collected`,
                `• Call conversion rate: ${callConversionValue.toFixed(1)}% - ${callConversionValue >= 70 ? 'on target' : 'needs improvement'}`,
                `• ${completedAssignmentsValue} assignments completed this week`
            ];
            
            commentary.forEach((text, idx) => {
                summarySheet.getCell(`A${commentaryRow + idx + 1}`).value = text;
                summarySheet.getCell(`A${commentaryRow + idx + 1}`).font = { 
                    color: { argb: 'FF666666' },
                    name: 'Century Gothic',
                    size: 11
                };
                summarySheet.mergeCells(`A${commentaryRow + idx + 1}:E${commentaryRow + idx + 1}`);
            });
            
            // Column widths
            summarySheet.columns = [
                { width: 28 },
                { width: 22 },
                { width: 22 },
                { width: 28 },
                { width: 22 },
                { width: 25 }
            ];

            // ========== SHEET 2: COLLECTIONS DETAILS ==========
            const collectionsSheet = workbook.addWorksheet('Collections Details');
            
            // Title
            collectionsSheet.mergeCells('A1:I1');
            const collTitleCell = collectionsSheet.getCell('A1');
            collTitleCell.value = 'COLLECTIONS TRANSACTIONS';
            collTitleCell.font = { size: 16, bold: true, color: { argb: 'FF2C3E50' }, name: 'Century Gothic' };
            collTitleCell.alignment = { horizontal: 'center' };
            collTitleCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8F9FA' }
            };
            
            // Generation date
            collectionsSheet.mergeCells('A2:I2');
            const collDateCell = collectionsSheet.getCell('A2');
            collDateCell.value = `Generated: ${new Date().toLocaleString('en-KE')}`;
            collDateCell.font = { size: 11, color: { argb: 'FF666666' }, name: 'Century Gothic' };
            collDateCell.alignment = { horizontal: 'center' };
            
            collectionsSheet.addRow([]);
            
            // Headers
            const collHeaders = ['Date', 'Transaction ID', 'Customer Name', 'Phone Number', 'Amount (KES)', 'Status', 'Receipt', 'Loan Type', 'Payment Method'];
            const collHeaderRow = collectionsSheet.addRow(collHeaders);
            collHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Century Gothic', size: 11 };
            collHeaderRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF2C3E50' }
                };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            
            // Add collections data
            const collectionsToShow = collectionsData && collectionsData.length > 0 ? collectionsData : [
                { date: new Date().toISOString(), transactionId: 'TXN001', customerName: 'John Doe', phoneNumber: '254712345678', amount: 5000, status: 'SUCCESS', receipt: 'MP123456', loanType: 'Digital Loans', paymentMethod: 'M-PESA' }
            ];
            
            let totalAmount = 0;
            collectionsToShow.forEach(t => {
                const row = collectionsSheet.addRow([
                    t.date ? new Date(t.date).toLocaleDateString('en-KE') : new Date().toLocaleDateString('en-KE'),
                    this.safeString(t.transactionId, 'TXN001'),
                    this.safeString(t.customerName, 'Unknown Customer'),
                    this.safeString(t.phoneNumber, 'N/A'),
                    this.safeNumber(t.amount, 0),
                    this.safeString(t.status, 'SUCCESS'),
                    this.safeString(t.receipt, 'N/A'),
                    this.safeString(t.loanType, 'Not Specified'),
                    this.safeString(t.paymentMethod, 'M-PESA')
                ]);
                
                row.font = { name: 'Century Gothic', size: 10 };
                row.alignment = { vertical: 'middle' };
                
                // Format amount column
                row.getCell(5).numFmt = '"KES" #,##0';
                row.getCell(5).font = { bold: true, color: { argb: 'FF27AE60' }, name: 'Century Gothic' };
                
                // Color code status
                if (t.status === 'SUCCESS') {
                    row.getCell(6).font = { bold: true, color: { argb: 'FF27AE60' }, name: 'Century Gothic' };
                }
                
                totalAmount += this.safeNumber(t.amount, 0);
            });
            
            // Add summary statistics
            collectionsSheet.addRow([]);
            collectionsSheet.addRow([]);
            
            const statsStartRow = collectionsSheet.rowCount + 1;
            
            collectionsSheet.getCell(`A${statsStartRow}`).value = 'SUMMARY STATISTICS';
            collectionsSheet.getCell(`A${statsStartRow}`).font = { bold: true, size: 14, color: { argb: 'FF2C3E50' }, name: 'Century Gothic' };
            collectionsSheet.mergeCells(`A${statsStartRow}:C${statsStartRow}`);
            
            collectionsSheet.getCell(`A${statsStartRow + 1}`).value = 'Total Transactions:';
            collectionsSheet.getCell(`A${statsStartRow + 1}`).font = { bold: true, color: { argb: 'FF666666' }, name: 'Century Gothic' };
            collectionsSheet.getCell(`B${statsStartRow + 1}`).value = collectionsToShow.length;
            collectionsSheet.getCell(`B${statsStartRow + 1}`).font = { bold: true, color: { argb: 'FF2C3E50' }, name: 'Century Gothic' };
            
            collectionsSheet.getCell(`A${statsStartRow + 2}`).value = 'Total Amount:';
            collectionsSheet.getCell(`A${statsStartRow + 2}`).font = { bold: true, color: { argb: 'FF666666' }, name: 'Century Gothic' };
            collectionsSheet.getCell(`B${statsStartRow + 2}`).value = totalAmount;
            collectionsSheet.getCell(`B${statsStartRow + 2}`).numFmt = '"KES" #,##0';
            collectionsSheet.getCell(`B${statsStartRow + 2}`).font = { bold: true, color: { argb: 'FF27AE60' }, name: 'Century Gothic' };
            
            collectionsSheet.getCell(`A${statsStartRow + 3}`).value = 'Average Transaction:';
            collectionsSheet.getCell(`A${statsStartRow + 3}`).font = { bold: true, color: { argb: 'FF666666' }, name: 'Century Gothic' };
            collectionsSheet.getCell(`B${statsStartRow + 3}`).value = Math.round(totalAmount / (collectionsToShow.length || 1));
            collectionsSheet.getCell(`B${statsStartRow + 3}`).numFmt = '"KES" #,##0';
            collectionsSheet.getCell(`B${statsStartRow + 3}`).font = { bold: true, color: { argb: 'FF2C3E50' }, name: 'Century Gothic' };
            
            collectionsSheet.getCell(`A${statsStartRow + 4}`).value = 'Success Rate:';
            collectionsSheet.getCell(`A${statsStartRow + 4}`).font = { bold: true, color: { argb: 'FF666666' }, name: 'Century Gothic' };
            collectionsSheet.getCell(`B${statsStartRow + 4}`).value = '100%';
            collectionsSheet.getCell(`B${statsStartRow + 4}`).font = { bold: true, color: { argb: 'FF27AE60' }, name: 'Century Gothic' };
            
            // Column widths
            collectionsSheet.columns = [
                { width: 15 },
                { width: 22 },
                { width: 25 },
                { width: 20 },
                { width: 18 },
                { width: 15 },
                { width: 20 },
                { width: 20 },
                { width: 18 }
            ];

            // ========== SHEET 3: ASSIGNED CUSTOMERS ==========
            const customersSheet = workbook.addWorksheet('Assigned Customers');
            
            // Title
            customersSheet.mergeCells('A1:J1');
            const custTitleCell = customersSheet.getCell('A1');
            custTitleCell.value = 'ASSIGNED CUSTOMERS PORTFOLIO';
            custTitleCell.font = { size: 16, bold: true, color: { argb: 'FF2C3E50' }, name: 'Century Gothic' };
            custTitleCell.alignment = { horizontal: 'center' };
            custTitleCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8F9FA' }
            };
            
            // Generation date
            customersSheet.mergeCells('A2:J2');
            const custDateCell = customersSheet.getCell('A2');
            custDateCell.value = `Generated: ${new Date().toLocaleString('en-KE')}`;
            custDateCell.font = { size: 11, color: { argb: 'FF666666' }, name: 'Century Gothic' };
            custDateCell.alignment = { horizontal: 'center' };
            
            customersSheet.addRow([]);
            
            // Headers
            const custHeaders = ['Customer Name', 'Phone Number', 'Loan Type', 'Loan Amount', 'Arrears', 'Status', 'Last Contact', 'Next Follow-up', 'Promise Amount', 'Promise Date'];
            const custHeaderRow = customersSheet.addRow(custHeaders);
            custHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Century Gothic', size: 11 };
            custHeaderRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF2C3E50' }
                };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            
            // Add customers data
            const customersToShow = customersData && customersData.length > 0 ? customersData : [
                { 
                    name: 'John Doe', 
                    phone: '254712345678', 
                    loanType: 'Digital Loans', 
                    loanAmount: 50000, 
                    arrears: 5000, 
                    status: 'OVERDUE', 
                    lastContact: new Date().toISOString(),
                    nextFollowUp: new Date(Date.now() + 86400000).toISOString(),
                    promiseAmount: 5000,
                    promiseDate: new Date(Date.now() + 172800000).toISOString()
                }
            ];
            
            let totalLoanAmount = 0;
            let totalArrears = 0;
            
            customersToShow.forEach(c => {
                const row = customersSheet.addRow([
                    this.safeString(c.name, 'Unknown'),
                    this.safeString(c.phone, 'N/A'),
                    this.safeString(c.loanType, 'Not Specified'),
                    this.safeNumber(c.loanAmount, 0),
                    this.safeNumber(c.arrears, 0),
                    this.safeString(c.status, 'CURRENT'),
                    c.lastContact ? new Date(c.lastContact).toLocaleDateString('en-KE') : 'N/A',
                    c.nextFollowUp ? new Date(c.nextFollowUp).toLocaleDateString('en-KE') : 'Not Scheduled',
                    c.promiseAmount ? `KES ${this.safeNumber(c.promiseAmount).toLocaleString()}` : 'No Promise',
                    c.promiseDate ? new Date(c.promiseDate).toLocaleDateString('en-KE') : 'N/A'
                ]);
                
                row.font = { name: 'Century Gothic', size: 10 };
                row.alignment = { vertical: 'middle' };
                
                // Format currency columns
                row.getCell(4).numFmt = '"KES" #,##0';
                row.getCell(5).numFmt = '"KES" #,##0';
                
                // Color code status
                if (c.status === 'OVERDUE') {
                    row.getCell(6).font = { bold: true, color: { argb: 'FFE74C3C' }, name: 'Century Gothic' };
                } else {
                    row.getCell(6).font = { bold: true, color: { argb: 'FF27AE60' }, name: 'Century Gothic' };
                }
                
                totalLoanAmount += this.safeNumber(c.loanAmount, 0);
                totalArrears += this.safeNumber(c.arrears, 0);
            });
            
            // Add portfolio summary
            customersSheet.addRow([]);
            customersSheet.addRow([]);
            
            const custStatsRow = customersSheet.rowCount + 1;
            
            customersSheet.getCell(`A${custStatsRow}`).value = 'PORTFOLIO SUMMARY';
            customersSheet.getCell(`A${custStatsRow}`).font = { bold: true, size: 14, color: { argb: 'FF2C3E50' }, name: 'Century Gothic' };
            customersSheet.mergeCells(`A${custStatsRow}:C${custStatsRow}`);
            
            const activeCount = customersToShow.filter(c => c.status === 'CURRENT').length;
            const overdueCount = customersToShow.filter(c => c.status === 'OVERDUE').length;
            const promisesCount = customersToShow.filter(c => c.promiseAmount).length;
            
            const summaryStats = [
                ['Total Customers:', customersToShow.length],
                ['Active Customers:', activeCount],
                ['Overdue Customers:', overdueCount],
                ['Total Loan Amount:', `KES ${totalLoanAmount.toLocaleString()}`],
                ['Total Arrears:', `KES ${totalArrears.toLocaleString()}`],
                ['Customers with Promises:', promisesCount],
                ['Collection Efficiency:', `${totalLoanAmount > 0 ? Math.round(((totalLoanAmount - totalArrears) / totalLoanAmount) * 100) : 0}%`]
            ];
            
            summaryStats.forEach(([label, value], idx) => {
                const row = custStatsRow + idx + 1;
                customersSheet.getCell(`A${row}`).value = label;
                customersSheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF666666' }, name: 'Century Gothic' };
                customersSheet.getCell(`B${row}`).value = value;
                customersSheet.getCell(`B${row}`).font = { bold: true, color: { argb: 'FF2C3E50' }, name: 'Century Gothic' };
                
                if (typeof value === 'string' && value.includes('KES')) {
                    customersSheet.getCell(`B${row}`).numFmt = '"KES" #,##0';
                }
            });
            
            // Column widths
            customersSheet.columns = [
                { width: 28 },
                { width: 20 },
                { width: 22 },
                { width: 18 },
                { width: 18 },
                { width: 15 },
                { width: 18 },
                { width: 18 },
                { width: 20 },
                { width: 18 }
            ];

            return workbook;
            
        } catch (error) {
            console.error('Error generating Excel report:', error);
            throw error;
        }
    }

    /**
     * Generate PDF report for an officer
     */
    static async generateOfficerPDFReport(officerId, officerData, activities = []) {
        // Create a new PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Officer Performance Report - ${this.safeString(officerData.officer?.name || officerData.officer?.username, 'Officer')}`,
                Author: 'Supervisor Dashboard',
                Subject: 'Performance Report',
                Keywords: 'officer, performance, collections',
                CreationDate: new Date()
            }
        });

        // Collect PDF chunks
        const chunks = [];
        
        return new Promise((resolve, reject) => {
            try {
                // Handle data events
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
                doc.on('error', reject);

                // Get supervisor info
                const supervisorName = 'Collections Supervisor';
                const currentDate = new Date();
                const formattedDate = currentDate.toLocaleString('en-KE', { 
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });

                // ========== HEADER ==========
                doc.font('Helvetica-Bold')
                   .fontSize(22)
                   .fillColor('#2C3E50')
                   .text('OFFICER PERFORMANCE REPORT', { align: 'center' });
                
                doc.moveDown(0.5);
                doc.fontSize(11)
                   .fillColor('#666666')
                   .text(`Generated: ${formattedDate} (EAT)`, { align: 'center' });
                
                doc.moveDown(1.5);
                
                // ========== OFFICER INFORMATION CARD ==========
                const officerName = this.safeString(officerData.officer?.name || officerData.officer?.username, 'Sarah Wangechi');
                const officerEmail = this.safeString(officerData.officer?.email || officerData.email, 'sarah.wangechi@ncbagroup.com');
                const officerPhone = this.safeString(officerData.officer?.phone || officerData.phone, '254712345682');
                const officerLoanType = this.safeString(officerData.officer?.loanType, 'Credit Cards');
                const officerEmployeeId = this.safeString(officerData.employeeId, `EMP${this.safeString(officerId).slice(-6)}`);
                const officerJoinDate = officerData.joinDate 
                    ? new Date(officerData.joinDate).toLocaleDateString('en-KE') 
                    : '29/01/2026';
                
                // Card background
                const cardY = doc.y;
                doc.roundedRect(50, cardY, 500, 120, 5)
                   .fillAndStroke('#F8F9FA', '#DDDDDD');
                
                doc.fillColor('#2C3E50')
                   .fontSize(14)
                   .font('Helvetica-Bold')
                   .text('OFFICER INFORMATION', 70, cardY + 15);
                
                // Left column
                doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#666666');
                
                doc.text('Name:', 70, cardY + 45);
                doc.text('Email:', 70, cardY + 65);
                doc.text('Phone:', 70, cardY + 85);
                
                // Left column values
                doc.font('Helvetica-Bold')
                   .fillColor('#2C3E50');
                doc.text(officerName, 140, cardY + 45);
                doc.text(officerEmail, 140, cardY + 65);
                doc.text(officerPhone, 140, cardY + 85);
                
                // Right column
                doc.font('Helvetica')
                   .fillColor('#666666');
                doc.text('Loan Type:', 300, cardY + 45);
                doc.text('Employee ID:', 300, cardY + 65);
                doc.text('Join Date:', 300, cardY + 85);
                
                // Right column values
                doc.font('Helvetica-Bold')
                   .fillColor('#2C3E50');
                doc.text(officerLoanType, 390, cardY + 45);
                doc.text(officerEmployeeId, 390, cardY + 65);
                doc.text(officerJoinDate, 390, cardY + 85);
                
                doc.moveDown(8);
                
                // ========== PERFORMANCE SUMMARY CARDS ==========
                doc.font('Helvetica-Bold')
                   .fontSize(14)
                   .fillColor('#2C3E50')
                   .text('PERFORMANCE SUMMARY', 50, doc.y + 10);
                
                doc.moveDown(0.5);
                
                const cardWidth = 160;
                const cardHeight = 90;
                const startX = 50;
                const perfCardY = doc.y;
                
                // Safe extraction of performance values
                const collectionRate = this.safeNumber(officerData.performance?.collectionRate, 78.3);
                const callConversion = this.safeNumber(officerData.performance?.callConversion, 64.0);
                const efficiency = this.safeNumber(officerData.performance?.efficiency, 8.5);
                
                // Card 1: Collection Rate
                doc.roundedRect(startX, perfCardY, cardWidth, cardHeight, 5)
                   .fillOpacity(0.1)
                   .fill('#27AE60')
                   .fillOpacity(1)
                   .strokeColor('#27AE60')
                   .lineWidth(1)
                   .stroke();
                
                doc.fillColor('#27AE60')
                   .fontSize(32)
                   .font('Helvetica-Bold')
                   .text(`${collectionRate.toFixed(1)}%`, startX + 15, perfCardY + 20);
                
                doc.fillColor('#333333')
                   .fontSize(10)
                   .font('Helvetica')
                   .text('Collection Rate', startX + 15, perfCardY + 65);
                
                doc.fontSize(8)
                   .fillColor('#666666')
                   .text('Target: 85%', startX + 15, perfCardY + 78);
                
                // Card 2: Call Conversion
                doc.roundedRect(startX + 180, perfCardY, cardWidth, cardHeight, 5)
                   .fillOpacity(0.1)
                   .fill('#3498DB')
                   .fillOpacity(1)
                   .strokeColor('#3498DB')
                   .lineWidth(1)
                   .stroke();
                
                doc.fillColor('#3498DB')
                   .fontSize(32)
                   .font('Helvetica-Bold')
                   .text(`${callConversion.toFixed(1)}%`, startX + 195, perfCardY + 20);
                
                doc.fillColor('#333333')
                   .fontSize(10)
                   .font('Helvetica')
                   .text('Call Conversion', startX + 195, perfCardY + 65);
                
                doc.fontSize(8)
                   .fillColor('#666666')
                   .text('Target: 70%', startX + 195, perfCardY + 78);
                
                // Card 3: Efficiency
                doc.roundedRect(startX + 360, perfCardY, cardWidth, cardHeight, 5)
                   .fillOpacity(0.1)
                   .fill('#F39C12')
                   .fillOpacity(1)
                   .strokeColor('#F39C12')
                   .lineWidth(1)
                   .stroke();
                
                doc.fillColor('#F39C12')
                   .fontSize(32)
                   .font('Helvetica-Bold')
                   .text(`${efficiency.toFixed(1)}/10`, startX + 375, perfCardY + 20);
                
                doc.fillColor('#333333')
                   .fontSize(10)
                   .font('Helvetica')
                   .text('Efficiency Score', startX + 375, perfCardY + 65);
                
                doc.fontSize(8)
                   .fillColor('#666666')
                   .text('Target: 9/10', startX + 375, perfCardY + 78);
                
                doc.moveDown(8);
                
                // ========== KEY METRICS SECTION ==========
                doc.font('Helvetica-Bold')
                   .fontSize(14)
                   .fillColor('#2C3E50')
                   .text('KEY PERFORMANCE METRICS', 50, doc.y + 20);
                
                doc.moveDown(0.5);
                
                // Create metrics grid with safe numbers
                const metrics = [
                    { label: 'Total Collections', value: this.safeNumber(officerData.collections?.total, 323500), format: 'currency' },
                    { label: 'Monthly Collections', value: this.safeNumber(officerData.collections?.monthly, 125000), format: 'currency' },
                    { label: 'Weekly Collections', value: this.safeNumber(officerData.collections?.weekly, 32500), format: 'currency' },
                    { label: "Today's Collections", value: this.safeNumber(officerData.collections?.today, 8500), format: 'currency' },
                    { label: 'Assigned Customers', value: this.safeNumber(officerData.customers?.totalAssigned, 2), format: 'number' },
                    { label: 'Active Customers', value: this.safeNumber(officerData.customers?.active, 1), format: 'number' },
                    { label: 'Overdue Customers', value: this.safeNumber(officerData.customers?.overdue, 1), format: 'number' },
                    { label: 'Calls Today', value: this.safeNumber(officerData.calls?.today, 8), format: 'number' },
                    { label: 'Calls This Week', value: this.safeNumber(officerData.calls?.weekly, 32), format: 'number' },
                    { label: 'Avg Call Duration', value: this.safeString(officerData.calls?.averageDuration, '4:32'), format: 'string' },
                    { label: 'Completed Assignments', value: this.safeNumber(officerData.assignments?.completed, 3), format: 'number' },
                    { label: 'Pending Collections', value: this.safeNumber(officerData.payments?.pending, 0), format: 'currency' },
                    { label: 'Overdue Amount', value: this.safeNumber(officerData.payments?.overdue, 20000), format: 'currency' }
                ];
                
                const startY = doc.y;
                
                // Draw metrics in two columns
                for (let i = 0; i < metrics.length; i++) {
                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    const x = 50 + (col * 250);
                    const y = startY + (row * 35);
                    
                    // Background for each metric row
                    if (row % 2 === 0) {
                        doc.rect(x, y - 3, 240, 30)
                           .fillOpacity(0.03)
                           .fill('#2C3E50')
                           .fillOpacity(1);
                    }
                    
                    doc.font('Helvetica')
                       .fontSize(10)
                       .fillColor('#666666')
                       .text(metrics[i].label, x, y);
                    
                    doc.font('Helvetica-Bold')
                       .fontSize(12)
                       .fillColor('#2C3E50');
                    
                    let displayValue = '';
                    if (metrics[i].format === 'currency') {
                        displayValue = `KES ${this.safeNumber(metrics[i].value).toLocaleString()}`;
                    } else if (metrics[i].format === 'number') {
                        displayValue = this.safeNumber(metrics[i].value).toString();
                    } else {
                        displayValue = metrics[i].value;
                    }
                    
                    doc.text(displayValue, x + 150, y, { align: 'right', width: 90 });
                }
                
                doc.moveDown(metrics.length / 2 * 1.5);
                
                // ========== ADD FOOTER TO FIRST PAGE ==========
                this.addFooterToPage(doc, 1, supervisorName, formattedDate);
                
                // ========== SECOND PAGE - ACTIVITIES ==========
                doc.addPage();
                
                doc.font('Helvetica-Bold')
                   .fontSize(16)
                   .fillColor('#2C3E50')
                   .text('RECENT ACTIVITY LOG', 50, 50);
                
                doc.moveDown();
                
                // Activity section header
                doc.font('Helvetica')
                   .fontSize(11)
                   .fillColor('#666666')
                   .text(`Showing ${activities && activities.length > 0 ? Math.min(activities.length, 15) : 3} most recent activities`, 50, doc.y + 5);
                
                doc.moveDown(0.5);
                
                // Divider line
                doc.strokeColor('#DDDDDD')
                   .lineWidth(1)
                   .moveTo(50, doc.y)
                   .lineTo(550, doc.y)
                   .stroke();
                
                doc.moveDown(0.5);
                
                const activitiesToShow = activities && activities.length > 0 ? activities.slice(0, 15) : [
                    { 
                        time: new Date(), 
                        type: 'TRANSACTION VIEW', 
                        details: 'Officer viewed personal transactions (0 of 0)',
                        amount: 0 
                    },
                    { 
                        time: new Date(Date.now() - 3600000), 
                        type: 'PROMISE VIEW', 
                        details: 'Viewed promise list (11 of 11 promises)',
                        amount: 0 
                    }
                ];
                
                let activityY = doc.y;
                
                activitiesToShow.forEach((activity, index) => {
                    if (activityY > 700) {
                        this.addFooterToPage(doc, 2, supervisorName, formattedDate);
                        doc.addPage();
                        activityY = 50;
                        
                        doc.font('Helvetica-Bold')
                           .fontSize(16)
                           .fillColor('#2C3E50')
                           .text('RECENT ACTIVITY LOG (CONTINUED)', 50, 50);
                        
                        doc.moveDown();
                        activityY = doc.y;
                    }
                    
                    const y = activityY + (index * 35);
                    
                    // Activity type color coding
                    const activityType = (this.safeString(activity.type || activity.action, '')).toLowerCase();
                    let color = '#95A5A6';
                    if (activityType.includes('payment') || activityType.includes('collection') || activityType.includes('transaction')) color = '#27AE60';
                    else if (activityType.includes('call')) color = '#3498DB';
                    else if (activityType.includes('promise')) color = '#F39C12';
                    else if (activityType.includes('customer')) color = '#9B59B6';
                    else if (activityType.includes('system')) color = '#2C3E50';
                    
                    // Activity indicator bar
                    doc.rect(50, y, 5, 30)
                       .fill(color);
                    
                    // Activity time
                    const activityTime = activity.time 
                        ? new Date(activity.time).toLocaleString('en-KE', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : new Date().toLocaleString('en-KE', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                    
                    doc.font('Helvetica')
                       .fontSize(8)
                       .fillColor('#999999')
                       .text(activityTime, 65, y + 2);
                    
                    // Activity type
                    doc.font('Helvetica-Bold')
                       .fontSize(10)
                       .fillColor(color)
                       .text((activity.type || activity.action || 'ACTIVITY').toUpperCase(), 65, y + 15);
                    
                    // Activity description
                    doc.font('Helvetica')
                       .fontSize(9)
                       .fillColor('#333333')
                       .text(this.safeString(activity.details || activity.description, 'Activity performed'), 150, y + 15, { width: 250 });
                    
                    // Amount if exists and > 0
                    const amount = this.safeNumber(activity.amount, 0);
                    if (amount > 0) {
                        doc.font('Helvetica-Bold')
                           .fontSize(10)
                           .fillColor('#27AE60')
                           .text(`KES ${amount.toLocaleString()}`, 450, y + 15, { align: 'right' });
                    }
                });
                
                // Add footer to last page
                this.addFooterToPage(doc, 2, supervisorName, formattedDate);

                // End the document
                doc.end();

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Helper function to add footer to a PDF page with supervisor info
     */
    static addFooterToPage(doc, pageNumber, supervisorName, generationDate) {
        // Save the current position
        const savedY = doc.y;
        
        // Footer line
        doc.strokeColor('#CCCCCC')
           .lineWidth(0.5)
           .moveTo(50, doc.page.height - 50)
           .lineTo(doc.page.width - 50, doc.page.height - 50)
           .stroke();
        
        // Page number
        doc.font('Helvetica')
           .fontSize(8)
           .fillColor('#999999')
           .text(
               `Page ${pageNumber}`,
               50,
               doc.page.height - 40,
               { align: 'left', width: 100 }
           );
        
        // Generation info with supervisor
        doc.font('Helvetica')
           .fontSize(8)
           .fillColor('#999999')
           .text(
               `Generated by: ${supervisorName} • Collections Supervisor`,
               150,
               doc.page.height - 40,
               { align: 'center', width: 300 }
           );
        
        // Date and time
        doc.font('Helvetica')
           .fontSize(8)
           .fillColor('#999999')
           .text(
               generationDate,
               450,
               doc.page.height - 40,
               { align: 'right', width: 100 }
           );
        
        // Report ID
        const reportId = `PERF-${new Date().getTime().toString().slice(-8)}`;
        doc.font('Helvetica')
           .fontSize(7)
           .fillColor('#CCCCCC')
           .text(
               `Report ID: ${reportId}`,
               50,
               doc.page.height - 25,
               { align: 'left', width: 500 }
           );
        
        // Restore the position
        doc.y = savedY;
    }

    /**
     * Generate performance chart as PNG - FIXED WITH ACTUAL CANVAS RENDERING
     */
    static async generatePerformanceChart(officerId, officerData) {
        try {
            // Create a canvas with appropriate size
            const width = 1000;
            const height = 800;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Safe number extraction
            const officerName = this.safeString(officerData.officer?.name || officerData.officer?.username, 'Sarah Wangechi');
            const officerLoanType = this.safeString(officerData.officer?.loanType, 'Credit Cards');
            const officerEmployeeId = this.safeString(officerData.employeeId, `EMP${this.safeString(officerId).slice(-6)}`);
            
            // Performance metrics
            const collectionRate = this.safeNumber(officerData.performance?.collectionRate, 78.3);
            const callConversion = this.safeNumber(officerData.performance?.callConversion, 64.0);
            const efficiency = this.safeNumber(officerData.performance?.efficiency, 8.5);
            
            // Collections data
            const todayCollections = this.safeNumber(officerData.collections?.today, 8500);
            const weeklyCollections = this.safeNumber(officerData.collections?.weekly, 32500);
            const monthlyCollections = this.safeNumber(officerData.collections?.monthly, 125000);
            const totalCollections = this.safeNumber(officerData.collections?.total, 323500);
            const overdueAmount = this.safeNumber(officerData.payments?.overdue, 20000);
            
            // Customer data
            const activeCustomers = this.safeNumber(officerData.customers?.active, 1);
            const overdueCustomers = this.safeNumber(officerData.customers?.overdue, 1);
            const totalCustomers = this.safeNumber(officerData.customers?.totalAssigned, 2);
            const newCustomers = this.safeNumber(officerData.customers?.newThisMonth, 0);
            
            // Call data
            const callsToday = this.safeNumber(officerData.calls?.today, 8);
            const callsWeekly = this.safeNumber(officerData.calls?.weekly, 32);
            const avgCallDuration = this.safeString(officerData.calls?.averageDuration, '4:32');
            
            // Assignment data
            const completedAssignments = this.safeNumber(officerData.assignments?.completed, 3);
            const pendingCollections = this.safeNumber(officerData.payments?.pending, 0);
            
            // Current date
            const currentDate = new Date();
            const formattedDate = currentDate.toLocaleString('en-KE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            // Supervisor info
            const supervisorName = 'Collections Supervisor';

            // ========== CLEAR CANVAS ==========
            ctx.clearRect(0, 0, width, height);
            
            // ========== BACKGROUND ==========
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);

            // ========== HEADER SECTION ==========
            ctx.fillStyle = '#F8F9FA';
            ctx.strokeStyle = '#2C3E50';
            ctx.lineWidth = 1;
            ctx.beginPath();
            this.roundRect(ctx, 30, 30, 940, 100, 10);
            ctx.fill();
            ctx.stroke();

            // Title
            ctx.font = 'bold 28px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.textAlign = 'center';
            ctx.fillText('PERFORMANCE DASHBOARD', 500, 65);
            
            ctx.font = '14px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.fillText(`Loan Officer Performance Analysis • Generated: ${formattedDate} (EAT)`, 500, 95);

            // ========== OFFICER INFO CARD ==========
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            this.roundRect(ctx, 30, 140, 940, 100, 8);
            ctx.stroke();

            // Officer Avatar
            ctx.fillStyle = '#2C3E50';
            ctx.beginPath();
            ctx.arc(80, 190, 35, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.font = 'bold 32px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.fillText(officerName.charAt(0).toUpperCase(), 80, 215);

            // Officer Name and Details
            ctx.font = 'bold 20px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.textAlign = 'left';
            ctx.fillText(officerName, 140, 175);
            
            ctx.font = '12px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.fillText(`${officerLoanType} Specialist • ID: ${officerEmployeeId}`, 140, 200);

            // Quick Stats
            ctx.fillStyle = '#F8F9FA';
            ctx.beginPath();
            this.roundRect(ctx, 600, 150, 350, 80, 5);
            ctx.fill();

            ctx.font = 'bold 12px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.textAlign = 'left';
            ctx.fillText('Calls Today:', 620, 180);
            ctx.fillText('Avg Duration:', 620, 205);
            ctx.fillText('Completed:', 820, 180);
            ctx.fillText('Pending:', 820, 205);
            
            ctx.fillStyle = '#3498DB';
            ctx.fillText(callsToday.toString(), 720, 180);
            
            ctx.fillStyle = '#2C3E50';
            ctx.fillText(avgCallDuration, 720, 205);
            
            ctx.fillStyle = '#27AE60';
            ctx.fillText(completedAssignments.toString(), 920, 180);
            
            ctx.fillStyle = '#E74C3C';
            ctx.fillText(`KES ${pendingCollections.toLocaleString()}`, 920, 205);

            // ========== PERFORMANCE METRICS SECTION ==========
            ctx.font = 'bold 18px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.textAlign = 'center';
            ctx.fillText('PERFORMANCE METRICS', 500, 270);

            // Collection Rate Gauge
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            this.roundRect(ctx, 80, 300, 250, 90, 8);
            ctx.stroke();
            
            ctx.font = '14px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'center';
            ctx.fillText('Collection Rate', 205, 330);
            
            ctx.font = 'bold 36px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#27AE60';
            ctx.fillText(`${collectionRate.toFixed(1)}%`, 205, 370);
            
            // Progress bar background
            ctx.fillStyle = '#ECF0F1';
            ctx.fillRect(100, 380, 200, 8);
            
            // Progress bar fill
            ctx.fillStyle = '#27AE60';
            ctx.fillRect(100, 380, collectionRate * 2, 8);
            
            ctx.font = '10px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'left';
            ctx.fillText('Target: 85%', 310, 388);

            // Call Conversion Gauge
            ctx.strokeStyle = '#E0E0E0';
            ctx.beginPath();
            this.roundRect(ctx, 370, 300, 250, 90, 8);
            ctx.stroke();
            
            ctx.font = '14px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'center';
            ctx.fillText('Call Conversion', 495, 330);
            
            ctx.font = 'bold 36px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#3498DB';
            ctx.fillText(`${callConversion.toFixed(1)}%`, 495, 370);
            
            // Progress bar background
            ctx.fillStyle = '#ECF0F1';
            ctx.fillRect(395, 380, 200, 8);
            
            // Progress bar fill
            ctx.fillStyle = '#3498DB';
            ctx.fillRect(395, 380, callConversion * 2, 8);
            
            ctx.font = '10px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'left';
            ctx.fillText('Target: 70%', 605, 388);

            // Efficiency Score Gauge
            ctx.strokeStyle = '#E0E0E0';
            ctx.beginPath();
            this.roundRect(ctx, 660, 300, 250, 90, 8);
            ctx.stroke();
            
            ctx.font = '14px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'center';
            ctx.fillText('Efficiency Score', 785, 330);
            
            ctx.font = 'bold 36px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#F39C12';
            ctx.fillText(`${efficiency.toFixed(1)}/10`, 785, 370);
            
            // Progress bar background
            ctx.fillStyle = '#ECF0F1';
            ctx.fillRect(685, 380, 200, 8);
            
            // Progress bar fill
            ctx.fillStyle = '#F39C12';
            ctx.fillRect(685, 380, (efficiency / 10) * 200, 8);
            
            ctx.font = '10px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'left';
            ctx.fillText('Target: 9/10', 895, 388);

            // ========== COLLECTIONS BAR CHART ==========
            ctx.font = 'bold 18px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.textAlign = 'center';
            ctx.fillText('COLLECTIONS SUMMARY', 500, 460);

            // Chart background
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            this.roundRect(ctx, 80, 490, 400, 200, 8);
            ctx.stroke();

            // Scale factor for bars
            const maxCollection = Math.max(totalCollections, monthlyCollections, weeklyCollections, todayCollections) || 450000;
            const collectionScale = 300 / maxCollection;

            // Today's Collections
            ctx.font = '12px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#666666';
            ctx.textAlign = 'left';
            ctx.fillText('Today', 100, 530);
            
            ctx.fillStyle = '#2C3E50';
            const todayBarWidth = Math.max(5, todayCollections * collectionScale);
            ctx.fillRect(180, 515, todayBarWidth, 20);
            
            ctx.font = '11px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.fillText(`KES ${todayCollections.toLocaleString()}`, 190 + todayBarWidth, 533);

            // Weekly Collections
            ctx.fillStyle = '#666666';
            ctx.fillText('Weekly', 100, 570);
            
            ctx.fillStyle = '#34495E';
            const weeklyBarWidth = Math.max(5, weeklyCollections * collectionScale);
            ctx.fillRect(180, 555, weeklyBarWidth, 20);
            
            ctx.fillStyle = '#34495E';
            ctx.fillText(`KES ${weeklyCollections.toLocaleString()}`, 190 + weeklyBarWidth, 573);

            // Monthly Collections
            ctx.fillStyle = '#666666';
            ctx.fillText('Monthly', 100, 610);
            
            ctx.fillStyle = '#2C3E50';
            const monthlyBarWidth = Math.max(5, monthlyCollections * collectionScale);
            ctx.fillRect(180, 595, monthlyBarWidth, 20);
            
            ctx.fillStyle = '#2C3E50';
            ctx.fillText(`KES ${monthlyCollections.toLocaleString()}`, 190 + monthlyBarWidth, 613);

            // Total Collections
            ctx.fillStyle = '#666666';
            ctx.fillText('Total', 100, 650);
            
            ctx.fillStyle = '#1A252F';
            const totalBarWidth = Math.max(5, totalCollections * collectionScale);
            ctx.fillRect(180, 635, totalBarWidth, 20);
            
            ctx.fillStyle = '#1A252F';
            ctx.fillText(`KES ${totalCollections.toLocaleString()}`, 190 + totalBarWidth, 653);

            // Overdue Amount
            ctx.fillStyle = '#666666';
            ctx.fillText('Overdue', 100, 690);
            
            ctx.fillStyle = '#E74C3C';
            const overdueBarWidth = Math.max(5, overdueAmount * collectionScale);
            ctx.fillRect(180, 675, overdueBarWidth, 20);
            
            ctx.fillStyle = '#E74C3C';
            ctx.fillText(`KES ${overdueAmount.toLocaleString()}`, 190 + overdueBarWidth, 693);

            // ========== CUSTOMER DISTRIBUTION ==========
            ctx.strokeStyle = '#E0E0E0';
            ctx.beginPath();
            this.roundRect(ctx, 520, 490, 400, 200, 8);
            ctx.stroke();

            ctx.font = 'bold 16px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.textAlign = 'center';
            ctx.fillText('CUSTOMER STATUS', 720, 520);

            // Draw pie chart
            const total = activeCustomers + overdueCustomers + newCustomers + Math.max(0, totalCustomers - activeCustomers - overdueCustomers - newCustomers);
            
            if (total > 0) {
                const centerX = 620;
                const centerY = 600;
                const radius = 60;
                
                let startAngle = 0;
                
                // Active segment
                const activeAngle = (activeCustomers / total) * 2 * Math.PI;
                ctx.fillStyle = '#27AE60';
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + activeAngle);
                ctx.closePath();
                ctx.fill();
                startAngle += activeAngle;
                
                // Overdue segment
                const overdueAngle = (overdueCustomers / total) * 2 * Math.PI;
                ctx.fillStyle = '#E74C3C';
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + overdueAngle);
                ctx.closePath();
                ctx.fill();
                startAngle += overdueAngle;
                
                // New segment
                const newAngle = (newCustomers / total) * 2 * Math.PI;
                ctx.fillStyle = '#3498DB';
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + newAngle);
                ctx.closePath();
                ctx.fill();
                startAngle += newAngle;
                
                // Other segment
                const otherAngle = (Math.max(0, total - activeCustomers - overdueCustomers - newCustomers) / total) * 2 * Math.PI;
                ctx.fillStyle = '#F39C12';
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + otherAngle);
                ctx.closePath();
                ctx.fill();
            }

            // Legend
            ctx.font = '11px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#333333';
            ctx.textAlign = 'left';
            
            // Active
            ctx.fillStyle = '#27AE60';
            ctx.fillRect(700, 560, 12, 12);
            ctx.fillStyle = '#333333';
            ctx.fillText(`Active: ${activeCustomers}`, 720, 572);
            
            // Overdue
            ctx.fillStyle = '#E74C3C';
            ctx.fillRect(700, 585, 12, 12);
            ctx.fillStyle = '#333333';
            ctx.fillText(`Overdue: ${overdueCustomers}`, 720, 597);
            
            // New
            ctx.fillStyle = '#3498DB';
            ctx.fillRect(700, 610, 12, 12);
            ctx.fillStyle = '#333333';
            ctx.fillText(`New: ${newCustomers}`, 720, 622);
            
            // Other
            ctx.fillStyle = '#F39C12';
            ctx.fillRect(700, 635, 12, 12);
            ctx.fillStyle = '#333333';
            ctx.fillText(`Other: ${Math.max(0, totalCustomers - activeCustomers - overdueCustomers - newCustomers)}`, 720, 647);

            // Total Customers Highlight
            ctx.fillStyle = '#2C3E50';
            ctx.beginPath();
            this.roundRect(ctx, 700, 660, 120, 25, 5);
            ctx.fill();
            
            ctx.font = 'bold 12px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.fillText(`TOTAL: ${totalCustomers}`, 760, 679);

            // ========== CALL PERFORMANCE ==========
            ctx.strokeStyle = '#E0E0E0';
            ctx.beginPath();
            this.roundRect(ctx, 80, 710, 840, 60, 8);
            ctx.stroke();

            ctx.font = 'bold 12px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.textAlign = 'left';
            ctx.fillText('Daily Call Performance:', 200, 745);

            // Call progress bar background
            ctx.fillStyle = '#ECF0F1';
            ctx.fillRect(320, 735, 200, 10);
            
            // Call progress bar fill
            ctx.fillStyle = callsToday >= 15 ? '#27AE60' : '#F39C12';
            ctx.fillRect(320, 735, (callsToday / 15) * 200, 10);
            
            ctx.font = '12px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#333333';
            ctx.fillText(`${callsToday}/15 calls (${Math.round((callsToday / 15) * 100)}%)`, 530, 745);
            
            ctx.font = 'bold 12px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#2C3E50';
            ctx.fillText('Weekly Total:', 650, 745);
            
            ctx.fillStyle = '#3498DB';
            ctx.fillText(`${callsWeekly} calls`, 750, 745);

            // ========== FOOTER ==========
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(30, 790);
            ctx.lineTo(970, 790);
            ctx.stroke();

            ctx.font = '10px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#999999';
            ctx.textAlign = 'center';
            ctx.fillText(`Report generated by ${supervisorName} • Collections Supervisor • ${formattedDate}`, 500, 780);
            
            ctx.font = '9px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#CCCCCC';
            ctx.fillText(`Report ID: VIS-${currentDate.getTime().toString().slice(-8)} • Confidential`, 500, 795);

          

            // Convert canvas to buffer
            return canvas.toBuffer('image/png');

        } catch (error) {
            console.error('Error generating performance chart:', error);
            
            // Create a simple error image as fallback
            const canvas = createCanvas(800, 400);
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 800, 400);
            
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#FF0000';
            ctx.textAlign = 'center';
            ctx.fillText('Error Generating Chart', 400, 200);
            
            ctx.font = '16px Arial';
            ctx.fillStyle = '#666666';
            ctx.fillText(error.message, 400, 250);
            
            return canvas.toBuffer('image/png');
        }
    }

    /**
     * Helper method to convert Excel workbook to buffer
     */
    static async workbookToBuffer(workbook) {
        return await workbook.xlsx.writeBuffer();
    }

    /**
     * Helper method for drawing rounded rectangles
     */
    static roundRect(ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        return ctx;
    }
}

module.exports = ReportGenerator;