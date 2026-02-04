// test-supervisor.js
const axios = require('axios');

async function testSupervisor() {
  try {
    // 1. Login as supervisor
    console.log('1. Logging in as supervisor...');
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      username: 'chris.paul',
      password: 'password'
    });
    
    const token = loginRes.data.data.token;
    console.log('✅ Login successful. Token:', token.substring(0, 20) + '...');
    
    // 2. Test supervisor dashboard
    console.log('\n2. Testing supervisor dashboard...');
    try {
      const dashboardRes = await axios.get('http://localhost:5000/api/supervisor/dashboard', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('✅ Supervisor dashboard SUCCESS!');
      console.log('   Officer count:', dashboardRes.data.data.officers?.length);
      console.log('   Total customers:', dashboardRes.data.data.stats.totalCustomers);
    } catch (dashboardError) {
      console.log('❌ Supervisor dashboard FAILED:', dashboardError.response?.data?.message || dashboardError.message);
    }
    
    // 3. Test getting officers
    console.log('\n3. Testing get officers...');
    try {
      const officersRes = await axios.get('http://localhost:5000/api/supervisor/officers', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('✅ Get officers SUCCESS!');
      console.log('   Officers found:', officersRes.data.data.length);
    } catch (officersError) {
      console.log('❌ Get officers FAILED:', officersError.response?.data?.message || officersError.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSupervisor();