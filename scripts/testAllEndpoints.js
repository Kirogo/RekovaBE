// scripts/testAllEndpoints.js
const axios = require('axios');

async function testAllEndpoints() {
  console.log('🧪 Testing All Officer Endpoints\n');
  
  // Login first
  let token = null;
  try {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      username: 'michael.mwai',
      password: 'password123'
    });
    
    if (loginRes.data.success) {
      token = loginRes.data.data.token;
      console.log(`✅ Logged in as: ${loginRes.data.data.user.username}`);
    }
  } catch (error) {
    console.log('❌ Login failed:', error.message);
    return;
  }

  const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: { Authorization: `Bearer ${token}` }
  });

  const endpoints = [
    { name: 'GET /customers/assigned-to-me', url: '/customers/assigned-to-me' },
    { name: 'GET /payments/my-collections', url: '/payments/my-collections' },
    { name: 'GET /payments/my-transactions', url: '/payments/my-transactions' },
    { name: 'GET /promises/my-promises', url: '/promises/my-promises' },
    { name: 'GET /promises', url: '/promises' }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\n➡️  Testing: ${endpoint.name}`);
      const res = await api.get(endpoint.url);
      console.log(`   ✅ Status: ${res.status}`);
      
      if (endpoint.url.includes('assigned-to-me')) {
        console.log(`   📊 Customers: ${res.data.count || res.data.data?.customers?.length || 0}`);
      } else if (endpoint.url.includes('my-collections')) {
        console.log(`   💰 Collections: ${res.data.data?.summary?.allTime || 0}`);
      } else if (endpoint.url.includes('my-transactions')) {
        console.log(`   💳 Transactions: ${res.data.count || res.data.data?.transactions?.length || 0}`);
      } else if (endpoint.url.includes('my-promises')) {
        console.log(`   🤝 Promises: ${res.data.count || res.data.data?.promises?.length || 0}`);
      } else if (endpoint.url === '/promises') {
        console.log(`   📋 All Promises: ${res.data.data?.statistics?.total || 0}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.status || error.code}`);
      console.log(`   Message: ${error.response?.data?.message || error.message}`);
    }
  }
}

testAllEndpoints();