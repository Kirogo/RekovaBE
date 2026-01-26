// verify-twilio-webhook.js
const twilio = require('twilio');

async function verifyTwilioWebhook() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = twilio(accountSid, authToken);
    
    console.log('🔍 Checking Twilio WhatsApp sandbox configuration...');
    
    // Try to get the WhatsApp sandbox configuration
    // Note: This requires appropriate Twilio permissions
    const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    
    console.log('📞 Available phone numbers:');
    incomingPhoneNumbers.forEach(number => {
      console.log(`  - ${number.friendlyName}: ${number.phoneNumber}`);
      if (number.smsUrl) console.log(`    SMS URL: ${number.smsUrl}`);
      if (number.statusCallback) console.log(`    Status URL: ${number.statusCallback}`);
    });
    
    console.log('\n✅ To set up webhook:');
    console.log('1. Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
    console.log('2. Find "WHEN A MESSAGE COMES IN" field');
    console.log('3. Set it to: https://blossom-nondiscoverable-christene.ngrok-free.dev/api/payments/whatsapp-response');
    console.log('4. Click "Save"');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Manual setup instructions:');
    console.log('1. Go to Twilio Console → Messaging → Try it out → Send a WhatsApp message');
    console.log('2. Look for the sandbox configuration');
    console.log('3. Set "WHEN A MESSAGE COMES IN" to your ngrok URL:');
    console.log('   https://blossom-nondiscoverable-christene.ngrok-free.dev/api/payments/whatsapp-response');
  }
}

verifyTwilioWebhook();