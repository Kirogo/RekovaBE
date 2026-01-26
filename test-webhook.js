// test-webhook.js
const axios = require('axios');

async function testWebhookManually() {
  try {
    console.log('Testing WhatsApp webhook manually...');
    
    // Simulate a WhatsApp message from Twilio
    const formData = new URLSearchParams();
    formData.append('From', 'whatsapp:+254707812730'); // Use the exact phone from your logs
    formData.append('Body', '1234');
    formData.append('MessageSid', 'SM1234567890abcdef');
    formData.append('AccountSid', 'ACtest123');
    formData.append('To', 'whatsapp:+14155238886');
    
    const response = await axios.post(
      'http://localhost:5000/api/payments/whatsapp-response',
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      }
    );
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Also check pending transactions
async function checkPendingTransactions() {
  try {
    const mongoose = require('mongoose');
    const Transaction = require('./models/Transaction');
    
    await mongoose.connect('mongodb+srv://kirogo:kirogo1234@stkpush.m8ayd4a.mongodb.net/');
    
    const pending = await Transaction.find({ status: 'PENDING' });
    console.log('\n📊 PENDING TRANSACTIONS:');
    pending.forEach(tx => {
      console.log(`ID: ${tx.transactionId}`);
      console.log(`Phone: ${tx.phoneNumber}`);
      console.log(`Amount: ${tx.amount}`);
      console.log(`Created: ${tx.createdAt}`);
      console.log('---');
    });
    
  } catch (error) {
    console.error('Error checking transactions:', error);
  }
}

// Run tests
checkPendingTransactions().then(() => {
  setTimeout(testWebhookManually, 1000);
});