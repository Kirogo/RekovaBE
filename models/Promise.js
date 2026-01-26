//models/Promise.js

const mongoose = require('mongoose');

const PromiseSchema = new mongoose.Schema({
  promiseId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => {
      const timestamp = Date.now().toString().slice(-8);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `PRM${timestamp}${random}`;
    }
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  customerName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    index: true
  },
  promiseAmount: {
    type: Number,
    required: true,
    min: [0, 'Promise amount cannot be negative']
  },
  promiseDate: {
    type: Date,
    required: true,
    index: true
  },
  promiseType: {
    type: String,
    enum: ['FULL_PAYMENT', 'PARTIAL_PAYMENT', 'SETTLEMENT', 'PAYMENT_PLAN'],
    default: 'FULL_PAYMENT'
  },
  status: {
    type: String,
    enum: ['PENDING', 'FULFILLED', 'BROKEN', 'RESCHEDULED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  fulfillmentAmount: {
    type: Number,
    default: 0
  },
  fulfillmentDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: {
    type: String,
    required: true
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  nextFollowUpDate: {
    type: Date,
    index: true
  },
  followUpCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
PromiseSchema.index({ customerId: 1, status: 1 });
PromiseSchema.index({ promiseDate: 1, status: 1 });
PromiseSchema.index({ createdBy: 1, createdAt: -1 });
PromiseSchema.index({ nextFollowUpDate: 1, status: 'PENDING' });

// PromiseSchema.pre('save', function(next) {
//   if (!this.promiseId) {
//     // This shouldn't happen since we have a default function
//     const timestamp = Date.now().toString().slice(-8);
//     const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
//     this.promiseId = `PRM${timestamp}${random}`;
//   }
//   next();
// });

module.exports = mongoose.model('Promise', PromiseSchema);