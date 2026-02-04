// scripts/testOfficer.js
const axios = require('axios');

const testOfficerEndpoints = async () => {
  console.log('🧪 Testing Officer Endpoints\n');
  
  // Try multiple officer usernames in case one doesn't work
  const testCredentials = [
    { username: 'samuel.kirogo', password: 'password123' },
    { username: 'paul.ndirangu', password: 'password123' },
    { username: 'sarah.wangechi', password: 'password123' },
    { username: 'michael.mwai', password: 'password123' },
    { username: 'jane.akinyi', password: 'password123' }
  ];

  let token = null;
  let user = null;

  // Try to login with each set of credentials
  for (const creds of testCredentials) {
    try {
      console.log(`Trying to login as ${creds.username}...`);
      const loginRes = await axios.post('http://localhost:5000/api/auth/login', creds);
      
      if (loginRes.data.success) {
        token = loginRes.data.data.token || loginRes.data.token;
        user = loginRes.data.data.user || loginRes.data.data;
        console.log(`✅ Login successful as ${user.username} (${user.role})`);
        console.log(`   Token received\n`);
        break;
      }
    } catch (error) {
      // Continue to next credentials
      console.log(`❌ Login failed for ${creds.username}: ${error.response?.data?.message || error.message}`);
    }
  }

  if (!token) {
    console.log('\n❌ Could not login with any test credentials.');
    console.log('Please check:');
    console.log('1. Is the backend running on port 5000?');
    console.log('2. Do you have officer users in the database?');
    console.log('3. Try logging in via the frontend first');
    return;
  }

  // Create axios instance with token
  const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // Test endpoints one by one
  const endpoints = [
    {
      name: 'GET /customers/assigned-to-me',
      url: '/customers/assigned-to-me',
      method: 'get'
    },
    {
      name: 'GET /customers/dashboard/officer-stats',
      url: '/customers/dashboard/officer-stats',
      method: 'get'
    },
    {
      name: 'GET /payments/my-transactions',
      url: '/payments/my-transactions?limit=5',
      method: 'get'
    },
    {
      name: 'GET /payments/my-collections',
      url: '/payments/my-collections',
      method: 'get'
    },
    {
      name: 'GET /promises/my-promises',
      url: '/promises/my-promises',
      method: 'get'
    }
  ];

  console.log('📋 Testing endpoints:\n');

  for (const endpoint of endpoints) {
    try {
      console.log(`➡️  Testing ${endpoint.name}`);
      const response = await api[endpoint.method](endpoint.url);
      
      console.log(`   ✅ Status: ${response.status}`);
      
      // Show some data based on endpoint
      if (endpoint.url.includes('assigned-to-me')) {
        const count = response.data.count || response.data.data?.customers?.length || 0;
        console.log(`   📊 Found ${count} assigned customers`);
      } else if (endpoint.url.includes('officer-stats')) {
        const stats = response.data.data?.stats;
        if (stats) {
          console.log(`   📈 Assigned Customers: ${stats.assignedCustomers || 0}`);
          console.log(`   💰 Total Collections: ${stats.totalCollections || 0}`);
        }
      } else if (endpoint.url.includes('my-transactions')) {
        const count = response.data.count || response.data.data?.transactions?.length || 0;
        console.log(`   💳 Found ${count} transactions`);
      } else if (endpoint.url.includes('my-collections')) {
        const summary = response.data.data?.summary;
        if (summary) {
          console.log(`   💰 All Time: ${summary.allTime || 0}`);
          console.log(`   📅 Today: ${summary.today || 0}`);
        }
      } else if (endpoint.url.includes('my-promises')) {
        const count = response.data.count || response.data.data?.promises?.length || 0;
        console.log(`   🤝 Found ${count} promises`);
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.status || error.code}`);
      console.log(`   Message: ${error.response?.data?.message || error.message}`);
      
      // Show helpful debug info
      if (error.response?.status === 404) {
        console.log(`   💡 Endpoint not found. Check if route is defined in routes file.`);
      } else if (error.response?.status === 500) {
        console.log(`   💡 Server error. Check backend console for details.`);
      }
      console.log('');
    }
  }

  console.log('🎉 Testing completed!');
  console.log('\n📝 Summary:');
  console.log('- Check which endpoints work and which fail');
  console.log('- If endpoints return 404, check route definitions');
  console.log('- If endpoints return 500, check controller functions');
  console.log('- If no data returned, check database assignments');
};

// Run the test
testOfficerEndpoints().catch(error => {
  console.error('❌ Fatal error:', error.message);
});