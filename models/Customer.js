// models/Customer.js

const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  customerInternalId: {
    type: String,
    required: true,
    unique: true,
    index: true  // Keep this
  },
  customerId: {
    type: String,
    required: true,
    unique: true,
    index: true  // Keep this
  },
  phoneNumber: {
    type: String,
    required: [true, 'Please provide a phone number'],
    unique: true,
    trim: true,
    index: true  // Keep this
  },
  name: {
    type: String,
    required: [true, 'Please provide customer name'],
    trim: true
  },
  accountNumber: {
    type: String,
    required: true,
    unique: true,
    index: true  // Keep this
  },
  loanBalance: {
    type: Number,
    required: true,
    min: [0, 'Loan balance cannot be negative'],
    default: 0
  },
  arrears: {
    type: Number,
    required: true,
    min: [0, 'Arrears cannot be negative'],
    default: 0
  },
  totalRepayments: {
    type: Number,
    default: 0,
    min: [0, 'Total repayments cannot be negative']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  nationalId: {
    type: String,
    trim: true,
    sparse: true,
    index: { sparse: true }  // Keep sparse index
  },
  lastPaymentDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true  // Keep this
  },
  createdBy: {
    type: String,
    required: true
  },
  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  promiseCount: {
    type: Number,
    default: 0
  },
  fulfilledPromiseCount: {
    type: Number,
    default: 0
  },
  lastPromiseDate: {
    type: Date
  },
  promiseFulfillmentRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
}, {
  timestamps: true
});

// NO pre-save middleware

// Only add indexes for fields that DON'T have index: true above
// DON'T add customerId, phoneNumber, accountNumber, isActive here
CustomerSchema.index({ loanBalance: -1 });
CustomerSchema.index({ arrears: -1 });
CustomerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Customer', CustomerSchema);