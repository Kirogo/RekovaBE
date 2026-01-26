// monitor-webhook.js
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    const timestamp = new Date().toISOString();
    const logEntry = `
=== WEBHOOK RECEIVED at ${timestamp} ===
Method: ${req.method}
URL: ${req.url}
Headers: ${JSON.stringify(req.headers, null, 2)}
Body: ${body}
=== END ===

`;
    
    console.log(logEntry);
    
    // Log to file
    fs.appendFile('webhook-logs.txt', logEntry, (err) => {
      if (err) console.error('Failed to write log:', err);
    });
    
    // Always respond with 200 OK for Twilio
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
});

server.listen(4041, () => {
  console.log('🔍 Webhook monitor listening on http://localhost:4041');
  console.log('📝 Set Twilio webhook to: https://blossom-nondiscoverable-christene.ngrok-free.dev/webhook-test');
  console.log('📊 Logs will be saved to webhook-logs.txt');
});