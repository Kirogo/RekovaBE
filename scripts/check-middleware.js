// check-middleware.js
console.log('=== CHECKING MIDDLEWARE ===\n');

const middlewares = [
  { name: 'frontendDebug', path: './middleware/frontendDebug' },
  { name: 'apiResponseFormatter', path: './middleware/frontendDebug' },
  { name: 'requestLogger', path: './middleware/activityLogger' }
];

middlewares.forEach(({ name, path }) => {
  console.log(`Checking: ${name} from ${path}`);
  try {
    const module = require(path);
    const middleware = module[name] || module;
    console.log(`✅ Loaded successfully`);
    console.log(`   Type: ${typeof middleware}`);
    console.log(`   Is function: ${typeof middleware === 'function'}`);
    console.log(`   Function name: ${middleware.name || 'anonymous'}`);
    console.log('');
  } catch (error) {
    console.log(`❌ Error loading: ${error.message}`);
    console.log('');
  }
});

console.log('=== CHECKING ROUTE FILES ===\n');

const routeFiles = [
  'authRoutes',
  'customerRoutes',
  'commentRoutes',
  'paymentRoutes',
  'promiseRoutes',
  'testRoutes',
  'transactions',
  'supervisorRoutes',
  'activityRoutes',
  'reports'
];

routeFiles.forEach(fileName => {
  console.log(`Checking: ${fileName}`);
  try {
    const route = require(`./routes/${fileName}`);
    console.log(`✅ Loaded successfully`);
    console.log(`   Type: ${typeof route}`);
    console.log(`   Is function: ${typeof route === 'function'}`);
    console.log(`   Is router: ${route && typeof route === 'function' && route.name === 'router'}`);
    console.log('');
  } catch (error) {
    console.log(`❌ Error loading: ${error.message}`);
    console.log('');
  }
});