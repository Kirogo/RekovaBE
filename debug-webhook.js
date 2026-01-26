// debug-webhook.js - Test script
const axios = require('axios');

async function testWebhook() {
  try {
    console.log('Testing WhatsApp webhook...');
    
    const testData = {
      From: 'whatsapp:+254712345678',
      Body: '1234',
      MessageSid: 'SM1234567890'
    };

    const response = await axios.post('http://localhost:5000/api/payments/whatsapp-response', testData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Also test manual PIN endpoint
async function testManualPin() {
  try {
    console.log('\nTesting manual PIN endpoint...');
    
    // First create a transaction
    const createResponse = await axios.post('http://localhost:5000/api/payments/initiate', {
      phoneNumber: '254712345678',
      amount: 100,
      description: 'Test payment',
      customerId: 'some-customer-id' // Use a real customer ID
    }, {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE'
      }
    });

    console.log('Create response:', createResponse.data);
    
    if (createResponse.data.success) {
      const transactionId = createResponse.data.data.transaction.transactionId;
      
      // Now test manual PIN
      const pinResponse = await axios.post('http://localhost:5000/api/payments/manual-pin', {
        transactionId: transactionId,
        pin: '1234'
      }, {
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN_HERE'
        }
      });

      console.log('PIN response:', pinResponse.data);
    }
    
  } catch (error) {
    console.error('Manual PIN test error:', error.message);
  }
}

// Run tests
testWebhook();
// testManualPin();