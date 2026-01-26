// backend/controllers/promiseController.js - UPDATED VERSION

const PromiseModel = require('../models/Promise'); // Changed from Promise to PromiseModel
const Customer = require('../models/Customer');

class PromiseController {

    // Create a new promise
    static async createPromise(req, res) {
        try {
            console.log('🔍 createPromise called with body:', req.body);
            console.log('🔍 User from token:', req.user ? req.user.id : 'No user');

            const {
                customerId,
                promiseAmount,
                promiseDate,
                promiseType = 'FULL_PAYMENT',
                notes = ''
            } = req.body;

            // Validate required fields
            if (!customerId) {
                console.log('❌ Missing customerId');
                return res.status(400).json({
                    success: false,
                    message: 'Customer ID is required'
                });
            }

            if (!promiseAmount || isNaN(promiseAmount) || promiseAmount <= 0) {
                console.log('❌ Invalid promiseAmount:', promiseAmount);
                return res.status(400).json({
                    success: false,
                    message: 'Valid promise amount is required'
                });
            }

            if (!promiseDate) {
                console.log('❌ Missing promiseDate');
                return res.status(400).json({
                    success: false,
                    message: 'Promise date is required'
                });
            }

            // Parse date
            const promiseDateObj = new Date(promiseDate);
            if (isNaN(promiseDateObj.getTime())) {
                console.log('❌ Invalid date format:', promiseDate);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format. Please use YYYY-MM-DD format'
                });
            }

            // Find customer
            const customer = await Customer.findById(customerId);
            if (!customer) {
                console.log('❌ Customer not found with ID:', customerId);
                return res.status(404).json({
                    success: false,
                    message: 'Customer not found'
                });
            }

            console.log('✅ Customer found:', customer.name);

            // Check if promise amount exceeds loan balance (not arrears)
            const amount = parseFloat(promiseAmount);
            const loanBalance = parseFloat(customer.loanBalance || 0);
            const arrears = parseFloat(customer.arrears || 0);

            if (amount > loanBalance) {
                console.log('❌ Amount exceeds loan balance:', amount, '>', loanBalance);
                return res.status(400).json({
                    success: false,
                    message: `Promise amount (Ksh ${amount.toLocaleString()}) exceeds loan balance (Ksh ${loanBalance.toLocaleString()})`
                });
            }

            // Create promise
            // Calculate next follow-up date (1 day before promise)
            const nextFollowUpDate = new Date(promiseDateObj);
            nextFollowUpDate.setDate(nextFollowUpDate.getDate() - 1);

            // Generate promise ID
            const timestamp = Date.now().toString().slice(-8);
            const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            const promiseId = `PRM${timestamp}${random}`;

            // Create promise
            const promiseData = {
                customerId: customer._id,
                customerName: customer.name,
                phoneNumber: customer.phoneNumber,
                promiseAmount: amount,
                promiseDate: promiseDateObj,
                promiseType,
                notes,
                createdBy: req.user ? req.user.id : null,
                createdByName: req.user ? (req.user.username || req.user.name) : 'System',
                nextFollowUpDate
            };

            console.log('📝 Creating promise with data:', promiseData);

            const promise = await PromiseModel.create(promiseData);

            // Update customer with promise info
            customer.lastPromiseDate = new Date();
            customer.promiseCount = (customer.promiseCount || 0) + 1;
            await customer.save();

            console.log('✅ Promise created successfully:', promise.promiseId);

            res.status(201).json({
                success: true,
                message: 'Promise created successfully',
                data: { promise }
            });

        } catch (error) {
            console.error('❌ Create promise error:', error);
            console.error('❌ Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Server error creating promise',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // In promiseController.js - Update the getPromises method
    static async getPromises(req, res) {
        try {
            const {
                status,
                promiseType,
                startDate,
                endDate,
                customerName, // ADD THIS
                page = 1,
                limit = 20,
                sortBy = 'promiseDate',
                sortOrder = 'asc'
            } = req.query;

            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;

            // Build query
            const query = {};

            if (status) {
                query.status = status;
            }

            if (promiseType) {
                query.promiseType = promiseType;
            }

            // Date filtering
            if (startDate || endDate) {
                query.promiseDate = {};
                if (startDate) {
                    query.promiseDate.$gte = new Date(startDate);
                }
                if (endDate) {
                    query.promiseDate.$lte = new Date(endDate);
                }
            }

            // Customer name search - ADD THIS SECTION
            if (customerName && customerName.trim() !== '') {
                try {
                    // Find customers matching the name
                    const customers = await Customer.find({
                        name: { $regex: customerName, $options: 'i' }
                    }).select('_id');

                    const customerIds = customers.map(customer => customer._id);

                    if (customerIds.length > 0) {
                        query.customerId = { $in: customerIds };
                    } else {
                        // Return empty results if no customers found
                        query.customerId = { $in: [] };
                    }
                } catch (error) {
                    console.error('Error searching customers:', error);
                    return res.status(500).json({
                        success: false,
                        message: 'Error searching customers'
                    });
                }
            }

            // Sorting
            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            // Execute queries
            const [promises, total, pending, fulfilled, broken] = await Promise.all([
                PromiseModel.find(query)
                    .populate('customerId', 'name phoneNumber customerId')
                    .sort(sort)
                    .skip(skip)
                    .limit(limitNum),
                PromiseModel.countDocuments(query),
                PromiseModel.countDocuments({ ...query, status: 'PENDING' }),
                PromiseModel.countDocuments({ ...query, status: 'FULFILLED' }),
                PromiseModel.countDocuments({ ...query, status: 'BROKEN' })
            ]);

            // Calculate statistics
            const fulfillmentRate = total > 0 ? (fulfilled / total * 100).toFixed(2) : 0;

            res.json({
                success: true,
                data: {
                    promises,
                    statistics: {
                        total,
                        pending,
                        fulfilled,
                        broken,
                        fulfillmentRate: parseFloat(fulfillmentRate)
                    },
                    pagination: {
                        total,
                        page: pageNum,
                        limit: limitNum,
                        pages: Math.ceil(total / limitNum)
                    }
                }
            });

        } catch (error) {
            console.error('Get promises error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error fetching promises'
            });
        }
    }

    // Update promise status
    static async updatePromiseStatus(req, res) {
        try {
            const { promiseId } = req.params;
            const { status, fulfillmentAmount, fulfillmentDate, notes } = req.body;

            const promise = await PromiseModel.findOne({ promiseId });
            if (!promise) {
                return res.status(404).json({
                    success: false,
                    message: 'Promise not found'
                });
            }

            // Validate status transition
            const validTransitions = {
                'PENDING': ['FULFILLED', 'BROKEN', 'RESCHEDULED', 'CANCELLED'],
                'RESCHEDULED': ['PENDING', 'FULFILLED', 'BROKEN', 'CANCELLED']
            };

            if (promise.status !== 'PENDING' && promise.status !== 'RESCHEDULED') {
                return res.status(400).json({
                    success: false,
                    message: `Cannot update promise with status: ${promise.status}`
                });
            }

            // Update promise
            promise.status = status;
            if (fulfillmentAmount) promise.fulfillmentAmount = fulfillmentAmount;
            if (fulfillmentDate) promise.fulfillmentDate = new Date(fulfillmentDate);
            if (notes) promise.notes = notes;

            await promise.save();

            // Update customer if promise fulfilled
            if (status === 'FULFILLED') {
                const customer = await Customer.findById(promise.customerId);
                if (customer) {
                    customer.fulfilledPromiseCount = (customer.fulfilledPromiseCount || 0) + 1;
                    await customer.save();
                }
            }

            res.json({
                success: true,
                message: `Promise marked as ${status.toLowerCase()}`,
                data: { promise }
            });

        } catch (error) {
            console.error('Update promise error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error updating promise'
            });
        }
    }

    // Get promises needing follow-up
    static async getFollowUpPromises(req, res) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const followUpPromises = await PromiseModel.find({
                status: 'PENDING',
                $or: [
                    { nextFollowUpDate: { $lt: tomorrow } },
                    { promiseDate: { $lt: tomorrow } }
                ],
                reminderSent: false
            })
                .populate('customerId', 'name phoneNumber arrears')
                .sort({ nextFollowUpDate: 1 })
                .limit(50);

            res.json({
                success: true,
                data: {
                    followUpPromises,
                    count: followUpPromises.length
                }
            });

        } catch (error) {
            console.error('Get follow-up promises error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error fetching follow-up promises'
            });
        }
    }

    // Get customer promise history
    static async getCustomerPromises(req, res) {
        try {
            const { customerId } = req.params;
            const { limit = 10 } = req.query;

            const promises = await PromiseModel.find({ customerId })
                .sort({ createdAt: -1 })
                .limit(parseInt(limit));

            // Calculate customer promise statistics
            const totalPromises = await PromiseModel.countDocuments({ customerId });
            const fulfilledPromises = await PromiseModel.countDocuments({
                customerId,
                status: 'FULFILLED'
            });
            const fulfillmentRate = totalPromises > 0 ?
                (fulfilledPromises / totalPromises * 100).toFixed(2) : 0;

            res.json({
                success: true,
                data: {
                    promises,
                    statistics: {
                        totalPromises,
                        fulfilledPromises,
                        brokenPromises: totalPromises - fulfilledPromises,
                        fulfillmentRate: parseFloat(fulfillmentRate)
                    }
                }
            });

        } catch (error) {
            console.error('Get customer promises error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error fetching customer promises'
            });
        }
    }

    // Add this method to promiseController.js
    static async exportPromises(req, res) {
        try {
            const {
                customerId,
                status,
                promiseType,
                startDate,
                endDate,
                createdBy
            } = req.query;

            // Build query
            const query = {};

            if (customerId) {
                query.customerId = customerId;
            }

            if (status) {
                query.status = status;
            }

            if (promiseType) {
                query.promiseType = promiseType;
            }

            if (createdBy) {
                query.createdBy = createdBy;
            }

            // Date filtering
            if (startDate || endDate) {
                query.promiseDate = {};
                if (startDate) {
                    query.promiseDate.$gte = new Date(startDate);
                }
                if (endDate) {
                    query.promiseDate.$lte = new Date(endDate);
                }
            }

            const promises = await PromiseModel.find(query)
                .populate('customerId', 'name phoneNumber customerId')
                .sort({ promiseDate: 1 });

            // Create CSV
            const csvHeader = 'Promise ID,Customer Name,Customer ID,Phone,Amount,Due Date,Type,Status,Created By,Created Date\n';

            const csvRows = promises.map(promise => {
                const customer = promise.customerId || {};
                const createdDate = promise.createdAt ?
                    new Date(promise.createdAt).toLocaleDateString('en-KE') : '';
                const dueDate = promise.promiseDate ?
                    new Date(promise.promiseDate).toLocaleDateString('en-KE') : '';

                const escapeCSV = (field) => {
                    if (!field) return '';
                    const stringField = String(field);
                    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                        return `"${stringField.replace(/"/g, '""')}"`;
                    }
                    return stringField;
                };

                return [
                    promise.promiseId || '',
                    escapeCSV(customer.name),
                    customer.customerId || '',
                    customer.phoneNumber || promise.phoneNumber || '',
                    parseFloat(promise.promiseAmount || 0).toFixed(2),
                    dueDate,
                    promise.promiseType || '',
                    promise.status || '',
                    escapeCSV(promise.createdByName || ''),
                    createdDate
                ].join(',');
            });

            const csvContent = csvHeader + csvRows.join('\n');

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition',
                `attachment; filename=promises_export_${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csvContent);

        } catch (error) {
            console.error('Export promises error:', error);
            res.status(500).json({
                success: false,
                message: 'Error exporting promises'
            });
        }
    }
}

module.exports = PromiseController;