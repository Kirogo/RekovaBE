//controllers/paymentController.js
const cron = require("node-cron");
const Transaction = require("../models/Transaction");
const Customer = require("../models/Customer");
const {
  formatPhoneNumber,
  isValidKenyanPhone,
  calculateNewBalances,
} = require("../utils/helpers");
const WhatsAppService = require("../services/whatsappService");
const PerformanceTracker = require("../middleware/performanceTracker");
const User = require("../models/User");
const ActivityLogger = require("../services/activityLogger");

console.log("🔧 Loading payment controller...");

/*
 * @desc    Initiate STK Push payment
 * @route   POST /api/payments/initiate
 * @access  Private (All authenticated users)
 */
exports.initiateSTKPush = async (req, res) => {
  const startTime = Date.now();
  const user = req.user;
  
  console.log("\n=== INITIATE PAYMENT REQUEST ===");
  console.log("Request body:", req.body);
  console.log("User:", user?.username);

  const session = await Transaction.startSession();
  session.startTransaction();

  try {
    const {
      phoneNumber,
      amount,
      description = "Loan Repayment",
      customerId,
    } = req.body;

    // Validation
    if (!phoneNumber || !amount) {
      console.log("❌ Validation failed: Missing phone or amount");
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Please provide phone number and amount",
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.log("❌ Validation failed: Invalid amount", amount);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Please provide a valid amount greater than 0",
      });
    }

    // Format and validate phone number
    const formattedPhone = formatPhoneNumber(phoneNumber);
    console.log("Formatted phone:", formattedPhone);

    if (!isValidKenyanPhone(formattedPhone)) {
      console.log("❌ Validation failed: Invalid Kenyan phone", formattedPhone);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Kenyan phone number",
      });
    }

    // Find customer
    let customer;
    if (customerId) {
      console.log("Looking for customer by ID:", customerId);
      customer = await Customer.findOne({
        $or: [{ _id: customerId }, { customerId: customerId }],
        isActive: true,
      }).session(session);
    }

    if (!customer) {
      console.log("Looking for customer by phone:", formattedPhone);
      customer = await Customer.findOne({
        phoneNumber: formattedPhone,
        isActive: true,
      }).session(session);
    }

    if (!customer) {
      console.log("❌ Customer not found");
      await session.abortTransaction();
      session.endSession();
      
      // Log failed transaction initiation
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_INITIATE',
        `Failed to initiate payment - Customer not found`,
        { code: 'CUSTOMER_NOT_FOUND' },
        {
          phoneNumber: formattedPhone,
          amount: amountNum,
          customerId
        }
      );
      
      return res.status(404).json({
        success: false,
        message: "Customer not found. Please register customer first.",
      });
    }

    console.log("✅ Customer found:", customer.name);

    // Check loan balance
    if (amountNum > customer.loanBalance) {
      console.log("❌ Amount exceeds loan balance");
      await session.abortTransaction();
      session.endSession();
      
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_INITIATE',
        `Payment amount exceeds loan balance`,
        { code: 'AMOUNT_EXCEEDS_BALANCE' },
        {
          customerName: customer.name,
          amount: amountNum,
          loanBalance: customer.loanBalance
        }
      );
      
      return res.status(400).json({
        success: false,
        message: `Payment amount (Ksh ${amountNum.toLocaleString()}) exceeds loan balance (Ksh ${customer.loanBalance.toLocaleString()})`,
      });
    }

    // Generate transaction IDs
    const transactionId = `TRX${Date.now().toString().slice(-10)}${Math.floor(
      Math.random() * 1000,
    )
      .toString()
      .padStart(3, "0")}`;
    const transactionInternalId = `TRN${Date.now().toString().slice(-8)}${Math.floor(
      Math.random() * 1000,
    )
      .toString()
      .padStart(3, "0")}`;

    console.log("Generated Transaction ID:", transactionId);

    // Calculate new balances
    const { newLoanBalance, newArrears } = calculateNewBalances(
      customer,
      amountNum,
    );
    console.log("New balances - Loan:", newLoanBalance, "Arrears:", newArrears);

    // Create transaction
    console.log("Creating transaction...");
    const transactionData = {
      transactionInternalId,
      transactionId,
      customerId: customer._id,
      customerInternalId: customer.customerInternalId || customer.customerId,
      phoneNumber: formattedPhone,
      amount: amountNum,
      description,
      status: "PENDING",
      loanBalanceBefore: customer.loanBalance,
      loanBalanceAfter: newLoanBalance,
      arrearsBefore: customer.arrears,
      arrearsAfter: newArrears,
      paymentMethod: "WHATSAPP",
      initiatedBy: user.username,
      initiatedByUserId: user.id,
      whatsappRequest: {
        message: "WhatsApp payment request sent",
        timestamp: new Date(),
      },
      pinAttempts: 0,
    };

    const transaction = await Transaction.create([transactionData], {
      session,
    });

    await PerformanceTracker.trackTransaction(user.id, transaction);

    await session.commitTransaction();
    session.endSession();

    console.log("✅ Transaction created:", transaction[0]._id);
    console.log("📱 Transaction phone number stored as:", formattedPhone);

    // Send WhatsApp message
    console.log("Sending WhatsApp message...");
    let whatsappResponse = null;
    try {
      whatsappResponse = await WhatsAppService.sendPaymentRequest(
        formattedPhone,
        customer.name,
        amountNum,
        transactionId,
      );

      console.log("WhatsApp response:", whatsappResponse);

      // Update transaction with WhatsApp info
      await Transaction.findByIdAndUpdate(
        transaction[0]._id,
        {
          whatsappMessageId: whatsappResponse.messageId,
          whatsappStatus: whatsappResponse.status,
          "whatsappRequest.sentAt": new Date(),
          "whatsappRequest.mock": whatsappResponse.mock || false,
        },
        { session: null },
      );
    } catch (whatsappError) {
      console.error(
        "❌ WhatsApp sending failed in controller:",
        whatsappError.message,
      );
      whatsappResponse = {
        success: false,
        error: whatsappError.message,
        mock: true,
      };

      // Update transaction as failed to send
      await Transaction.findByIdAndUpdate(
        transaction[0]._id,
        {
          status: "FAILED",
          errorMessage: `WhatsApp message failed: ${whatsappError.message}`,
          whatsappStatus: "FAILED",
        },
        { session: null },
      );
    }

    console.log("✅ Sending response to frontend");
    
    // Log successful transaction initiation
    await ActivityLogger.logTransaction(
      user.id,
      'TRANSACTION_INITIATE',
      transaction[0],
      {
        customerName: customer.name,
        amount: amountNum,
        paymentMethod: 'WHATSAPP',
        whatsappSuccess: whatsappResponse.success,
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      message: whatsappResponse.mock
        ? "Payment request created (WhatsApp in mock mode)"
        : "Payment request sent successfully via WhatsApp",
      data: {
        transaction: transaction[0],
        customer: {
          name: customer.name,
          phoneNumber: customer.phoneNumber,
          loanBalanceBefore: customer.loanBalance,
          loanBalanceAfter: newLoanBalance,
          arrearsBefore: customer.arrears,
          arrearsAfter: newArrears,
        },
        whatsapp: whatsappResponse,
      },
    });
  } catch (error) {
    console.error("❌❌❌ CRITICAL ERROR in initiateSTKPush:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Error code:", error.code);

    await session.abortTransaction();
    session.endSession();

    if (error.code === 11000 && error.keyPattern?.transactionId) {
      console.log("Duplicate transaction ID");
      
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_INITIATE',
        'Duplicate transaction ID',
        error,
        { transactionId: req.body.transactionId }
      );
      
      return res.status(409).json({
        success: false,
        message: "Transaction ID conflict. Please try again.",
      });
    }

    await ActivityLogger.logError(
      user.id,
      'TRANSACTION_INITIATE',
      'Failed to initiate STK push payment',
      error,
      {
        phoneNumber: req.body.phoneNumber,
        amount: req.body.amount,
        customerId: req.body.customerId
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ==================== WHATSAPP PAYMENT PROCESSING ====================

/**
 * @desc    Process WhatsApp payment response
 * @route   POST /api/payments/whatsapp-response
 * @access  Public (Called by Twilio webhook)
 */
exports.processWhatsAppResponse = async (req, res) => {
  console.log("\n📱 WHATSAPP WEBHOOK RECEIVED");
  console.log("Request method:", req.method);
  console.log("Request URL:", req.originalUrl);
  console.log("Request headers:", req.headers);
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  // IMPORTANT: Send immediate response to Twilio with proper headers
  res.set({
    "Content-Type": "text/xml",
    "Cache-Control": "no-cache",
    Connection: "close",
  });

  try {
    const { From, Body, MessageSid } = req.body;

    if (!From || !Body) {
      console.log("❌ Missing From or Body in webhook");
      return res.send("<Response></Response>");
    }

    // Extract phone number (remove 'whatsapp:+')
    const phoneNumber = From.replace("whatsapp:+", "");
    console.log("📱 Processing response from:", phoneNumber);
    console.log("📱 Raw message body:", Body);

    // Clean and trim the message
    const message = Body.trim();
    console.log("📱 Cleaned message:", message);

    // Check for PIN 1234 in various formats
    let pin = null;

    // SIMPLIFIED LOGIC: Just check if message contains "1234"
    if (message === "1234") {
      pin = "1234";
      console.log("✅ Exact PIN 1234 received");
    }
    // Check if message contains "1234" anywhere
    else if (message.includes("1234")) {
      pin = "1234";
      console.log("✅ PIN 1234 found in message");
    }
    // Check for "confirm" or "yes" (case-insensitive)
    else if (
      message.toLowerCase().includes("confirm") ||
      message.toLowerCase().includes("yes") ||
      message.toLowerCase().includes("ok")
    ) {
      pin = "1234";
      console.log("✅ Confirmation received, using PIN 1234");
    }
    // Check for "pay" followed by numbers
    else if (message.toLowerCase().startsWith("pay")) {
      // Extract numbers after "pay"
      const numbers = message.replace(/\D/g, "");
      if (numbers === "1234") {
        pin = "1234";
        console.log("✅ PAY 1234 received");
      }
    }

    console.log("🔐 PIN extracted:", pin);

    if (!pin) {
      console.log("❌ No valid PIN found, sending instructions");
      // Send helpful message back
      const responseMessage = `For demo purposes, please reply with:\n\n• "1234" (to confirm payment)\n• Or "CONFIRM" or "YES"\n\nThis will process your payment.`;

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${responseMessage}</Message>
</Response>`;
      return res.send(twimlResponse);
    }

    // Find the most recent pending transaction for this phone number
    console.log("🔍 Looking for transaction with phone:", phoneNumber);

    let transaction = await Transaction.findOne({
      phoneNumber: phoneNumber,
      status: "PENDING",
    })
      .sort({ createdAt: -1 })
      .limit(1);

    console.log(
      "First lookup result:",
      transaction ? `Found: ${transaction.transactionId}` : "Not found",
    );

    // If not found by exact phone, try matching the last 9 digits (remove country code)
    if (!transaction) {
      console.log("🔍 Trying alternative phone matching...");
      // Try with just the last 9 digits (Kenyan numbers)
      const last9Digits = phoneNumber.slice(-9);
      console.log("Looking for phone ending with:", last9Digits);

      // Get all pending transactions
      const allPending = await Transaction.find({
        status: "PENDING",
      })
        .sort({ createdAt: -1 })
        .limit(10);

      console.log(`Found ${allPending.length} pending transactions total`);

      // Manually check each one
      for (const tx of allPending) {
        const txLast9 = tx.phoneNumber?.slice(-9) || "";
        console.log(
          `Comparing: ${tx.phoneNumber} (last 9: ${txLast9}) with ${last9Digits}`,
        );

        if (txLast9 === last9Digits) {
          transaction = tx;
          console.log(
            `✅ Found matching transaction: ${transaction.transactionId}`,
          );
          break;
        }
      }
    }

    // If still not found by phone, try customer lookup
    if (!transaction) {
      console.log(
        "🔍 No transaction found by phone, trying customer lookup...",
      );

      // First try to find customer by phone (last 9 digits)
      const last9Digits = phoneNumber.slice(-9);
      const customers = await Customer.find({}).limit(20);

      let customer = null;
      for (const cust of customers) {
        if (cust.phoneNumber && cust.phoneNumber.includes(last9Digits)) {
          customer = cust;
          console.log(`✅ Found customer by phone match: ${customer.name}`);
          break;
        }
      }

      if (customer) {
        transaction = await Transaction.findOne({
          customerId: customer._id,
          status: "PENDING",
        })
          .sort({ createdAt: -1 })
          .limit(1);

        if (transaction) {
          console.log(
            `✅ Found transaction via customer: ${transaction.transactionId}`,
          );
        }
      }
    }

    if (!transaction) {
      console.log("❌ No pending transaction found for phone:", phoneNumber);

      // Log all pending transactions for debugging
      const allPending = await Transaction.find({ status: "PENDING" }).limit(5);
      console.log(
        "All pending transactions:",
        allPending.map((t) => ({
          phone: t.phoneNumber,
          id: t.transactionId,
          customerId: t.customerId,
          createdAt: t.createdAt,
        })),
      );

      // Log failed webhook processing
      await ActivityLogger.logError(
        null,
        'TRANSACTION_PROCESS',
        'No pending transaction found for WhatsApp response',
        { code: 'NO_PENDING_TRANSACTION' },
        {
          phoneNumber,
          messageBody: message,
          pendingCount: allPending.length
        }
      );

      // Send message to customer
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>No pending payment request found. Please initiate a new payment request from the agent.</Message>
</Response>`;
      return res.send(twimlResponse);
    }

    console.log("✅ Found transaction:", transaction.transactionId);
    console.log("💰 Transaction amount:", transaction.amount);
    console.log("📞 Transaction phone:", transaction.phoneNumber);
    console.log("🔐 Processing with PIN:", pin);

    // Process the payment
    const success = await processPaymentWithPIN(transaction, pin);

    if (success) {
      console.log("🎉 Payment processed successfully");

      // Get customer name for response
      let customerName = "Customer";
      try {
        const customer = await Customer.findById(transaction.customerId);
        if (customer) {
          customerName = customer.name;
          
          // Log successful transaction via webhook
          await ActivityLogger.logTransaction(
            transaction.initiatedByUserId || null,
            'TRANSACTION_SUCCESS',
            transaction,
            {
              customerName: customer.name,
              amount: transaction.amount,
              paymentMethod: 'WHATSAPP',
              receiptNumber: transaction.mpesaReceiptNumber,
              processedVia: 'webhook'
            }
          );
        }
      } catch (error) {
        console.log("⚠️ Could not fetch customer name:", error.message);
      }

      // Send success confirmation
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Dear ${customerName}, your MPESA transfer of KES ${transaction.amount.toLocaleString()} has been processed successfully. MPESA Ref Number: ${transaction.mpesaReceiptNumber}</Message>
</Response>`;
      return res.send(twimlResponse);
    } else {
      console.log("❌ Payment processing failed");
      
      // Log failed transaction via webhook
      await ActivityLogger.logError(
        transaction.initiatedByUserId || null,
        'TRANSACTION_FAIL',
        'WhatsApp payment processing failed',
        { code: 'WHATSAPP_PAYMENT_FAILED' },
        {
          transactionId: transaction.transactionId,
          phoneNumber,
          pinAttempts: transaction.pinAttempts,
          status: transaction.status
        }
      );
      
      // Send failure message
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>❌ Payment processing failed. Please contact support.</Message>
</Response>`;
      return res.send(twimlResponse);
    }
  } catch (error) {
    console.error("❌ WhatsApp webhook error:", error);
    console.error("Error stack:", error.stack);
    
    // Log webhook error
    await ActivityLogger.logError(
      null,
      'TRANSACTION_PROCESS',
      'WhatsApp webhook processing error',
      error,
      {
        requestBody: req.body,
        endpoint: req.originalUrl
      }
    );
    
    // Send error response but don't crash
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>We encountered an error processing your payment. Please try again or contact support.</Message>
</Response>`;
    return res.send(twimlResponse);
  }
};

// Helper function to process payment with PIN
async function processPaymentWithPIN(transaction, pin) {
  const startTime = Date.now();
  
  try {
    console.log(
      `\n💰 PROCESSING PAYMENT FOR TRANSACTION: ${transaction.transactionId}`,
    );
    console.log("🔐 PIN received:", pin);
    console.log("📱 Transaction phone:", transaction.phoneNumber);
    console.log("💵 Amount:", transaction.amount);

    // SPECIAL FIX: Only accept PIN "1234" for demo
    if (pin !== "1234") {
      console.log("❌ Invalid PIN. Only 1234 is accepted.");
      console.log("Actual PIN received:", pin);

      // Increment pin attempts
      transaction.pinAttempts += 1;
      transaction.updatedAt = new Date();

      // Check if max attempts reached
      if (transaction.pinAttempts >= 3) {
        transaction.status = "FAILED";
        transaction.errorMessage = "Maximum PIN attempts exceeded";
        transaction.failureReason = "WRONG_PIN";
        
        // Log max attempts failure
        await ActivityLogger.logError(
          transaction.initiatedByUserId,
          'TRANSACTION_FAIL',
          'Maximum PIN attempts exceeded',
          { code: 'MAX_PIN_ATTEMPTS' },
          {
            transactionId: transaction.transactionId,
            pinAttempts: transaction.pinAttempts,
            customerId: transaction.customerId
          }
        );
      } else {
        // Log invalid PIN attempt
        await ActivityLogger.logError(
          transaction.initiatedByUserId,
          'TRANSACTION_PROCESS',
          `Invalid PIN attempt (${transaction.pinAttempts}/3)`,
          { code: 'INVALID_PIN' },
          {
            transactionId: transaction.transactionId,
            pinAttempts: transaction.pinAttempts,
            expectedPin: '1234',
            receivedPin: pin
          }
        );
      }

      await transaction.save();

      return false;
    }

    // Start a new session for database transaction
    const session = await Transaction.startSession();

    try {
      await session.startTransaction();

      // Generate receipt number
      let mpesaReceiptNumber;
      try {
        // If Transaction has generateMpesaReceiptNumber method
        if (typeof Transaction.generateMpesaReceiptNumber === "function") {
          mpesaReceiptNumber = Transaction.generateMpesaReceiptNumber();
        } else {
          // Fallback
          mpesaReceiptNumber = `MPESA${Date.now().toString().slice(-8)}${Math.floor(
            Math.random() * 10000,
          )
            .toString()
            .padStart(4, "0")}`;
        }
      } catch (error) {
        // Another fallback
        mpesaReceiptNumber = `RC${Date.now().toString().slice(-10)}`;
      }

      console.log("📄 Generated receipt:", mpesaReceiptNumber);

      // Update transaction
      transaction.status = "SUCCESS";
      transaction.mpesaReceiptNumber = mpesaReceiptNumber;
      transaction.processedAt = new Date();
      transaction.updatedAt = new Date();
      transaction.pinAttempts += 1;
      transaction.paymentMethod = "WHATSAPP";
      transaction.whatsappResponse = {
        receivedAt: new Date(),
        pinReceived: true,
        pinDigits: pin.length,
        messageId: "whatsapp_webhook",
      };

      // Save transaction within session
      await transaction.save({ session });
      console.log("✅ Transaction saved with SUCCESS status");

      // Update customer
      const customer = await Customer.findById(transaction.customerId).session(
        session,
      );
      if (customer) {
        console.log(`👤 Updating customer: ${customer.name}`);

        // Use the pre-calculated balances from the transaction
        customer.loanBalance = transaction.loanBalanceAfter;
        customer.arrears = transaction.arrearsAfter;
        customer.totalRepayments += transaction.amount;
        customer.lastPaymentDate = new Date();
        customer.updatedAt = new Date();

        // FIX: Use updateOne to avoid middleware issues
        await Customer.updateOne(
          { _id: customer._id },
          {
            $set: {
              loanBalance: customer.loanBalance,
              arrears: customer.arrears,
              totalRepayments: customer.totalRepayments,
              lastPaymentDate: customer.lastPaymentDate,
              updatedAt: customer.updatedAt,
            },
          },
          { session },
        );

        console.log(`✅ Customer ${customer.name} balance updated`);
        console.log(`💰 New loan balance: ${customer.loanBalance}`);
        console.log(`📊 New arrears: ${customer.arrears}`);
      } else {
        console.log("❌ Customer not found for transaction");
      }

      // Commit the transaction
      await session.commitTransaction();
      console.log(`✅ Database transaction committed`);

      console.log(`🎉 Payment successful! Receipt: ${mpesaReceiptNumber}`);
      console.log(
        `✅ Transaction ${transaction.transactionId} marked as SUCCESS`,
      );

      // Send receipt via WhatsApp
      try {
        await WhatsAppService.sendPaymentReceipt(
          transaction.phoneNumber,
          transaction,
        );
        console.log("📱 Receipt sent via WhatsApp");
      } catch (receiptError) {
        console.error("Failed to send receipt:", receiptError.message);
        // Don't fail the whole process if receipt sending fails
      }

      return true;
    } catch (error) {
      await session.abortTransaction();
      console.error("❌ Transaction error:", error);
      console.error("Error stack:", error.stack);
      
      // Log transaction processing error
      await ActivityLogger.logError(
        transaction.initiatedByUserId,
        'TRANSACTION_FAIL',
        'Database transaction failed during payment processing',
        error,
        {
          transactionId: transaction.transactionId,
          session: 'active',
          duration: Date.now() - startTime
        }
      );
      
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("❌ Error in processPaymentWithPIN:", error);
    console.error("Error stack:", error.stack);
    
    await ActivityLogger.logError(
      transaction.initiatedByUserId,
      'TRANSACTION_FAIL',
      'Payment processing failed',
      error,
      {
        transactionId: transaction.transactionId,
        customerId: transaction.customerId,
        amount: transaction.amount,
        duration: Date.now() - startTime
      }
    );
    
    return false;
  }
}

// ==================== MANUAL PIN ENTRY ====================

/**
 * @desc    Manual PIN entry for testing
 * @route   POST /api/payments/manual-pin
 * @access  Private (All authenticated users)
 */
exports.manualPinEntry = async (req, res) => {
  const startTime = Date.now();
  const user = req.user;
  
  console.log("\n🔑 MANUAL PIN ENTRY REQUEST");
  console.log("Request body:", req.body);

  try {
    const { transactionId, pin } = req.body;

    if (!transactionId || !pin) {
      return res.status(400).json({
        success: false,
        message: "Please provide transaction ID and PIN",
      });
    }

    // SPECIAL FIX: Only accept 1234 for demo
    if (pin !== "1234") {
      // Log invalid PIN attempt
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_PROCESS',
        'Manual PIN entry failed - Invalid PIN',
        { code: 'INVALID_PIN' },
        {
          transactionId,
          expectedPin: '1234',
          receivedPin: pin
        }
      );
      
      return res.status(400).json({
        success: false,
        message: "❌ For demo purposes, please use PIN: 1234",
      });
    }

    // Find transaction
    const transaction = await Transaction.findOne({
      transactionId: transactionId,
      status: "PENDING",
    });

    if (!transaction) {
      console.log("❌ Transaction not found or not pending:", transactionId);
      
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_PROCESS',
        'Manual PIN entry failed - Transaction not found',
        { code: 'TRANSACTION_NOT_FOUND' },
        { transactionId }
      );
      
      return res.status(404).json({
        success: false,
        message: "Pending transaction not found",
      });
    }

    console.log(`Found transaction for: ${transaction.phoneNumber}`);
    console.log(`Transaction amount: ${transaction.amount}`);

    // Process payment
    const success = await processPaymentWithPIN(transaction, pin);

    if (success) {
      // Get updated transaction
      const updatedTransaction = await Transaction.findOne({
        transactionId: transactionId,
      });

      // Log successful manual PIN entry
      await ActivityLogger.logTransaction(
        user.id,
        'TRANSACTION_SUCCESS',
        updatedTransaction,
        {
          method: 'manual_pin',
          customerId: updatedTransaction.customerId,
          amount: updatedTransaction.amount,
          receiptNumber: updatedTransaction.mpesaReceiptNumber,
          duration: Date.now() - startTime
        }
      );

      res.json({
        success: true,
        message: "Payment processed successfully!",
        data: {
          receipt: updatedTransaction.mpesaReceiptNumber,
          amount: updatedTransaction.amount,
          transactionId: updatedTransaction.transactionId,
          newLoanBalance: updatedTransaction.loanBalanceAfter,
          newArrears: updatedTransaction.arrearsAfter,
          status: updatedTransaction.status,
        },
      });
    } else {
      // Get updated transaction to check status
      const updatedTransaction = await Transaction.findOne({
        transactionId: transactionId,
      });

      // Log failed manual PIN entry
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_FAIL',
        'Manual PIN entry processing failed',
        { code: 'MANUAL_PIN_FAILED' },
        {
          transactionId,
          status: updatedTransaction?.status,
          errorMessage: updatedTransaction?.errorMessage
        }
      );

      res.status(400).json({
        success: false,
        message: "❌ Payment failed",
        data: {
          status: updatedTransaction?.status || "FAILED",
          errorMessage:
            updatedTransaction?.errorMessage || "Payment processing failed",
        },
      });
    }
  } catch (error) {
    console.error("❌ Manual PIN endpoint error:", error);
    
    await ActivityLogger.logError(
      user.id,
      'TRANSACTION_PROCESS',
      'Manual PIN entry endpoint error',
      error,
      {
        transactionId: req.body.transactionId,
        endpoint: req.originalUrl
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
};

/**
 * @desc    Process MPesa PIN
 * @route   POST /api/payments/process-pin
 * @access  Private (All authenticated users)
 */
exports.processPin = async (req, res) => {
  const startTime = Date.now();
  const user = req.user;
  
  const session = await Transaction.startSession();
  session.startTransaction();

  try {
    const { transactionId, pin } = req.body;

    if (!transactionId || !pin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Please provide transaction ID and PIN",
      });
    }

    // Find transaction with customer data
    const transaction = await Transaction.findOne({
      transactionId: transactionId,
    })
      .populate("customerId")
      .session(session);

    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_PROCESS',
        'Transaction not found for PIN processing',
        { code: 'TRANSACTION_NOT_FOUND' },
        { transactionId }
      );
      
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Check if already processed
    if (transaction.status !== "PENDING") {
      await session.abortTransaction();
      session.endSession();
      
      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_PROCESS',
        `Transaction already ${transaction.status}`,
        { code: 'ALREADY_PROCESSED' },
        {
          transactionId,
          currentStatus: transaction.status
        }
      );
      
      return res.status(400).json({
        success: false,
        message: `Transaction already ${transaction.status.toLowerCase()}`,
      });
    }

    // Check pin attempts
    if (transaction.pinAttempts >= 3) {
      transaction.status = "FAILED";
      transaction.errorMessage = "Maximum PIN attempts exceeded";
      transaction.updatedAt = new Date();
      await transaction.save({ session });

      await session.commitTransaction();
      session.endSession();

      await ActivityLogger.logError(
        user.id,
        'TRANSACTION_FAIL',
        'Maximum PIN attempts exceeded',
        { code: 'MAX_PIN_ATTEMPTS' },
        {
          transactionId,
          pinAttempts: transaction.pinAttempts
        }
      );

      return res.status(400).json({
        success: false,
        message: "Maximum PIN attempts exceeded. Transaction failed.",
      });
    }

    // Find customer
    const customer = await Customer.findById(
      transaction.customerId._id,
    ).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Validate PIN (demo: ONLY ACCEPT 1234)
    if (pin === "1234") {
      // Successful payment
      let mpesaReceiptNumber;
      try {
        if (typeof Transaction.generateMpesaReceiptNumber === "function") {
          mpesaReceiptNumber = Transaction.generateMpesaReceiptNumber();
        } else {
          mpesaReceiptNumber = `MPESA${Date.now().toString().slice(-8)}${Math.floor(
            Math.random() * 10000,
          )
            .toString()
            .padStart(4, "0")}`;
        }
      } catch (error) {
        mpesaReceiptNumber = `RC${Date.now().toString().slice(-10)}`;
      }

      await PerformanceTracker.trackTransaction(user.id, transaction);

      // Update transaction
      transaction.status = "SUCCESS";
      transaction.mpesaReceiptNumber = mpesaReceiptNumber;
      transaction.processedAt = new Date();
      transaction.updatedAt = new Date();
      transaction.pinAttempts += 1;

      // Update customer
      customer.loanBalance = transaction.loanBalanceAfter;
      customer.arrears = transaction.arrearsAfter;
      customer.totalRepayments += transaction.amount;
      customer.lastPaymentDate = new Date();
      customer.updatedAt = new Date();

      // Save both in transaction
      await transaction.save({ session });
      await customer.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Log successful transaction
      await ActivityLogger.logTransaction(
        user.id,
        'TRANSACTION_SUCCESS',
        transaction,
        {
          customerName: customer.name,
          amount: transaction.amount,
          receiptNumber: mpesaReceiptNumber,
          duration: Date.now() - startTime
        }
      );

      // Response
      res.json({
        success: true,
        message: "Payment successful!",
        data: {
          receipt: mpesaReceiptNumber,
          amount: transaction.amount,
          newLoanBalance: customer.loanBalance,
          newArrears: customer.arrears,
          transactionId: transaction.transactionId,
          transactionDate: transaction.processedAt,
        },
      });
    } else {
      // Failed payment - increment attempt counter
      transaction.pinAttempts += 1;
      transaction.updatedAt = new Date();

      // Check if this was the final attempt
      if (transaction.pinAttempts >= 3) {
        transaction.status = "FAILED";
        transaction.errorMessage = "Maximum PIN attempts exceeded";
        
        await ActivityLogger.logError(
          user.id,
          'TRANSACTION_FAIL',
          'Maximum PIN attempts reached',
          { code: 'MAX_PIN_ATTEMPTS' },
          {
            transactionId,
            pinAttempts: transaction.pinAttempts
          }
        );
      } else {
        await ActivityLogger.logError(
          user.id,
          'TRANSACTION_PROCESS',
          `Invalid PIN attempt (${transaction.pinAttempts}/3)`,
          { code: 'INVALID_PIN' },
          {
            transactionId,
            pinAttempts: transaction.pinAttempts
          }
        );
      }

      await transaction.save({ session });
      await session.commitTransaction();
      session.endSession();

      const attemptsLeft = 3 - transaction.pinAttempts;

      res.status(400).json({
        success: false,
        message: `Invalid MPesa PIN. ${attemptsLeft > 0 ? `You have ${attemptsLeft} attempt(s) left.` : "Maximum attempts exceeded."}`,
        data: {
          attemptsLeft: Math.max(0, attemptsLeft),
        },
      });
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Process PIN error:", error);
    
    await ActivityLogger.logError(
      user.id,
      'TRANSACTION_PROCESS',
      'Failed to process PIN',
      error,
      {
        transactionId: req.body.transactionId,
        endpoint: req.originalUrl
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error processing payment",
    });
  }
};

/**
 * @desc    Get all transactions (with role-based filtering)
 * @route   GET /api/payments/transactions
 * @access  Private (All authenticated users)
 */
exports.getTransactions = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const user = req.user;
    const { limit = 50, status, customerId } = req.query;

    console.log(
      `📊 Get transactions request from: ${user.username} (${user.role})`,
    );

    let query = {};

    // Status filter
    if (status && status !== "all") {
      query.status = status;
    }

    // Customer filter
    if (customerId) {
      const customer = await Customer.findOne({
        $or: [{ _id: customerId }, { customerId: customerId }],
      });
      if (customer) {
        query.customerId = customer._id;
      }
    }

    // Role-based filtering
    if (user.role === "officer") {
      // Officers see only their own transactions
      query.initiatedByUserId = user._id;
    } else if (user.role === "supervisor") {
      // Supervisors see their team's transactions
      const teamMembers = await User.find({
        role: "officer",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);
      query.initiatedByUserId = { $in: teamMemberIds };
    }
    // Admins see all transactions (no filter)

    const transactions = await Transaction.find(query)
      .populate("customerId", "name phoneNumber customerId")
      .populate("initiatedByUserId", "username fullName role")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Format response
    const formattedTransactions = transactions.map((transaction) => ({
      id: transaction._id,
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      description: transaction.description,
      customer: {
        id: transaction.customerId?._id,
        name: transaction.customerId?.name,
        phone: transaction.customerId?.phoneNumber,
        customerId: transaction.customerId?.customerId,
      },
      initiatedBy: transaction.initiatedByUserId
        ? {
            id: transaction.initiatedByUserId._id,
            name:
              transaction.initiatedByUserId.fullName ||
              transaction.initiatedByUserId.username,
            role: transaction.initiatedByUserId.role,
          }
        : null,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      mpesaReceiptNumber: transaction.mpesaReceiptNumber,
    }));

    // Log transaction list view
    await ActivityLogger.log({
      userId: user.id,
      action: 'TRANSACTION_VIEW',
      description: `Viewed transaction list (${transactions.length} transactions)`,
      resourceType: 'SYSTEM',
      requestDetails: {
        filters: { status, customerId, limit },
        userRole: user.role,
        duration: Date.now() - startTime
      },
      tags: ['transaction', 'list', 'view']
    });

    res.json({
      success: true,
      message: "Transactions retrieved successfully",
      data: {
        transactions: formattedTransactions,
        count: formattedTransactions.length,
        userRole: user.role,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'TRANSACTION_VIEW',
      'Failed to fetch transactions',
      error,
      {
        endpoint: req.originalUrl,
        query: req.query
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Error fetching transactions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get recent transactions for dashboard
 * @route   GET /api/payments/recent-transactions
 * @access  Private (All authenticated users)
 */
exports.getRecentTransactions = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const user = req.user;
    const { limit = 20 } = req.query;

    console.log(
      `📊 Recent transactions request from: ${user.username} (${user.role})`,
    );

    let query = { status: "SUCCESS" };

    // Role-based filtering
    if (user.role === "officer") {
      // Officers see only their own transactions
      query.initiatedByUserId = user._id;
    } else if (user.role === "supervisor") {
      // Supervisors see their team's transactions
      const teamMembers = await User.find({
        role: "officer",
        isActive: true,
      }).select("_id");

      const teamMemberIds = teamMembers.map((member) => member._id);
      query.initiatedByUserId = { $in: teamMemberIds };
    }
    // Admins see all transactions (no filter)

    const transactions = await Transaction.find(query)
      .populate("customerId", "name phoneNumber customerId")
      .populate("initiatedByUserId", "username fullName role")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Format response
    const formattedTransactions = transactions.map((transaction) => ({
      id: transaction._id,
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      description: transaction.description,
      customer: {
        id: transaction.customerId?._id,
        name: transaction.customerId?.name,
        phone: transaction.customerId?.phoneNumber,
        customerId: transaction.customerId?.customerId,
      },
      initiatedBy: transaction.initiatedByUserId
        ? {
            id: transaction.initiatedByUserId._id,
            name:
              transaction.initiatedByUserId.fullName ||
              transaction.initiatedByUserId.username,
            role: transaction.initiatedByUserId.role,
          }
        : null,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    }));

    // Log recent transactions view
    await ActivityLogger.log({
      userId: user.id,
      action: 'TRANSACTION_VIEW',
      description: `Viewed recent transactions (${transactions.length} transactions)`,
      resourceType: 'SYSTEM',
      requestDetails: {
        limit,
        userRole: user.role,
        duration: Date.now() - startTime
      },
      tags: ['transaction', 'recent', 'dashboard']
    });

    res.json({
      success: true,
      message: "Recent transactions retrieved successfully",
      data: {
        transactions: formattedTransactions,
        count: formattedTransactions.length,
        userRole: user.role,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("Get recent transactions error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'TRANSACTION_VIEW',
      'Failed to fetch recent transactions',
      error,
      { endpoint: req.originalUrl, limit: req.query.limit }
    );
    
    res.status(500).json({
      success: false,
      message: "Error fetching recent transactions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @desc    Get transaction status
 * @route   GET /api/payments/status/:transactionId
 * @access  Private (All authenticated users)
 */
exports.getTransactionStatus = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId,
    })
      .populate("customerId", "name phoneNumber")
      .populate("initiatedByUserId", "username fullName role")
      .select("-__v");

    if (!transaction) {
      // Log transaction status check failure
      await ActivityLogger.logError(
        req.user.id,
        'TRANSACTION_VIEW',
        'Transaction not found for status check',
        { code: 'TRANSACTION_NOT_FOUND' },
        { transactionId: req.params.transactionId }
      );
      
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Log transaction status view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'TRANSACTION_VIEW',
      description: `Checked transaction status: ${transaction.transactionId} (${transaction.status})`,
      resourceType: 'TRANSACTION',
      resourceId: transaction._id,
      requestDetails: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        duration: Date.now() - startTime
      },
      tags: ['transaction', 'status', 'check']
    });

    res.json({
      success: true,
      message: "Transaction status retrieved",
      data: {
        transaction: {
          ...transaction.toObject(),
          initiatedBy: transaction.initiatedByUserId
            ? {
                id: transaction.initiatedByUserId._id,
                name:
                  transaction.initiatedByUserId.fullName ||
                  transaction.initiatedByUserId.username,
                role: transaction.initiatedByUserId.role,
              }
            : null,
        },
      },
    });
  } catch (error) {
    console.error("Get transaction status error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'TRANSACTION_VIEW',
      'Failed to fetch transaction status',
      error,
      {
        transactionId: req.params.transactionId,
        endpoint: req.originalUrl
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching transaction status",
    });
  }
};

/**
 * @desc    Check and expire old pending transactions (cron job)
 * @route   N/A (Runs automatically)
 * @access  Private (System)
 */
exports.checkExpiredTransactions = async () => {
  const startTime = Date.now();
  
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30000); // 30 seconds

    const expiredTransactions = await Transaction.find({
      status: "PENDING",
      createdAt: { $lt: thirtySecondsAgo },
    });

    if (expiredTransactions.length > 0) {
      console.log(`Found ${expiredTransactions.length} expired transactions`);

      for (const transaction of expiredTransactions) {
        transaction.status = "EXPIRED";
        transaction.failureReason = "EXPIRED";
        transaction.errorMessage =
          "Payment request expired (30 seconds) - Customer did not respond";
        transaction.updatedAt = new Date();
        await transaction.save();
        
        // Log expired transaction
        await ActivityLogger.logTransaction(
          transaction.initiatedByUserId,
          'TRANSACTION_EXPIRE',
          transaction,
          {
            reason: '30 second timeout',
            expiredAt: new Date(),
            durationPending: Date.now() - transaction.createdAt.getTime()
          }
        );
      }
      
      console.log(`✅ Expired ${expiredTransactions.length} transactions`);
    }
    
    console.log(`⏱️ Expiry check completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("Error checking expired transactions:", error);
    
    // Log cron job error
    await ActivityLogger.logError(
      null,
      'SYSTEM_ERROR',
      'Failed to check expired transactions',
      error,
      {
        job: 'checkExpiredTransactions',
        duration: Date.now() - startTime
      }
    );
  }
};

/**
 * @desc Fetches all performance metrics
 * @route GET /api/payments/performance-metrics
 * @access Private (Admin, Supervisor)
 */
exports.getPerformanceStats = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { timeframe = "weekly" } = req.query;

    const leaderboard = await PerformanceTracker.getLeaderboard(timeframe);

    // Get user's personal stats
    const userStats = await User.findById(req.user.id)
      .select("performanceMetrics currentStreak achievements dailyActivity")
      .lean();

    // Calculate rank
    const rank = await PerformanceTracker.calculateRank(req.user.id, timeframe);

    // Log performance metrics view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'SYSTEM_VIEW',
      description: `Viewed performance metrics (${timeframe})`,
      resourceType: 'SYSTEM',
      requestDetails: {
        timeframe,
        rank,
        leaderboardCount: leaderboard.length,
        duration: Date.now() - startTime
      },
      tags: ['performance', 'metrics', 'leaderboard']
    });

    res.json({
      success: true,
      data: {
        leaderboard,
        personalStats: {
          ...userStats,
          rank,
          performanceScore: calculatePerformanceScore(
            userStats.performanceMetrics,
          ),
        },
        timeframe,
      },
    });
  } catch (error) {
    console.error("Error getting performance stats:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to fetch performance stats',
      error,
      { endpoint: req.originalUrl, timeframe: req.query.timeframe }
    );
    
    res.status(500).json({
      success: false,
      message: "Error fetching performance stats",
    });
  }
};

function calculatePerformanceScore(metrics) {
  if (!metrics || metrics.totalTransactions === 0) return 0;

  const successRate =
    metrics.successfulTransactions / metrics.totalTransactions;
  const targetProgress = Math.min(
    metrics.totalCollections / (metrics.monthlyTarget || 1),
    1,
  );
  const efficiency = metrics.efficiencyRating / 10;

  return (successRate * 0.4 + targetProgress * 0.3 + efficiency * 0.3) * 100;
}

// Helper function for failure messages
function getFailureMessage(failureReason) {
  const messages = {
    INSUFFICIENT_FUNDS:
      "Customer has insufficient funds in their MPESA account",
    TECHNICAL_ERROR: "Technical error occurred during payment processing",
    WRONG_PIN: "Incorrect MPESA PIN entered",
    USER_CANCELLED: "Customer cancelled the payment",
    NETWORK_ERROR: "Network error occurred",
    EXPIRED: "Payment request expired (30 seconds) - Customer did not respond",
    OTHER: "Payment failed due to unknown reasons",
  };

  return messages[failureReason] || "Payment failed";
}

/**
 * @desc    Mark transaction as failed with specific reason
 * @route   POST /api/payments/mark-failed/:transactionId
 * @access  Private (Admin, Supervisor)
 */
exports.markTransactionFailed = async (req, res) => {
  const startTime = Date.now();
  const user = req.user;
  
  try {
    const { failureReason } = req.body;

    if (!failureReason) {
      return res.status(400).json({
        success: false,
        message: "Please provide a failure reason",
      });
    }

    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId,
      status: "PENDING",
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Pending transaction not found",
      });
    }

    // Store old status for logging
    const oldStatus = transaction.status;
    
    transaction.status = "FAILED";
    transaction.failureReason = failureReason;
    transaction.errorMessage = getFailureMessage(failureReason);
    transaction.updatedAt = new Date();
    await transaction.save();

    // Log manual transaction failure
    await ActivityLogger.logTransaction(
      user.id,
      'TRANSACTION_CANCEL',
      transaction,
      {
        oldStatus,
        newStatus: 'FAILED',
        failureReason,
        markedBy: user.username,
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      message: "Transaction marked as failed",
      data: { transaction },
    });
  } catch (error) {
    console.error("Mark transaction failed error:", error);
    
    await ActivityLogger.logError(
      user.id,
      'TRANSACTION_CANCEL',
      'Failed to mark transaction as failed',
      error,
      {
        transactionId: req.params.transactionId,
        failureReason: req.body.failureReason
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error marking transaction as failed",
    });
  }
};

/**
 * @desc    Cancel a pending transaction
 * @route   POST /api/payments/cancel/:transactionId
 * @access  Private (Admin, Supervisor)
 */
exports.cancelTransaction = async (req, res) => {
  const startTime = Date.now();
  const user = req.user;
  
  try {
    const transaction = await Transaction.findOne({
      transactionId: req.params.transactionId,
      status: "PENDING",
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Pending transaction not found or already processed",
      });
    }

    // Store old status for logging
    const oldStatus = transaction.status;
    
    transaction.status = "CANCELLED";
    transaction.updatedAt = new Date();
    transaction.errorMessage = "Cancelled by administrator";
    await transaction.save();

    // Log transaction cancellation
    await ActivityLogger.logTransaction(
      user.id,
      'TRANSACTION_CANCEL',
      transaction,
      {
        oldStatus,
        newStatus: 'CANCELLED',
        cancelledBy: user.username,
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      message: "Transaction cancelled successfully",
      data: { transaction },
    });
  } catch (error) {
    console.error("Cancel transaction error:", error);
    
    await ActivityLogger.logError(
      user.id,
      'TRANSACTION_CANCEL',
      'Failed to cancel transaction',
      error,
      { transactionId: req.params.transactionId }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error cancelling transaction",
    });
  }
};

/**
 * @desc    Test endpoint to check if server is working
 * @route   GET /api/payments/test
 * @access  Public
 */
exports.testEndpoint = async (req, res) => {
  console.log("Test endpoint called");
  
  // Log test endpoint access
  await ActivityLogger.log({
    userId: req.user?.id || null,
    action: 'SYSTEM_TEST',
    description: 'Accessed payment test endpoint',
    resourceType: 'SYSTEM',
    ipAddress: req.ip,
    tags: ['test', 'health-check']
  });
  
  res.json({
    success: true,
    message: "Payment API is working",
    timestamp: new Date(),
    environment: process.env.NODE_ENV,
    twilioConfigured: !!process.env.TWILIO_ACCOUNT_SID,
  });
};

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/payments/dashboard/stats
 * @access  Private (Admin, Supervisor)
 */
exports.getDashboardStats = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get statistics
    const [
      totalTransactions,
      successfulTransactions,
      pendingTransactions,
      failedTransactions,
      totalAmount,
      todayAmount,
      totalCustomers,
    ] = await Promise.all([
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: "SUCCESS" }),
      Transaction.countDocuments({ status: "PENDING" }),
      Transaction.countDocuments({ status: "FAILED" }),
      Transaction.aggregate([
        { $match: { status: "SUCCESS" } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            status: "SUCCESS",
            createdAt: { $gte: today, $lt: tomorrow },
          },
        },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]),
      Customer.countDocuments({ isActive: true }),
    ]);

    const totalAmountValue = totalAmount[0] ? totalAmount[0].totalAmount : 0;
    const todayAmountValue = todayAmount[0] ? todayAmount[0].totalAmount : 0;
    const successRate =
      totalTransactions > 0
        ? ((successfulTransactions / totalTransactions) * 100).toFixed(2)
        : 0;

    // Log dashboard stats view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'SYSTEM_VIEW',
      description: 'Viewed payment dashboard statistics',
      resourceType: 'SYSTEM',
      requestDetails: {
        stats: {
          totalTransactions,
          successfulTransactions,
          totalAmount: totalAmountValue,
          todayAmount: todayAmountValue,
          successRate: parseFloat(successRate)
        },
        duration: Date.now() - startTime
      },
      tags: ['dashboard', 'statistics', 'payments']
    });

    res.json({
      success: true,
      data: {
        totalTransactions,
        successfulTransactions,
        pendingTransactions,
        failedTransactions,
        totalAmount: totalAmountValue,
        todayAmount: todayAmountValue,
        totalCustomers,
        successRate: parseFloat(successRate),
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to fetch payment dashboard statistics',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching dashboard statistics",
    });
  }
};

/**
 * @desc    Get transaction by ID
 * @route   GET /api/payments/transaction/:id
 * @access  Private (All authenticated users)
 */
exports.getTransactionById = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("customerId", "name phoneNumber customerId")
      .populate("initiatedByUserId", "username fullName role")
      .select("-__v");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Log transaction view by ID
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'TRANSACTION_VIEW',
      description: `Viewed transaction details: ${transaction.transactionId}`,
      resourceType: 'TRANSACTION',
      resourceId: transaction._id,
      requestDetails: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        duration: Date.now() - startTime
      },
      tags: ['transaction', 'details', 'view']
    });

    res.json({
      success: true,
      data: {
        transaction: {
          ...transaction.toObject(),
          initiatedBy: transaction.initiatedByUserId
            ? {
                id: transaction.initiatedByUserId._id,
                name:
                  transaction.initiatedByUserId.fullName ||
                  transaction.initiatedByUserId.username,
                role: transaction.initiatedByUserId.role,
              }
            : null,
        },
      },
    });
  } catch (error) {
    console.error("Get transaction by ID error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'TRANSACTION_VIEW',
      'Failed to fetch transaction by ID',
      error,
      {
        transactionId: req.params.id,
        endpoint: req.originalUrl
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching transaction",
    });
  }
};

/**
 * @desc    Debug transaction model
 * @route   GET /api/payments/debug-transaction
 * @access  Private (Admin, Supervisor)
 */
exports.debugTransactionModel = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Check if Transaction model has required methods
    const hasGenerateMethod =
      typeof Transaction.generateMpesaReceiptNumber === "function";

    // Check a sample transaction
    const sampleTransaction = await Transaction.findOne().sort({
      createdAt: -1,
    });

    // Log debug access
    await ActivityLogger.logSystem(
      req.user.id,
      'SYSTEM_DEBUG',
      'Debugged transaction model',
      {
        hasGenerateMethod,
        sampleTransaction: sampleTransaction ? 'found' : 'not found',
        duration: Date.now() - startTime
      }
    );

    res.json({
      success: true,
      data: {
        modelInfo: {
          hasGenerateMpesaReceiptNumber: hasGenerateMethod,
          modelName: Transaction.modelName,
        },
        sampleTransaction: sampleTransaction
          ? {
              id: sampleTransaction._id,
              transactionId: sampleTransaction.transactionId,
              status: sampleTransaction.status,
              paymentMethod: sampleTransaction.paymentMethod,
              pinAttempts: sampleTransaction.pinAttempts,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Debug error:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_DEBUG',
      'Failed to debug transaction model',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: "Debug error: " + error.message,
    });
  }
};

/**
 * @desc    Get transactions for logged-in officer
 * @route   GET /api/transactions/my-transactions
 * @access  Private (Officers only)
 */
exports.getMyTransactions = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get query parameters
    const {
      limit = 50,
      page = 1,
      status,
      startDate,
      endDate,
      customerId,
    } = req.query;

    console.log(`💳 Fetching transactions for officer ${userId}`);

    // Build query
    let query = {};

    if (userRole === "officer") {
      query = {
        $or: [
          { createdBy: userId }, 
          { officerId: userId }, 
          { userId: userId },
          { initiatedByUserId: userId }
        ],
      };
    }
    // Add filters if provided
    if (status) query.status = status;
    if (customerId) query.customerId = customerId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate("customerId", "name phoneNumber loanBalance")
        .populate("initiatedByUserId", "name username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Transaction.countDocuments(query),
    ]);

    // Calculate totals
    const successfulTransactions = transactions.filter(
      (t) => t.status === "SUCCESS"
    );

    const totalAmount = successfulTransactions.reduce(
      (sum, trans) => sum + parseFloat(trans.amount || 0),
      0
    );

    // Log officer's transaction view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'TRANSACTION_VIEW',
      description: `Officer viewed personal transactions (${transactions.length} of ${total})`,
      resourceType: 'SYSTEM',
      requestDetails: {
        page,
        limit,
        filters: { status, startDate, endDate, customerId },
        summary: {
          total,
          successful: successfulTransactions.length,
          totalAmount
        },
        duration: Date.now() - startTime
      },
      tags: ['transaction', 'officer', 'personal']
    });

    res.status(200).json({
      success: true,
      count: transactions.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: {
        transactions,
        summary: {
          totalTransactions: total,
          successfulCount: successfulTransactions.length,
          totalAmount,
          pendingCount: transactions.filter((t) => t.status === "PENDING")
            .length,
          failedCount: transactions.filter((t) => t.status === "FAILED").length,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error in getMyTransactions:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'TRANSACTION_VIEW',
      'Failed to fetch officer transactions',
      error,
      {
        endpoint: req.originalUrl,
        userId: req.user.id
      }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching transactions",
    });
  }
};

/**
 * @desc    Get officer's collections summary
 * @route   GET /api/transactions/my-collections
 * @access  Private (Officers only)
 */
exports.getMyCollections = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const userId = req.user.id;

    console.log(`💰 Fetching collections for officer ${userId}`);

    // Get all successful transactions by this officer
    const transactions = await Transaction.find({
      $or: [
        { createdBy: userId }, 
        { officerId: userId }, 
        { userId: userId },
        { initiatedByUserId: userId }
      ],
      status: "SUCCESS",
    })
      .populate("customerId", "name phoneNumber")
      .sort({ createdAt: -1 })
      .lean();

    // Calculate daily, weekly, monthly totals
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayCollections = transactions
      .filter((t) => new Date(t.createdAt) >= oneDayAgo)
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const weekCollections = transactions
      .filter((t) => new Date(t.createdAt) >= oneWeekAgo)
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const monthCollections = transactions
      .filter((t) => new Date(t.createdAt) >= oneMonthAgo)
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const allTimeCollections = transactions.reduce(
      (sum, t) => sum + parseFloat(t.amount || 0),
      0
    );

    // Log collections summary view
    await ActivityLogger.log({
      userId: req.user.id,
      action: 'SYSTEM_VIEW',
      description: `Officer viewed collections summary`,
      resourceType: 'SYSTEM',
      requestDetails: {
        collections: {
          today: todayCollections,
          week: weekCollections,
          month: monthCollections,
          allTime: allTimeCollections,
          transactionCount: transactions.length
        },
        duration: Date.now() - startTime
      },
      tags: ['collections', 'summary', 'officer']
    });

    res.status(200).json({
      success: true,
      data: {
        transactions: transactions.slice(0, 20), // Last 20 transactions
        summary: {
          today: todayCollections,
          thisWeek: weekCollections,
          thisMonth: monthCollections,
          allTime: allTimeCollections,
          transactionCount: transactions.length,
          averageAmount:
            transactions.length > 0
              ? allTimeCollections / transactions.length
              : 0,
        },
        recentActivity: transactions.slice(0, 10), // Last 10 for dashboard
      },
    });
  } catch (error) {
    console.error("❌ Error in getMyCollections:", error);
    
    await ActivityLogger.logError(
      req.user.id,
      'SYSTEM_ERROR',
      'Failed to fetch officer collections',
      error,
      { endpoint: req.originalUrl }
    );
    
    res.status(500).json({
      success: false,
      message: "Server error fetching collections",
    });
  }
};

// Schedule cron job to check for expired transactions every 10 seconds
cron.schedule("*/10 * * * * *", () => {
  console.log("Checking for expired transactions...");
  exports.checkExpiredTransactions();
});

// ============================================
// EXPORTS - MAKE SURE ALL FUNCTIONS ARE INCLUDED
// ============================================
module.exports = {
  initiateSTKPush: exports.initiateSTKPush,
  processWhatsAppResponse: exports.processWhatsAppResponse,
  manualPinEntry: exports.manualPinEntry,
  processPin: exports.processPin,
  getTransactions: exports.getTransactions,
  getRecentTransactions: exports.getRecentTransactions,
  getTransactionStatus: exports.getTransactionStatus,
  checkExpiredTransactions: exports.checkExpiredTransactions,
  getPerformanceStats: exports.getPerformanceStats,
  markTransactionFailed: exports.markTransactionFailed,
  cancelTransaction: exports.cancelTransaction,
  testEndpoint: exports.testEndpoint,
  getDashboardStats: exports.getDashboardStats,
  getTransactionById: exports.getTransactionById,
  debugTransactionModel: exports.debugTransactionModel,
  // Officer-specific functions
  getMyTransactions: exports.getMyTransactions,
  getMyCollections: exports.getMyCollections,
  checkExpiredTransactions: exports.checkExpiredTransactions,
};