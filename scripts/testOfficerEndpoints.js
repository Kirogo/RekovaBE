// testOfficerEndpoints.js
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
const TOKEN = 'YOUR_OFFICER_TOKEN_HERE'; // Get from login

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testEndpoints() {
  try {
    console.log('🧪 Testing officer-specific endpoints...\n');
    
    // 1. Test assigned customers
    console.log('1. Testing /customers/assigned-to-me');
    const customersRes = await api.get('/customers/assigned-to-me');
    console.log(`✅ Found ${customersRes.data.count} customers\n`);
    
    // 2. Test officer stats
    console.log('2. Testing /customers/dashboard/officer-stats');
    const statsRes = await api.get('/customers/dashboard/officer-stats');
    console.log(`✅ Stats: ${JSON.stringify(statsRes.data.data.stats, null, 2)}\n`);
    
    // 3. Test my transactions
    console.log('3. Testing /payments/my-transactions');
    const transRes = await api.get('/payments/my-transactions?limit=5');
    console.log(`✅ Found ${transRes.data.count} transactions\n`);
    
    // 4. Test my collections
    console.log('4. Testing /payments/my-collections');
    const collRes = await api.get('/payments/my-collections');
    console.log(`✅ Collections: ${JSON.stringify(collRes.data.data.summary, null, 2)}\n`);
    
    // 5. Test my promises
    console.log('5. Testing /promises/my-promises');
    const promisesRes = await api.get('/promises/my-promises');
    console.log(`✅ Found ${promisesRes.data.count} promises\n`);
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testEndpoints();