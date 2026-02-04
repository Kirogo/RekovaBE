// scripts/debug-route-files.js
const fs = require('fs');
const path = require('path');

console.log('=== DETAILED ROUTE FILE DEBUG ===\n');

const routeFiles = [
  'authRoutes.js',
  'customerRoutes.js', 
  'paymentRoutes.js',
  'promiseRoutes.js',
  'testRoutes.js',
  'transactions.js',
  'supervisorRoutes.js',
  'activityRoutes.js',
  'commentRoutes.js',
  'reports.js'
];

routeFiles.forEach(fileName => {
  const filePath = path.join(__dirname, '..', 'routes', fileName);
  
  console.log(`📁 ${fileName}:`);
  console.log(`   Path: ${filePath}`);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.log('   ❌ File does not exist');
    console.log('');
    return;
  }
  
  // Read file content
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for common issues
    const hasModuleExports = content.includes('module.exports');
    const hasExportDefault = content.includes('export default');
    const hasExportRouter = content.includes('module.exports = router');
    const hasExpress = content.includes('express');
    const hasRouter = content.includes('Router');
    
    console.log(`   ✅ File exists`);
    console.log(`   Size: ${content.length} bytes`);
    console.log(`   Has module.exports: ${hasModuleExports}`);
    console.log(`   Has export default: ${hasExportDefault}`);
    console.log(`   Has module.exports = router: ${hasExportRouter}`);
    console.log(`   Has express: ${hasExpress}`);
    console.log(`   Has Router: ${hasRouter}`);
    
    // Show first 3 lines
    const lines = content.split('\n').slice(0, 5);
    console.log(`   First ${lines.length} lines:`);
    lines.forEach((line, i) => {
      console.log(`      ${i+1}: ${line.trim()}`);
    });
    
    // Try to require it
    try {
      delete require.cache[require.resolve(filePath)];
      const route = require(filePath);
      console.log(`   ✅ Require successful`);
      console.log(`      Type: ${typeof route}`);
      console.log(`      Is function: ${typeof route === 'function'}`);
      if (route && typeof route === 'function') {
        console.log(`      Function name: ${route.name || 'anonymous'}`);
        console.log(`      Is router: ${route.name === 'router'}`);
      }
      console.log(`      Has handle method: ${route && typeof route.handle === 'function'}`);
      console.log(`      Has use method: ${route && typeof route.use === 'function'}`);
      console.log(`      Has get method: ${route && typeof route.get === 'function'}`);
      console.log(`      Has post method: ${route && typeof route.post === 'function'}`);
    } catch (requireError) {
      console.log(`   ❌ Require error: ${requireError.message}`);
      console.log(`      Error line: ${requireError.stack.split('\n')[1]}`);
    }
    
  } catch (readError) {
    console.log(`   ❌ Read error: ${readError.message}`);
  }
  
  console.log('');
});

console.log('=== CHECKING server.js IMPORTS ===\n');

// Read server.js to see import order
try {
  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  // Find all require statements
  const requireLines = serverContent.split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(item => item.line.includes('require(') && item.line.includes('routes'));
  
  console.log('Route imports in server.js:');
  requireLines.forEach(item => {
    console.log(`   Line ${item.number}: ${item.line}`);
  });
  
  // Find app.use lines
  const useLines = serverContent.split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(item => item.line.includes('app.use(') && item.line.includes('/api/'));
  
  console.log('\nRoute mounting in server.js:');
  useLines.forEach(item => {
    console.log(`   Line ${item.number}: ${item.line}`);
  });
  
} catch (error) {
  console.log(`Error reading server.js: ${error.message}`);
}