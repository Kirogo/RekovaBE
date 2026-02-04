// controllers/customerController.js
const Customer = require("../models/Customer");
const PromiseModel = require("../models/Promise");
const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");
const {
  formatPhoneNumber,
  generateAccountNumber,
  generateInternalId,
  isValidKenyanPhone,
} = require("../utils/helpers");
const ActivityLogger = require("../services/activityLogger");

// ============================================
// CONTROLLER FUNCTIONS - ALL MUST BE EXPORTS
// ============================================

/**
 * @desc    Get single customer by ID
 * @route   GET /api/customers/:id
 * @access  Private (Admin, Supervisor, Agent)
 */
exports.getCustomer = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;

    console.log(`🔍 [getCustomer] Request received for ID: "${id}"`);

    // Check if ID is undefined or invalid
    if (!id || id === "undefined" || id === "null") {
      console.log("❌ Invalid ID provided");
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    let customer = null;

    // Method 1: Try by MongoDB ObjectId if it's valid
    if (mongoose.Types.ObjectId.isValid(id)) {
      console.log(`🔍 [getCustomer] Searching by ObjectId: ${id}`);
      try {
        customer = await Customer.findById(id).select("-__v");
        console.log(
          `✅ [getCustomer] ObjectId search: ${customer ? "FOUND" : "NOT FOUND"}`,
        );
      } catch (mongooseError) {
        console.error(
          `❌ [getCustomer] ObjectId search error:`,
          mongooseError.message,
        );
      }
    }

    // Method 2: If not found by ObjectId, try by customerId
    if (!customer) {
      console.log(`🔍 [getCustomer] Searching by customerId: ${id}`);
      customer = await Customer.findOne({ customerId: id }).select("-__v");
      console.log(
        `✅ [getCustomer] customerId search: ${customer ? "FOUND" : "NOT FOUND"}`,
      );
    }

    // Method 3: If still not found, try by customerInternalId
    if (!customer) {
      console.log(`🔍 [getCustomer] Searching by customerInternalId: ${id}`);
      customer = await Customer.findOne({ customerInternalId: id }).select(
        "-__v",
      );
      console.log(
        `✅ [getCustomer] customerInternalId search: ${customer ? "FOUND" : "NOT FOUND"}`,
      );
    }

    // Method 4: Try by phone number
    if (!customer) {
      console.log(`🔍 [getCustomer] Searching by phoneNumber: ${id}`);
      const formattedPhone = formatPhoneNumber(id);
      customer = await Customer.findOne({ phoneNumber: formattedPhone }).select(
        "-__v",
      );
      console.log(
        `✅ [getCustomer] phoneNumber search: ${customer ? "FOUND" : "NOT FOUND"}`,
      );
    }

    if (!customer) {
      console.log(
        `❌ [getCustomer] Customer not found with any search method for ID: ${id}`,
      );
      
      // Log failed customer search
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_VIEW',
        `Failed to find customer with ID: ${id}`,
        { code: 'CUSTOMER_NOT_FOUND' },
        {
          searchId: id,
          searchMethods: ['ObjectId', 'customerId', 'customerInternalId', 'phoneNumber']
        }
      );
      
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    console.log(
      `🎉 [getCustomer] SUCCESS: Found customer "${customer.name}" with _id: ${customer._id}`,
    );

    // Get customer's recent transactions
    console.log(
      `🔍 [getCustomer] Fetching transactions for customer: ${customer._id}`,
    );
    const [recentTransactions, transactionCount] = await Promise.all([
      Transaction.find({ customerId: customer._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("-__v"),
      Transaction.countDocuments({ customerId: customer._id }),
    ]);

    console.log(
      `✅ [getCustomer] Found ${recentTransactions.length} recent transactions, total: ${transactionCount}`,
    );

    // Build response
    const response = {
      success: true,
      message: "Customer details retrieved successfully",
      data: {
        customer,
        recentTransactions,
        transactionCount,
      },
    };

    console.log(
      `📤 [getCustomer] Sending response for customer: ${customer.name}`,
    );

    // Log successful customer view
    await ActivityLogger.logCustomer(
      req.user.id,
      'CUSTOMER_VIEW',
      customer,
      {
        searchId: id,
        transactionsFound: recentTransactions.length,
        totalTransactions: transactionCount,
        duration: Date.now() - startTime
      }
    );

    res.json(response);
  } catch (error) {
    console.error("❌ [getCustomer] CRITICAL ERROR:", error.message);
    console.error("Stack trace:", error.stack);

    // Handle specific errors
    if (error.name === "CastError") {
      console.error("❌ CastError: Invalid ID format");
      
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_VIEW',
        `Invalid customer ID format: ${req.params.id}`,
        error,
        { endpoint: req.originalUrl }
      );
      
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID format",
      });
    }

    // Handle mongoose validation errors
    if (error.name === "ValidationError") {
      console.error("❌ ValidationError:", error.errors);
      
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_VIEW',
        'Validation error fetching customer',
        error,
        { endpoint: req.originalUrl, errors: error.errors }
      );
      
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors,
      });
    }

    // Generic server error
    console.error("❌ Unhandled error in getCustomer");
    
    await ActivityLogger.logError(
      req.user.id,
      'CUSTOMER_VIEW',
      'Server error fetching customer details',
      error,
      { endpoint: req.originalUrl, customerId: req.params.id }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching customer details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get all customers with search and pagination
 * @route   GET /api/customers
 * @access  Private (Admin, Supervisor, Agent)
 */
exports.getCustomers = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      search = "",
      page = 1,
      limit = 20,
      status = "active",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {};

    // Filter by status
    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    }

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { phoneNumber: { $regex: searchRegex } },
        { name: { $regex: searchRegex } },
        { customerId: { $regex: searchRegex } },
        { accountNumber: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { nationalId: { $regex: searchRegex } },
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Execute queries in parallel
    const [customers, totalCustomers, stats] = await Promise.all([
      Customer.find(query).sort(sort).skip(skip).limit(limitNum).select("-__v"),
      Customer.countDocuments(query),
      Customer.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalLoanBalance: { $sum: "$loanBalance" },
            totalArrears: { $sum: "$arrears" },
            totalRepayments: { $sum: "$totalRepayments" },
          },
        },
      ]),
    ]);

    const summary = stats[0] || {
      totalLoanBalance: 0,
      totalArrears: 0,
      totalRepayments: 0,
    };

    // Log customer list view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'CUSTOMER_VIEW',
      description: `Viewed customer list (${customers.length} of ${totalCustomers} customers)`,
      resourceType: 'SYSTEM',
      requestDetails: {
        search,
        page: pageNum,
        limit: limitNum,
        status,
        filters: {
          search,
          status,
          sortBy,
          sortOrder
        },
        duration: Date.now() - startTime
      },
      tags: ['customer', 'list', 'search']
    });

    res.json({
      success: true,
      message: "Customers retrieved successfully",
      data: {
        customers,
        summary: {
          totalCustomers,
          ...summary,
          activeCustomers: await Customer.countDocuments({ isActive: true }),
        },
        pagination: {
          total: totalCustomers,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(totalCustomers / limitNum),
        },
      },
    });
  } catch (error) {
    console.error("Get customers error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'CUSTOMER_VIEW',
      'Failed to fetch customer list',
      error,
      {
        endpoint: req.originalUrl,
        query: req.query
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching customers",
    });
  }
};

/**
 * @desc    Get customers assigned to currently logged-in officer
 * @route   GET /api/customers/assigned-to-me
 * @access  Private (Officers only)
 */
exports.getMyAssignedCustomers = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    console.log(`👤 Fetching assigned customers for user ${userId} (${userRole})`);

    let query = {};

    if (userRole === "officer" || userRole === "agent") {
      // For officers: only show customers assigned to them
      query = { 
        assignedTo: userId,
        isActive: true 
      };
    } else if (userRole === "supervisor") {
      // For supervisors: show all customers in their team
      // You'll need to implement team logic based on your structure
      query = { isActive: true }; // Modify based on your supervisor-team relationships
    } else if (userRole === "admin") {
      // For admins: show all customers
      query = {};
    }

    const customers = await Customer.find(query)
      .populate("assignedTo", "name username email loanType")
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📊 Found ${customers.length} customers for user ${userId}`);

    // Log assigned customers view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'CUSTOMER_VIEW',
      description: `Viewed assigned customers (${customers.length} customers)`,
      resourceType: 'SYSTEM',
      requestDetails: {
        userRole,
        assignedCount: customers.length,
        duration: Date.now() - startTime
      },
      tags: ['customer', 'assigned', 'officer']
    });

    res.status(200).json({
      success: true,
      count: customers.length,
      data: { customers },
    });
  } catch (error) {
    console.error("❌ Error in getMyAssignedCustomers:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'CUSTOMER_VIEW',
      'Failed to fetch assigned customers',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Get dashboard stats for logged-in officer
 * @route   GET /api/customers/dashboard/officer-stats
 * @access  Private (Officers only)
 */
exports.getOfficerDashboardStats = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const userId = req.user.id;
    const user = req.user;

    console.log(`📈 Fetching officer stats for ${user.username}`);

    // Get assigned customers count
    const assignedCustomers = await Customer.countDocuments({
      assignedTo: userId,
    });

    // Get assigned customers details for calculations
    const customers = await Customer.find({ assignedTo: userId })
      .select("loanBalance arrears lastPaymentDate")
      .lean();

    // Calculate totals
    const totalLoanPortfolio = customers.reduce(
      (sum, customer) => sum + parseFloat(customer.loanBalance || 0),
      0,
    );

    const totalArrears = customers.reduce(
      (sum, customer) => sum + parseFloat(customer.arrears || 0),
      0,
    );

    const activeCustomers = customers.filter(
      (c) => parseFloat(c.arrears || 0) > 0,
    ).length;

    // Get officer's collections from transactions
    const transactions = await Transaction.find({
      $or: [{ createdBy: userId }, { officerId: userId }, { userId: userId }],
      status: "SUCCESS",
    })
      .select("amount date")
      .lean();

    const totalCollections = transactions.reduce(
      (sum, trans) => sum + parseFloat(trans.amount || 0),
      0,
    );

    // Get pending promises count
    const pendingPromises = await PromiseModel.countDocuments({
      createdBy: userId,
      status: "pending",
    });

    // Calculate success rate (customers with payments vs total)
    const customersWithPayments = await Customer.find({
      assignedTo: userId,
      lastPaymentDate: { $ne: null },
    }).countDocuments();

    const successRate =
      assignedCustomers > 0
        ? ((customersWithPayments / assignedCustomers) * 100).toFixed(1)
        : 0;

    // Log dashboard view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'SYSTEM_VIEW',
      description: `Viewed officer dashboard statistics`,
      resourceType: 'SYSTEM',
      requestDetails: {
        stats: {
          assignedCustomers,
          totalLoanPortfolio,
          totalArrears,
          totalCollections,
          successRate
        },
        duration: Date.now() - startTime
      },
      tags: ['dashboard', 'officer', 'statistics']
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          loanType: user.loanType,
        },
        stats: {
          assignedCustomers,
          totalLoanPortfolio,
          totalArrears,
          activeCustomers,
          totalCollections,
          pendingPromises,
          successRate: `${successRate}%`,
          customersWithPayments,
        },
        recentActivity: {
          transactions: await Transaction.find({
            $or: [{ createdBy: userId }, { officerId: userId }],
          })
            .populate("customerId", "name phoneNumber")
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),
        },
      },
    });
  } catch (error) {
    console.error("❌ Error in getOfficerDashboardStats:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to fetch officer dashboard statistics',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching officer stats",
    });
  }
};

/**
 * @desc    Create new loan customer
 * @route   POST /api/customers
 * @access  Private (Admin, Supervisor, Agent)
 */
exports.createCustomer = async (req, res) => {
  const startTime = Date.now();
  const session = await Customer.startSession();
  session.startTransaction();

  try {
    const {
      phoneNumber,
      name,
      loanBalance = 0,
      arrears = 0,
      email = "",
      nationalId = "",
      customerId,
      accountNumber,
      loanType = "Consumer Loans",
      assignedTo = null
    } = req.body;

    // Validation
    if (!phoneNumber || !name) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Please provide phone number and name",
      });
    }

    // Format and validate phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);

    if (!isValidKenyanPhone(formattedPhone)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid Kenyan phone number (e.g., 0712345678 or 254712345678)",
      });
    }

    // Check if customer already exists
    const existingCustomer = await Customer.findOne({
      phoneNumber: formattedPhone,
      isActive: true,
    }).session(session);

    if (existingCustomer) {
      await session.abortTransaction();
      session.endSession();
      
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_CREATE',
        `Failed to create customer - Phone number already exists: ${formattedPhone}`,
        { code: 'DUPLICATE_PHONE' },
        { phoneNumber: formattedPhone, name }
      );
      
      return res.status(400).json({
        success: false,
        message: "Customer with this phone number already exists",
      });
    }

    // Generate IDs
    const customerInternalId = generateInternalId("CUS");
    const finalCustomerId =
      customerId ||
      `CUST${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0")}`;
    const finalAccountNumber = accountNumber || generateAccountNumber();

    // Create customer object
    const newCustomer = await Customer.create(
      [
        {
          customerInternalId,
          customerId: finalCustomerId,
          phoneNumber: formattedPhone,
          name,
          accountNumber: finalAccountNumber,
          loanBalance: parseFloat(loanBalance) || 0,
          arrears: parseFloat(arrears) || 0,
          email,
          nationalId,
          loanType,
          assignedTo,
          totalRepayments: 0,
          lastPaymentDate: null,
          isActive: true,
          createdBy: req.user.username,
          createdByUserId: req.user.id,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // Log successful customer creation
    await ActivityLogger.logCustomer(
      req.user.id,
      'CUSTOMER_CREATE',
      newCustomer[0],
      {
        loanType,
        assignedTo,
        createdBy: req.user.username,
        duration: Date.now() - startTime
      }
    );

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: {
        customer: newCustomer[0],
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Create customer error:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_CREATE',
        `Failed to create customer - Duplicate ${field}`,
        error,
        { field, value: req.body[field] }
      );
      
      return res.status(400).json({
        success: false,
        message: `Customer with this ${field} already exists`,
      });
    }

    await ActivityLogger.logError(
      req.user.id,
      'CUSTOMER_CREATE',
      'Failed to create customer',
      error,
      {
        phoneNumber: req.body.phoneNumber,
        name: req.body.name
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error creating customer",
    });
  }
};

/**
 * @desc    Get customer by phone number
 * @route   GET /api/customers/phone/:phoneNumber
 * @access  Private (Admin, Supervisor, Agent)
 */
exports.getCustomerByPhone = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const formattedPhone = formatPhoneNumber(req.params.phoneNumber);

    const customer = await Customer.findOne({
      phoneNumber: formattedPhone,
      isActive: true,
    }).select("-__v");

    if (!customer) {
      // Log failed customer search by phone
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_VIEW',
        `Customer not found by phone: ${formattedPhone}`,
        { code: 'CUSTOMER_NOT_FOUND' },
        { phoneNumber: formattedPhone }
      );
      
      return res.status(404).json({
        success: false,
        message:
          "Customer not found. Please check the phone number or register the customer first.",
      });
    }

    // Get recent transactions and transaction summary in parallel
    const [recentTransactions, transactionSummary] = await Promise.all([
      Transaction.find({ customerId: customer._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("-__v"),
      Transaction.aggregate([
        { $match: { customerId: customer._id } },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            successfulTransactions: {
              $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] },
            },
            totalAmountPaid: {
              $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, "$amount", 0] },
            },
          },
        },
      ]),
    ]);

    const summary = transactionSummary[0] || {
      totalTransactions: 0,
      successfulTransactions: 0,
      totalAmountPaid: 0,
    };

    // Log successful customer view by phone
    await ActivityLogger.logCustomer(
      req.user.id,
      'CUSTOMER_VIEW',
      customer,
      {
        searchMethod: 'phone',
        phoneNumber: formattedPhone,
        transactionsFound: recentTransactions.length,
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      message: "Customer retrieved successfully",
      data: {
        customer,
        recentTransactions,
        transactionSummary: summary,
      },
    });
  } catch (error) {
    console.error("Get customer by phone error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'CUSTOMER_VIEW',
      'Failed to fetch customer by phone',
      error,
      {
        phoneNumber: req.params.phoneNumber,
        endpoint: req.originalUrl
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching customer",
    });
  }
};

/**
 * @desc    Update customer information
 * @route   PUT /api/customers/:id
 * @access  Private (Admin, Supervisor)
 */
exports.updateCustomer = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;

    // Find customer
    const customer = await Customer.findOne({
      $or: [{ _id: id }, { customerId: id }, { customerInternalId: id }],
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Check permissions
    if (
      req.user.role === "agent" &&
      customer.createdByUserId.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only update customers you created",
      });
    }

    // Store old values for logging
    const oldValues = {
      name: customer.name,
      phoneNumber: customer.phoneNumber,
      email: customer.email,
      loanBalance: customer.loanBalance,
      arrears: customer.arrears,
      loanType: customer.loanType,
      assignedTo: customer.assignedTo
    };

    // Prepare update data
    const updateData = { ...req.body };

    // Format phone if provided
    if (req.body.phoneNumber) {
      updateData.phoneNumber = formatPhoneNumber(req.body.phoneNumber);

      // Check for duplicate phone number
      if (updateData.phoneNumber !== customer.phoneNumber) {
        const existingCustomer = await Customer.findOne({
          phoneNumber: updateData.phoneNumber,
          isActive: true,
          _id: { $ne: customer._id },
        });

        if (existingCustomer) {
          await ActivityLogger.logError(
            req.user.id,
            'CUSTOMER_UPDATE',
            `Failed to update customer - Phone number already exists: ${updateData.phoneNumber}`,
            { code: 'DUPLICATE_PHONE' },
            {
              customerId: customer.customerId,
              oldPhone: customer.phoneNumber,
              newPhone: updateData.phoneNumber
            }
          );
          
          return res.status(400).json({
            success: false,
            message: "Another customer with this phone number already exists",
          });
        }
      }
    }

    // Update customer
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customer._id,
      updateData,
      { new: true, runValidators: true },
    ).select("-__v");

    // Log customer update
    await ActivityLogger.logCustomer(
      req.user.id,
      'CUSTOMER_UPDATE',
      updatedCustomer,
      {
        oldValues,
        newValues: updateData,
        changes: Object.keys(updateData),
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      message: "Customer updated successfully",
      data: {
        customer: updatedCustomer,
      },
    });
  } catch (error) {
    console.error("Update customer error:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_UPDATE',
        `Failed to update customer - Duplicate ${field}`,
        error,
        {
          field,
          customerId: req.params.id,
          value: req.body[field]
        }
      );
      
      return res.status(400).json({
        success: false,
        message: `Another customer with this ${field} already exists`,
      });
    }

    // Handle invalid ObjectId
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    await ActivityLogger.logError(
      req.user.id,
      'CUSTOMER_UPDATE',
      'Failed to update customer',
      error,
      {
        customerId: req.params.id,
        updateData: req.body
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error updating customer",
    });
  }
};

/**
 * @desc    Soft delete customer (deactivate)
 * @route   DELETE /api/customers/:id
 * @access  Private (Admin only)
 */
exports.deleteCustomer = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check if user is admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can deactivate customers",
      });
    }

    const { id } = req.params;

    const customer = await Customer.findOne({
      $or: [{ _id: id }, { customerId: id }, { customerInternalId: id }],
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Check if customer has outstanding balance
    if (customer.loanBalance > 0 || customer.arrears > 0) {
      await ActivityLogger.logError(
        req.user.id,
        'CUSTOMER_DELETE',
        `Failed to deactivate customer - Outstanding balance exists`,
        { code: 'OUTSTANDING_BALANCE' },
        {
          customerId: customer.customerId,
          loanBalance: customer.loanBalance,
          arrears: customer.arrears
        }
      );
      
      return res.status(400).json({
        success: false,
        message:
          "Cannot deactivate customer with outstanding balance or arrears",
      });
    }

    // Store customer details for logging
    const customerDetails = {
      name: customer.name,
      phoneNumber: customer.phoneNumber,
      customerId: customer.customerId,
      loanBalance: customer.loanBalance,
      arrears: customer.arrears
    };

    // Soft delete by setting isActive to false
    customer.isActive = false;
    customer.updatedAt = new Date();
    await customer.save();

    // Log customer deactivation
    await ActivityLogger.logCustomer(
      req.user.id,
      'CUSTOMER_DELETE',
      customerDetails,
      {
        deactivatedBy: req.user.username,
        reason: 'Admin deactivation',
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      message: "Customer deactivated successfully",
    });
  } catch (error) {
    console.error("Delete customer error:", error);

    // Handle invalid ObjectId
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    await ActivityLogger.logError(
      req.user.id,
      'CUSTOMER_DELETE',
      'Failed to deactivate customer',
      error,
      { customerId: req.params.id }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error deleting customer",
    });
  }
};

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/customers/dashboard/stats
 * @access  Private (All authenticated users)
 */
exports.getDashboardStats = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const user = req.user;
    const { startDate, endDate } = req.query;

    console.log(
      `📊 Dashboard stats request from: ${user.username} (${user.role})`,
    );

    // Set date range (default: last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    start.setDate(start.getDate() - 30);

    // Get total customers count
    const totalCustomers = await Customer.countDocuments();

    // Get active customers (with arrears > 0)
    const activeCustomers = await Customer.countDocuments({
      arrears: { $gt: 0 },
    });

    // Get total arrears
    const totalArrearsResult = await Customer.aggregate([
      { $group: { _id: null, total: { $sum: "$arrears" } } },
    ]);
    const totalArrears = totalArrearsResult[0]?.total || 0;

    // Get recent transactions
    const recentTransactions = await Transaction.find({
      createdAt: { $gte: start, $lte: end },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("customerId", "name phoneNumber");

    // Get pending promises
    const pendingPromises = await PromiseModel.countDocuments({
      status: "PENDING",
      promiseDate: { $gte: new Date() },
    });

    // Role-specific data
    let roleSpecificData = {};

    if (user.role === "admin") {
      // Admin gets everything
      const totalCollections = await Transaction.aggregate([
        {
          $match: { status: "SUCCESS", createdAt: { $gte: start, $lte: end } },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      const User = require("../models/User");
      const activeUsers = await User.countDocuments({ isActive: true });

      roleSpecificData = {
        totalCollections: totalCollections[0]?.total || 0,
        activeUsers,
        systemWide: true,
      };
    } else if (user.role === "supervisor") {
      // Supervisor gets team data
      const User = require("../models/User");
      const teamMembers = await User.find({
        role: "officer",
        isActive: true,
      }).countDocuments();

      // Get team collections
      const teamCollections = await Transaction.aggregate([
        {
          $match: {
            status: "SUCCESS",
            createdAt: { $gte: start, $lte: end },
            initiatedByUserId: { $exists: true },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      roleSpecificData = {
        teamMembers,
        teamCollections: teamCollections[0]?.total || 0,
        viewType: "team",
      };
    } else if (user.role === "officer") {
      // Officer gets personal performance
      const myCollections = await Transaction.aggregate([
        {
          $match: {
            status: "SUCCESS",
            createdAt: { $gte: start, $lte: end },
            initiatedByUserId: user._id,
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);

      // Get officer's assigned customers
      const assignedCustomers = await Customer.countDocuments({
        // Assuming you have an assignedTo field
        assignedTo: user._id,
      });

      // Get officer's promises
      const myPromises = await PromiseModel.find({
        createdBy: user._id,
        status: "PENDING",
      }).countDocuments();

      roleSpecificData = {
        myCollections: myCollections[0]?.total || 0,
        assignedCustomers: assignedCustomers || 0,
        myPromises,
        viewType: "personal",
      };
    }

    // Response structure - FIXED to match what your frontend expects
    const dashboardStats = {
      // FIXED: The frontend expects these properties directly, not nested under "overview"
      totalCustomers,
      activeCustomers,
      totalArrears,
      totalCollections: roleSpecificData.totalCollections || 0,
      pendingPromises,

      // Keep the nested structure for additional data if needed
      overview: {
        dateRange: {
          start: start.toISOString().split("T")[0],
          end: end.toISOString().split("T")[0],
        },
      },

      // Recent activity
      recentActivity: {
        transactions: recentTransactions.map((t) => ({
          id: t._id,
          amount: t.amount,
          status: t.status,
          customerName: t.customerId?.name || "Unknown",
          customerPhone: t.customerId?.phoneNumber || "",
          date: t.createdAt,
          type: t.paymentMethod || "M-Pesa",
        })),
      },

      // Role-specific data
      roleData: roleSpecificData,

      // User info
      user: {
        role: user.role,
        fullName: user.fullName || user.username,
        permissions: user.permissions,
      },

      timestamp: new Date(),
    };

    // Log dashboard view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'SYSTEM_VIEW',
      description: 'Viewed dashboard statistics',
      resourceType: 'SYSTEM',
      requestDetails: {
        userRole: user.role,
        stats: {
          totalCustomers,
          activeCustomers,
          totalArrears,
          pendingPromises
        },
        duration: Date.now() - startTime
      },
      tags: ['dashboard', 'statistics', 'overview']
    });

    res.json({
      success: true,
      message: "Dashboard stats retrieved successfully",
      data: {
        stats: dashboardStats, // FIXED: Wrap in "data.stats" as your frontend expects
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to fetch dashboard statistics',
      error,
      {
        endpoint: req.originalUrl,
        userRole: req.user.role
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};