// backend/features/promise-to-pay/services/reminderService.js

const cron = require('node-cron');
const Promise = require('../models/Promise');
const WhatsAppService = require('../../../services/whatsappService');

class ReminderService {
  constructor() {
    console.log('⏰ Initializing Promise Reminder Service...');
    this.initReminderJob();
  }

  initReminderJob() {
    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
      console.log('⏰ Running promise reminder check...');
      await this.checkAndSendReminders();
    });

    console.log('✅ Promise reminder service initialized');
  }

  async checkAndSendReminders() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 2); // Remind for promises due in next 2 days

      // Find promises needing reminder
      const promises = await Promise.find({
        status: 'PENDING',
        promiseDate: { $lte: tomorrow, $gte: today },
        reminderSent: false
      }).populate('customerId');

      console.log(`Found ${promises.length} promises needing reminders`);

      for (const promise of promises) {
        try {
          await this.sendReminder(promise);
          promise.reminderSent = true;
          promise.followUpCount += 1;
          await promise.save();
        } catch (error) {
          console.error(`Failed to send reminder for promise ${promise.promiseId}:`, error);
        }
      }

    } catch (error) {
      console.error('Reminder service error:', error);
    }
  }

  async sendReminder(promise) {
    const customerName = promise.customerName;
    const phoneNumber = promise.phoneNumber;
    const promiseAmount = promise.promiseAmount;
    const promiseDate = new Date(promise.promiseDate).toLocaleDateString('en-KE');
    const promiseId = promise.promiseId;

    const message = `*Promise Reminder*\n\nDear ${customerName},\n\nThis is a reminder about your payment promise of KES ${promiseAmount.toLocaleString()} due on ${promiseDate}.\n\nPromise ID: ${promiseId}\n\nPlease ensure you have sufficient funds to fulfill your promise.\n\nThank you.`;

    try {
      await WhatsAppService.sendPaymentRequest(phoneNumber, customerName, promiseAmount, promiseId);
      console.log(`✅ Reminder sent for promise ${promiseId}`);
    } catch (error) {
      console.error(`Failed to send WhatsApp reminder:`, error);
      // You could implement SMS fallback here
    }
  }
}

module.exports = new ReminderService();