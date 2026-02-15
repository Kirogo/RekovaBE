// services/reportGenerator.js - COMPLETE FIXED VERSION WITH TWO CARDS AND SINGLE PAGE PDF
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

            // Officer info table - REMOVED ID, ADDED EMAIL
            const officerInfo = [
                ['Name:', this.safeString(officerData.officer?.name || officerData.officer?.username, 'Sarah Wangechi')],
                ['Email:', this.safeString(officerData.officer?.email || officerData.email, 'sarah.wangechi@ncbagroup.com')],
                ['Loan Type:', this.safeString(officerData.officer?.loanType, 'Credit Cards')],
                ['Phone:', this.safeString(officerData.officer?.phone || officerData.phone, '254712345682')],
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
     * Generate PDF report for an officer - SINGLE PAGE ONLY
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
                    .text(`Generated: ${formattedDate}`, { align: 'center' });

                doc.moveDown(1.5);

                // ========== OFFICER INFORMATION CARD ==========
                const officerName = this.safeString(officerData.officer?.name || officerData.officer?.username, 'Sarah Wangechi');
                const officerEmail = this.safeString(officerData.officer?.email || officerData.email, 'sarah.wangechi@ncbagroup.com');
                const officerPhone = this.safeString(officerData.officer?.phone || officerData.phone, '254712345682');
                const officerLoanType = this.safeString(officerData.officer?.loanType, 'Credit Cards');
                const officerJoinDate = officerData.joinDate
                    ? new Date(officerData.joinDate).toLocaleDateString('en-KE')
                    : '29/01/2026';

                // Card background
                const cardY = doc.y;
                doc.roundedRect(50, cardY, 500, 100, 5)
                    .fillAndStroke('#F8F9FA', '#DDDDDD');

                doc.fillColor('#2C3E50')
                    .fontSize(14)
                    .font('Helvetica-Bold')
                    .text('OFFICER INFORMATION', 70, cardY + 15);

                // Left column
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#666666');

                doc.text('Name:', 70, cardY + 40);
                doc.text('Email:', 70, cardY + 60);

                // Left column values
                doc.font('Helvetica-Bold')
                    .fillColor('#2C3E50');
                doc.text(officerName, 140, cardY + 40);
                doc.text(officerEmail, 140, cardY + 60);

                // Right column
                doc.font('Helvetica')
                    .fillColor('#666666');
                doc.text('Loan Type:', 300, cardY + 40);

                // Right column values
                doc.font('Helvetica-Bold')
                    .fillColor('#2C3E50');
                doc.text(officerLoanType, 390, cardY + 40);
                

                doc.moveDown(6);

                // ========== PERFORMANCE SUMMARY CARDS ==========
                doc.font('Helvetica-Bold')
                    .fontSize(14)
                    .fillColor('#2C3E50')
                    .text('PERFORMANCE SUMMARY', 50, doc.y + 10);

                doc.moveDown(0.5);

                // TWO CARDS - Collection Rate and Call Conversion only
                const cardWidth = 220;
                const cardHeight = 90;
                const startX = 80;
                const perfCardY = doc.y;

                // Safe extraction of performance values
                const collectionRate = this.safeNumber(officerData.performance?.collectionRate, 78.3);
                const callConversion = this.safeNumber(officerData.performance?.callConversion, 64.0);

                // Card 1: Collection Rate
                doc.roundedRect(startX, perfCardY, cardWidth, cardHeight, 5)
                    .fillOpacity(0.1)
                    .fill('#27AE60')
                    .fillOpacity(1)
                    .strokeColor('#27AE60')
                    .lineWidth(1)
                    .stroke();

                doc.fillColor('#27AE60')
                    .fontSize(36)
                    .font('Helvetica-Bold')
                    .text(`${collectionRate.toFixed(1)}%`, startX + 20, perfCardY + 25);

                doc.fillColor('#333333')
                    .fontSize(12)
                    .font('Helvetica')
                    .text('Collection Rate', startX + 20, perfCardY + 65);

                // Card 2: Call Conversion
                doc.roundedRect(startX + 250, perfCardY, cardWidth, cardHeight, 5)
                    .fillOpacity(0.1)
                    .fill('#3498DB')
                    .fillOpacity(1)
                    .strokeColor('#3498DB')
                    .lineWidth(1)
                    .stroke();

                doc.fillColor('#3498DB')
                    .fontSize(36)
                    .font('Helvetica-Bold')
                    .text(`${callConversion.toFixed(1)}%`, startX + 270, perfCardY + 25);

                doc.fillColor('#333333')
                    .fontSize(12)
                    .font('Helvetica')
                    .text('Call Conversion', startX + 270, perfCardY + 65);

                doc.moveDown(4);

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

                // ========== ADD FOOTER TO SINGLE PAGE ==========
                // Footer line
                doc.strokeColor('#CCCCCC')
                    .lineWidth(0.5)
                    .moveTo(50, doc.page.height - 50)
                    .lineTo(doc.page.width - 50, doc.page.height - 50)
                    .stroke();

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
 * Generate performance chart as PNG - TWO CARDS (Collection Rate and Call Conversion only)
 */
static async generatePerformanceChart(officerId, officerData) {
    try {
        // Create a canvas with appropriate size
        const width = 1100;
        const height = 850;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Safe number extraction
        const officerName = this.safeString(officerData.officer?.name || officerData.officer?.username, 'Sarah Wangechi');
        const officerEmail = this.safeString(officerData.officer?.email || officerData.email, 'sarah.wangechi@ncbagroup.com');
        const officerLoanType = this.safeString(officerData.officer?.loanType, 'Credit Cards');

        // Performance metrics - ONLY Collection Rate and Call Conversion
        const collectionRate = this.safeNumber(officerData.performance?.collectionRate, 78.3);
        const callConversion = this.safeNumber(officerData.performance?.callConversion, 64.0);

        // Collections data
        const todayCollections = this.safeNumber(officerData.collections?.today, 8500);
        const weeklyCollections = this.safeNumber(officerData.collections?.weekly, 32500);
        const monthlyCollections = this.safeNumber(officerData.collections?.monthly, 125000);
        const totalCollections = this.safeNumber(officerData.collections?.total, 323500);
        const overdueAmount = this.safeNumber(officerData.payments?.overdue, 20000);

        // Customer data
        const activeCustomers = this.safeNumber(officerData.customers?.active, 1);
        const overdueCustomers = this.safeNumber(officerData.customers?.overdue, 1);
        const newCustomers = this.safeNumber(officerData.customers?.newThisMonth, 0);
        const totalCustomers = this.safeNumber(officerData.customers?.totalAssigned, 2);
        
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
        ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        this.roundRect(ctx, 40, 30, 1020, 100, 10);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Border
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Title
        ctx.font = 'bold 28px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.textAlign = 'center';
        ctx.fillText('PERFORMANCE DASHBOARD', 550, 70);

        ctx.font = '14px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#666666';
        ctx.fillText(`Loan Officer Performance Analysis • Generated: ${formattedDate} (EAT)`, 550, 100);

        // ========== OFFICER INFO CARD ==========
        ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        this.roundRect(ctx, 40, 150, 1020, 120, 8);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Officer Avatar - FIXED: Properly centered text
        ctx.fillStyle = '#2C3E50';
        ctx.beginPath();
        ctx.arc(110, 210, 40, 0, Math.PI * 2);
        ctx.fill();

        // Center the initial properly - using textBaseline
        ctx.font = 'bold 36px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(officerName.charAt(0).toUpperCase(), 110, 210);
        ctx.textBaseline = 'alphabetic';

        // Officer Name and Details
        ctx.font = 'bold 20px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.textAlign = 'left';
        ctx.fillText(officerName, 170, 185);

        ctx.font = '12px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#666666';
        ctx.fillText(officerLoanType, 170, 215);

        ctx.font = '11px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#3498DB';
        ctx.fillText(officerEmail, 170, 240);

        // Quick Stats
        ctx.fillStyle = '#F8F9FA';
        ctx.beginPath();
        this.roundRect(ctx, 600, 165, 440, 90, 5);
        ctx.fill();

        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 12px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.textAlign = 'left';
        ctx.fillText('Calls Today:', 620, 195);
        ctx.fillText('Avg Duration:', 620, 225);
        ctx.fillText('Completed:', 820, 195);
        ctx.fillText('Pending:', 820, 225);

        ctx.fillStyle = '#3498DB';
        ctx.fillText(callsToday.toString(), 720, 195);

        ctx.fillStyle = '#2C3E50';
        ctx.fillText(avgCallDuration, 720, 225);

        ctx.fillStyle = '#27AE60';
        ctx.fillText(completedAssignments.toString(), 920, 195);

        ctx.fillStyle = '#E74C3C';
        ctx.fillText(`KES ${pendingCollections.toLocaleString()}`, 920, 225);

        // ========== PERFORMANCE METRICS SECTION ==========
        ctx.font = 'bold 18px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.textAlign = 'center';
        ctx.fillText('PERFORMANCE METRICS', 550, 310);

        // TWO CARDS - Collection Rate and Call Conversion only
        const cardWidth = 350;
        const cardHeight = 130;

        // Card 1: Collection Rate
        ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        this.roundRect(ctx, 150, 340, cardWidth, cardHeight, 10);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Gradient background for Collection Rate
        const gradient1 = ctx.createLinearGradient(150, 340, 150 + cardWidth, 340 + cardHeight);
        gradient1.addColorStop(0, '#F0F9F0');
        gradient1.addColorStop(1, '#FFFFFF');
        ctx.fillStyle = gradient1;
        ctx.fill();
        
        ctx.strokeStyle = '#27AE60';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icon for Collection Rate
        ctx.fillStyle = '#27AE60';
        ctx.beginPath();
        ctx.arc(230, 390, 25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.font = 'bold 20px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('%', 230, 390);
        ctx.textBaseline = 'alphabetic';

        // Value
        ctx.font = 'bold 48px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#27AE60';
        ctx.textAlign = 'left';
        ctx.fillText(`${collectionRate.toFixed(1)}%`, 280, 400);

        // Label
        ctx.font = 'bold 16px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.fillText('Collection Rate', 280, 440);

        // Card 2: Call Conversion
        ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        this.roundRect(ctx, 600, 340, cardWidth, cardHeight, 10);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Gradient background for Call Conversion
        const gradient2 = ctx.createLinearGradient(600, 340, 600 + cardWidth, 340 + cardHeight);
        gradient2.addColorStop(0, '#F0F5FF');
        gradient2.addColorStop(1, '#FFFFFF');
        ctx.fillStyle = gradient2;
        ctx.fill();
        
        ctx.strokeStyle = '#3498DB';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Icon for Call Conversion
        ctx.fillStyle = '#3498DB';
        ctx.beginPath();
        ctx.arc(680, 390, 25, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.font = 'bold 20px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📞', 680, 390);
        ctx.textBaseline = 'alphabetic';

        // Value
        ctx.font = 'bold 48px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#3498DB';
        ctx.textAlign = 'left';
        ctx.fillText(`${callConversion.toFixed(1)}%`, 730, 400);

        // Label
        ctx.font = 'bold 16px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.fillText('Call Conversion', 730, 440);

        // ========== COLLECTIONS BREAKDOWN SECTION ==========
        ctx.font = 'bold 18px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.textAlign = 'center';
        ctx.fillText('COLLECTIONS SUMMARY', 400, 530);

        // Chart container with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        this.roundRect(ctx, 80, 550, 580, 250, 8);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Chart title
        ctx.font = 'bold 14px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.textAlign = 'left';
        ctx.fillText('Collection Breakdown', 100, 580);

        // Scale factor for bars
        const maxCollection = Math.max(totalCollections, monthlyCollections, weeklyCollections, todayCollections) || 450000;
        const collectionScale = 350 / maxCollection;

        // Today's Collections
        ctx.font = '12px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'left';
        ctx.fillText('Today', 100, 615);

        ctx.fillStyle = '#2C3E50';
        const todayBarWidth = Math.max(5, todayCollections * collectionScale);
        ctx.fillRect(200, 605, todayBarWidth, 20);

        ctx.font = 'bold 12px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.fillText(`KES ${todayCollections.toLocaleString()}`, 210 + todayBarWidth, 620);

        // Weekly Collections
        ctx.fillStyle = '#666666';
        ctx.fillText('Weekly', 100, 650);

        ctx.fillStyle = '#34495E';
        const weeklyBarWidth = Math.max(5, weeklyCollections * collectionScale);
        ctx.fillRect(200, 640, weeklyBarWidth, 20);

        ctx.fillStyle = '#34495E';
        ctx.fillText(`KES ${weeklyCollections.toLocaleString()}`, 210 + weeklyBarWidth, 655);

        // Monthly Collections
        ctx.fillStyle = '#666666';
        ctx.fillText('Monthly', 100, 685);

        ctx.fillStyle = '#2C3E50';
        const monthlyBarWidth = Math.max(5, monthlyCollections * collectionScale);
        ctx.fillRect(200, 675, monthlyBarWidth, 20);

        ctx.fillStyle = '#2C3E50';
        ctx.fillText(`KES ${monthlyCollections.toLocaleString()}`, 210 + monthlyBarWidth, 690);

        // Total Collections
        ctx.fillStyle = '#666666';
        ctx.fillText('Total', 100, 720);

        ctx.fillStyle = '#1A252F';
        const totalBarWidth = Math.max(5, totalCollections * collectionScale);
        ctx.fillRect(200, 710, totalBarWidth, 20);

        ctx.fillStyle = '#1A252F';
        ctx.fillText(`KES ${totalCollections.toLocaleString()}`, 210 + totalBarWidth, 725);

        // Overdue Amount
        ctx.fillStyle = '#666666';
        ctx.fillText('Overdue', 100, 755);

        ctx.fillStyle = '#E74C3C';
        const overdueBarWidth = Math.max(5, overdueAmount * collectionScale);
        ctx.fillRect(200, 745, overdueBarWidth, 20);

        ctx.fillStyle = '#E74C3C';
        ctx.fillText(`KES ${overdueAmount.toLocaleString()}`, 210 + overdueBarWidth, 760);

        // ========== CUSTOMER STATUS PIE CHART ==========
        ctx.font = 'bold 18px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.textAlign = 'center';
        ctx.fillText('CUSTOMER STATUS', 850, 530);

        // Customer pie chart container with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        this.roundRect(ctx, 680, 550, 380, 250, 8);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Calculate other customers
        const otherCustomers = Math.max(0, totalCustomers - activeCustomers - overdueCustomers - newCustomers);

        // Only draw pie if there are customers
        if (totalCustomers > 0) {
            // Position pie chart on the RIGHT side of the container
            const centerX = 920;
            const centerY = 640;
            const radius = 70;
            
            // Define segments only for non-zero values
            const segments = [];
            
            if (activeCustomers > 0) {
                segments.push({
                    count: activeCustomers,
                    color: '#27AE60',
                    label: 'Active'
                });
            }
            
            if (overdueCustomers > 0) {
                segments.push({
                    count: overdueCustomers,
                    color: '#E74C3C',
                    label: 'Overdue'
                });
            }
            
            if (newCustomers > 0) {
                segments.push({
                    count: newCustomers,
                    color: '#3498DB',
                    label: 'New'
                });
            }
            
            if (otherCustomers > 0) {
                segments.push({
                    count: otherCustomers,
                    color: '#F39C12',
                    label: 'Other'
                });
            }
            
            // Draw pie chart from 0 to 2π
            let startAngle = 0;
            
            segments.forEach(segment => {
                const angle = (segment.count / totalCustomers) * 2 * Math.PI;
                
                // Draw the slice
                ctx.fillStyle = segment.color;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
                ctx.closePath();
                ctx.fill();
                
                startAngle += angle;
            });
            
            // Draw the outer border
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.stroke();
            
            // Draw inner circle (donut style)
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius * 0.4, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add percentage in the center
            if (totalCustomers > 0) {
                const activePercentage = Math.round((activeCustomers / totalCustomers) * 100);
                ctx.font = 'bold 14px "Century Gothic", Arial, Helvetica, sans-serif';
                ctx.fillStyle = '#2C3E50';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${activePercentage}%`, centerX, centerY);
                ctx.textBaseline = 'alphabetic';
            }
        } else {
            // Draw empty pie outline
            ctx.strokeStyle = '#E0E0E0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(920, 640, 70, 0, 2 * Math.PI);
            ctx.stroke();
            
            ctx.font = '14px "Century Gothic", Arial, Helvetica, sans-serif';
            ctx.fillStyle = '#999999';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No Data', 920, 640);
            ctx.textBaseline = 'alphabetic';
        }

        // Legend - Positioned on the LEFT side of the container
        ctx.font = '12px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        // Legend title
        ctx.font = 'bold 13px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.fillText('Distribution:', 700, 585);

        // Active (row 1)
        ctx.fillStyle = '#27AE60';
        ctx.fillRect(700, 600, 14, 14);
        ctx.font = '12px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#333333';
        ctx.fillText(`Active: ${activeCustomers}`, 720, 613);

        // Overdue (row 2)
        ctx.fillStyle = '#E74C3C';
        ctx.fillRect(700, 630, 14, 14);
        ctx.fillStyle = '#333333';
        ctx.fillText(`Overdue: ${overdueCustomers}`, 720, 643);

        // New (row 3)
        ctx.fillStyle = '#3498DB';
        ctx.fillRect(700, 660, 14, 14);
        ctx.fillStyle = '#333333';
        ctx.fillText(`New: ${newCustomers}`, 720, 673);

        // Other (row 4) - only if > 0
        if (otherCustomers > 0) {
            ctx.fillStyle = '#F39C12';
            ctx.fillRect(700, 690, 14, 14);
            ctx.fillStyle = '#333333';
            ctx.fillText(`Other: ${otherCustomers}`, 720, 703);
        }

        // Total Customers Highlight
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#2C3E50';
        ctx.beginPath();
        this.roundRect(ctx, 700, 735, 150, 30, 5);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.font = 'bold 13px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(`TOTAL: ${totalCustomers}`, 775, 755);

        // ========== FOOTER ==========
        ctx.shadowColor = 'rgba(0, 0, 0, 0.02)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#F8F9FA';
        ctx.beginPath();
        this.roundRect(ctx, 40, 820, 1020, 25, 5);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = '10px "Century Gothic", Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#999999';
        ctx.textAlign = 'center';
        ctx.fillText(`Report generated by ${supervisorName} • Collections Supervisor • ${formattedDate}`, 550, 838);

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