// debug-routes.js
const fs = require('fs');
const path = require('path');

const routeFiles = [
  'authRoutes',
  'customerRoutes',
  'paymentRoutes',
  'promiseRoutes',
  'testRoutes',
  'transactions',
  'supervisorRoutes',
  'activityRoutes',
  'commentRoutes',
  'reports'
];

console.log('=== DEBUGGING ROUTE FILES ===\n');

routeFiles.forEach(fileName => {
  const filePath = `./routes/${fileName}.js`;
  const fullPath = path.join(__dirname, 'routes', `${fileName}.js`);
  
  console.log(`Checking: ${filePath}`);
  
  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ File does not exist: ${filePath}\n`);
    return;
  }
  
  // Try to require it
  try {
    const route = require(fullPath);
    console.log(`✅ File exists`);
    console.log(`   Type: ${typeof route}`);
    console.log(`   Is function: ${typeof route === 'function'}`);
    console.log(`   Has router: ${route && typeof route === 'function' && route.name === 'router'}`);
    console.log(`   Value: ${route ? 'Not null' : 'Null/Undefined'}\n`);
  } catch (error) {
    console.log(`❌ Error requiring ${filePath}: ${error.message}\n`);
  }
});