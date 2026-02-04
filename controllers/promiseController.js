// backend/controllers/promiseController.js

// CHANGE THIS LINE - Use PromiseModel instead of Promise
const PromiseModel = require('../models/Promise');
const Customer = require('../models/Customer');
const ActivityLogger = require('../services/activityLogger');

class PromiseController {

    // Create a new promise
    static async createPromise(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
        try {
            console.log('🔍 createPromise called with body:', req.body);
            console.log('🔍 User from token:', user ? user.id : 'No user');

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
                
                await ActivityLogger.logError(
                    user.id,
                    'PROMISE_CREATE',
                    'Failed to create promise - Customer not found',
                    { code: 'CUSTOMER_NOT_FOUND' },
                    { customerId }
                );
                
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
                
                await ActivityLogger.logError(
                    user.id,
                    'PROMISE_CREATE',
                    'Promise amount exceeds loan balance',
                    { code: 'AMOUNT_EXCEEDS_BALANCE' },
                    {
                        customerName: customer.name,
                        amount,
                        loanBalance,
                        arrears
                    }
                );
                
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
                createdBy: user ? user.id : null,
                createdByName: user ? (user.username || user.name) : 'System',
                nextFollowUpDate
            };

            console.log('📝 Creating promise with data:', promiseData);

            const promise = await PromiseModel.create(promiseData); // CHANGED: PromiseModel

            // Update customer with promise info
            customer.lastPromiseDate = new Date();
            customer.promiseCount = (customer.promiseCount || 0) + 1;
            await customer.save();

            console.log('✅ Promise created successfully:', promise.promiseId);

            // Log successful promise creation
            await ActivityLogger.logPromise(
                user.id,
                'PROMISE_CREATE',
                promise,
                {
                    customerName: customer.name,
                    amount,
                    promiseDate: promiseDateObj,
                    promiseType,
                    duration: Date.now() - startTime
                }
            );

            res.status(201).json({
                success: true,
                message: 'Promise created successfully',
                data: { promise }
            });

        } catch (error) {
            console.error('❌ Create promise error:', error);
            console.error('❌ Error stack:', error.stack);
            
            await ActivityLogger.logError(
                req.user?.id,
                'PROMISE_CREATE',
                'Failed to create promise',
                error,
                {
                    customerId: req.body.customerId,
                    amount: req.body.promiseAmount,
                    date: req.body.promiseDate
                }
            );
            
            res.status(500).json({
                success: false,
                message: 'Server error creating promise',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // In promiseController.js - Update the getPromises method
    static async getPromises(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
        try {
            const {
                status,
                promiseType,
                startDate,
                endDate,
                customerName,
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

            // Customer name search
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

            // Execute queries - FIXED: Use PromiseModel and global.Promise.all
            const [promises, total, pending, fulfilled, broken] = await global.Promise.all([
                PromiseModel.find(query)  // CHANGED: PromiseModel
                    .populate('customerId', 'name phoneNumber customerId loanType')  // UPDATED: Added loanType
                    .sort(sort)
                    .skip(skip)
                    .limit(limitNum),
                PromiseModel.countDocuments(query),  // CHANGED: PromiseModel
                PromiseModel.countDocuments({ ...query, status: 'PENDING' }),  // CHANGED: PromiseModel
                PromiseModel.countDocuments({ ...query, status: 'FULFILLED' }),  // CHANGED: PromiseModel
                PromiseModel.countDocuments({ ...query, status: 'BROKEN' })  // CHANGED: PromiseModel
            ]);

            // Calculate statistics
            const fulfillmentRate = total > 0 ? (fulfilled / total * 100).toFixed(2) : 0;

            // Log promise list view
            await ActivityLogger.log({
                userId: user.id,
                action: 'PROMISE_VIEW',
                description: `Viewed promise list (${promises.length} of ${total} promises)`,
                resourceType: 'SYSTEM',
                requestDetails: {
                    filters: {
                        status,
                        promiseType,
                        startDate,
                        endDate,
                        customerName
                    },
                    pagination: { page: pageNum, limit: limitNum },
                    statistics: {
                        total,
                        pending,
                        fulfilled,
                        broken,
                        fulfillmentRate
                    },
                    duration: Date.now() - startTime
                },
                tags: ['promise', 'list', 'view']
            });

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
            
            await ActivityLogger.logError(
                user.id,
                'PROMISE_VIEW',
                'Failed to fetch promises',
                error,
                {
                    endpoint: req.originalUrl,
                    query: req.query
                }
            );
            
            res.status(500).json({
                success: false,
                message: 'Server error fetching promises'
            });
        }
    }

    // Update promise status
    static async updatePromiseStatus(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
        try {
            const { promiseId } = req.params;
            const { status, fulfillmentAmount, fulfillmentDate, notes } = req.body;

            const promise = await PromiseModel.findOne({ promiseId }); // CHANGED: PromiseModel
            if (!promise) {
                await ActivityLogger.logError(
                    user.id,
                    'PROMISE_UPDATE',
                    'Promise not found for status update',
                    { code: 'PROMISE_NOT_FOUND' },
                    { promiseId }
                );
                
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
                await ActivityLogger.logError(
                    user.id,
                    'PROMISE_UPDATE',
                    `Cannot update promise with status: ${promise.status}`,
                    { code: 'INVALID_STATUS_TRANSITION' },
                    {
                        promiseId,
                        currentStatus: promise.status,
                        requestedStatus: status
                    }
                );
                
                return res.status(400).json({
                    success: false,
                    message: `Cannot update promise with status: ${promise.status}`
                });
            }

            // Store old status for logging
            const oldStatus = promise.status;
            
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

            // Log promise status update
            await ActivityLogger.logPromise(
                user.id,
                'PROMISE_UPDATE',
                promise,
                {
                    oldStatus,
                    newStatus: status,
                    customerId: promise.customerId,
                    fulfillmentAmount,
                    fulfillmentDate,
                    duration: Date.now() - startTime
                }
            );

            res.json({
                success: true,
                message: `Promise marked as ${status.toLowerCase()}`,
                data: { promise }
            });

        } catch (error) {
            console.error('Update promise error:', error);
            
            await ActivityLogger.logError(
                user.id,
                'PROMISE_UPDATE',
                'Failed to update promise status',
                error,
                {
                    promiseId: req.params.promiseId,
                    status: req.body.status
                }
            );
            
            res.status(500).json({
                success: false,
                message: 'Server error updating promise'
            });
        }
    }

    // Get promises needing follow-up
    static async getFollowUpPromises(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const followUpPromises = await PromiseModel.find({  // CHANGED: PromiseModel
                status: 'PENDING',
                $or: [
                    { nextFollowUpDate: { $lt: tomorrow } },
                    { promiseDate: { $lt: tomorrow } }
                ],
                reminderSent: false
            })
                .populate('customerId', 'name phoneNumber arrears loanType')  // UPDATED: Added loanType
                .sort({ nextFollowUpDate: 1 })
                .limit(50);

            // Log follow-up promises view
            await ActivityLogger.log({
                userId: user.id,
                action: 'PROMISE_FOLLOWUP',
                description: `Viewed promises needing follow-up (${followUpPromises.length} promises)`,
                resourceType: 'SYSTEM',
                requestDetails: {
                    followUpCount: followUpPromises.length,
                    criteria: {
                        status: 'PENDING',
                        nextFollowUpDate: { $lt: tomorrow },
                        reminderSent: false
                    },
                    duration: Date.now() - startTime
                },
                tags: ['promise', 'follow-up', 'reminder']
            });

            res.json({
                success: true,
                data: {
                    followUpPromises,
                    count: followUpPromises.length
                }
            });

        } catch (error) {
            console.error('Get follow-up promises error:', error);
            
            await ActivityLogger.logError(
                user.id,
                'PROMISE_FOLLOWUP',
                'Failed to fetch follow-up promises',
                error,
                { endpoint: req.originalUrl }
            );
            
            res.status(500).json({
                success: false,
                message: 'Server error fetching follow-up promises'
            });
        }
    }

    // Get customer promise history
    static async getCustomerPromises(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
        try {
            const { customerId } = req.params;
            const { limit = 10 } = req.query;

            const promises = await PromiseModel.find({ customerId })  // CHANGED: PromiseModel
                .populate('customerId', 'name phoneNumber loanType')  // UPDATED: Added loanType
                .sort({ createdAt: -1 })
                .limit(parseInt(limit));

            // Calculate customer promise statistics
            const totalPromises = await PromiseModel.countDocuments({ customerId });  // CHANGED: PromiseModel
            const fulfilledPromises = await PromiseModel.countDocuments({  // CHANGED: PromiseModel
                customerId,
                status: 'FULFILLED'
            });
            const fulfillmentRate = totalPromises > 0 ?
                (fulfilledPromises / totalPromises * 100).toFixed(2) : 0;

            // Log customer promise history view
            await ActivityLogger.log({
                userId: user.id,
                action: 'PROMISE_VIEW',
                description: `Viewed promise history for customer ${customerId}`,
                resourceType: 'CUSTOMER',
                resourceId: customerId,
                requestDetails: {
                    customerId,
                    promiseCount: promises.length,
                    totalPromises,
                    fulfilledPromises,
                    fulfillmentRate,
                    duration: Date.now() - startTime
                },
                tags: ['promise', 'customer', 'history']
            });

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
            
            await ActivityLogger.logError(
                user.id,
                'PROMISE_VIEW',
                'Failed to fetch customer promises',
                error,
                {
                    customerId: req.params.customerId,
                    endpoint: req.originalUrl
                }
            );
            
            res.status(500).json({
                success: false,
                message: 'Server error fetching customer promises'
            });
        }
    }

    // Export promises to CSV
    static async exportPromises(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
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

            const promises = await PromiseModel.find(query)  // CHANGED: PromiseModel
                .populate('customerId', 'name phoneNumber customerId loanType')  // UPDATED: Added loanType
                .sort({ promiseDate: 1 });

            // Create CSV
            const csvHeader = 'Promise ID,Customer Name,Customer ID,Phone,Loan Type,Amount,Due Date,Type,Status,Created By,Created Date\n';

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
                    customer.loanType || '',  // ADDED: Include loan type in CSV export
                    parseFloat(promise.promiseAmount || 0).toFixed(2),
                    dueDate,
                    promise.promiseType || '',
                    promise.status || '',
                    escapeCSV(promise.createdByName || ''),
                    createdDate
                ].join(',');
            });

            const csvContent = csvHeader + csvRows.join('\n');

            // Log promise export
            await ActivityLogger.logSystem(
                user.id,
                'DATA_EXPORT',
                `Exported ${promises.length} promises to CSV`,
                {
                    exportType: 'promises',
                    recordCount: promises.length,
                    filters: {
                        customerId,
                        status,
                        promiseType,
                        startDate,
                        endDate,
                        createdBy
                    },
                    duration: Date.now() - startTime
                }
            );

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition',
                `attachment; filename=promises_export_${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csvContent);

        } catch (error) {
            console.error('Export promises error:', error);
            
            await ActivityLogger.logError(
                user.id,
                'DATA_EXPORT',
                'Failed to export promises',
                error,
                {
                    endpoint: req.originalUrl,
                    query: req.query
                }
            );
            
            res.status(500).json({
                success: false,
                message: 'Error exporting promises'
            });
        }
    }

    // ==============================================
    // NEW: Officer-specific promise methods
    // ==============================================

    /**
     * @desc    Get promises created by logged-in officer
     * @route   GET /api/promises/my-promises
     * @access  Private (Officers only)
     */
    static async getMyPromises(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
        try {
            const userId = user.id;
            const { status, limit = 100 } = req.query;
            
            console.log(`🤝 Fetching promises for officer ${userId}`);
            
            let query = { createdBy: userId };
            if (status) query.status = status;
            
            const promises = await PromiseModel.find(query)  // CHANGED: PromiseModel
                .populate('customerId', 'name phoneNumber arrears loanType')  // UPDATED: Added loanType
                .sort({ promiseDate: -1 })
                .limit(parseInt(limit))
                .lean();
            
            // Categorize promises
            const pending = promises.filter(p => p.status === 'PENDING');
            const fulfilled = promises.filter(p => p.status === 'FULFILLED');
            const broken = promises.filter(p => p.status === 'BROKEN');
            
            // Log officer's promise view
            await ActivityLogger.log({
                userId: user.id,
                action: 'PROMISE_VIEW',
                description: `Officer viewed personal promises (${promises.length} promises)`,
                resourceType: 'SYSTEM',
                requestDetails: {
                    userId,
                    promiseCount: promises.length,
                    statusFilter: status,
                    summary: {
                        pending: pending.length,
                        fulfilled: fulfilled.length,
                        broken: broken.length
                    },
                    duration: Date.now() - startTime
                },
                tags: ['promise', 'officer', 'personal']
            });
            
            res.status(200).json({
                success: true,
                count: promises.length,
                data: {
                    promises,
                    summary: {
                        total: promises.length,
                        pending: pending.length,
                        fulfilled: fulfilled.length,
                        broken: broken.length,
                        fulfillmentRate: promises.length > 0 ? 
                            (fulfilled.length / promises.length * 100).toFixed(1) + '%' : '0%'
                    }
                }
            });
            
        } catch (error) {
            console.error('❌ Error in getMyPromises:', error);
            
            await ActivityLogger.logError(
                user.id,
                'PROMISE_VIEW',
                'Failed to fetch officer promises',
                error,
                {
                    endpoint: req.originalUrl,
                    userId: user.id
                }
            );
            
            res.status(500).json({
                success: false,
                message: 'Server error fetching promises'
            });
        }
    }

    /**
     * @desc    Create a new promise for officer's customer
     * @route   POST /api/promises/my-promises
     * @access  Private (Officers only)
     */
    static async createMyPromise(req, res) {
        const startTime = Date.now();
        const user = req.user;
        
        try {
            const userId = user.id;
            const userRole = user.role;
            const { 
                customerId, 
                promiseAmount, 
                promiseDate, 
                promiseType = 'FULL_PAYMENT',
                notes = '' 
            } = req.body;
            
            console.log(`📝 Creating promise by officer ${userId} for customer ${customerId}`);
            
            // Validate required fields
            if (!customerId) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer ID is required'
                });
            }

            if (!promiseAmount || isNaN(promiseAmount) || promiseAmount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid promise amount is required'
                });
            }

            if (!promiseDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Promise date is required'
                });
            }

            // Parse date
            const promiseDateObj = new Date(promiseDate);
            if (isNaN(promiseDateObj.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format. Please use YYYY-MM-DD format'
                });
            }

            // Find customer
            const customer = await Customer.findById(customerId);
            if (!customer) {
                await ActivityLogger.logError(
                    userId,
                    'PROMISE_CREATE',
                    'Failed to create officer promise - Customer not found',
                    { code: 'CUSTOMER_NOT_FOUND' },
                    { customerId }
                );
                
                return res.status(404).json({
                    success: false,
                    message: 'Customer not found'
                });
            }

            // Check if officer is assigned to this customer
            if (userRole === 'officer') {
                const isAssigned = customer.assignedTo && 
                    (customer.assignedTo.toString() === userId.toString() || 
                     customer.assignedTo._id?.toString() === userId.toString());
                
                if (!isAssigned) {
                    await ActivityLogger.logError(
                        userId,
                        'PROMISE_CREATE',
                        'Officer not authorized to create promise for customer',
                        { code: 'UNAUTHORIZED_ACCESS' },
                        {
                            customerId,
                            assignedTo: customer.assignedTo,
                            officerId: userId
                        }
                    );
                    
                    return res.status(403).json({
                        success: false,
                        message: 'You can only create promises for customers assigned to you'
                    });
                }
            }

            const amount = parseFloat(promiseAmount);
            const loanBalance = parseFloat(customer.loanBalance || 0);

            // Check if promise amount exceeds loan balance
            if (amount > loanBalance) {
                await ActivityLogger.logError(
                    userId,
                    'PROMISE_CREATE',
                    'Promise amount exceeds loan balance',
                    { code: 'AMOUNT_EXCEEDS_BALANCE' },
                    {
                        customerName: customer.name,
                        amount,
                        loanBalance
                    }
                );
                
                return res.status(400).json({
                    success: false,
                    message: `Promise amount (Ksh ${amount.toLocaleString()}) exceeds loan balance (Ksh ${loanBalance.toLocaleString()})`
                });
            }

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
                createdBy: userId,
                createdByName: user.username || user.name,
                nextFollowUpDate,
                status: 'PENDING'
            };

            const promise = await PromiseModel.create(promiseData);  // CHANGED: PromiseModel

            // Update customer with promise info
            customer.lastPromiseDate = new Date();
            customer.promiseCount = (customer.promiseCount || 0) + 1;
            await customer.save();

            console.log(`✅ Promise created successfully by officer ${userId}:`, promise.promiseId);

            // Log successful officer promise creation
            await ActivityLogger.logPromise(
                userId,
                'PROMISE_CREATE',
                promise,
                {
                    customerName: customer.name,
                    amount,
                    promiseDate: promiseDateObj,
                    promiseType,
                    officerRole: userRole,
                    duration: Date.now() - startTime
                }
            );

            res.status(201).json({
                success: true,
                message: 'Promise created successfully',
                data: { 
                    promise: {
                        ...promise.toObject(),
                        customerName: customer.name,
                        phoneNumber: customer.phoneNumber
                    }
                }
            });
            
        } catch (error) {
            console.error('❌ Error in createMyPromise:', error);
            
            await ActivityLogger.logError(
                user.id,
                'PROMISE_CREATE',
                'Failed to create officer promise',
                error,
                {
                    customerId: req.body.customerId,
                    amount: req.body.promiseAmount,
                    date: req.body.promiseDate
                }
            );
            
            res.status(500).json({
                success: false,
                message: 'Server error creating promise'
            });
        }
    }
}

module.exports = PromiseController;