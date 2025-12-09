// Copy and paste these into your browser console at varnica.operator.becomeomni.net

// Test 1: Check Enterprise Mode Configuration
console.log('🔍 Test 1: Checking Enterprise Mode...');
fetch('/api/enterprise/debug')
  .then(r => r.json())
  .then(d => {
    console.log('✅ Enterprise Debug Response:', d);
    console.log('   - Enterprise Mode:', d.enterprise_mode);
    console.log('   - Admin Emails Configured:', d.admin_emails_configured);
  })
  .catch(e => console.error('❌ Test 1 Failed:', e));

// Test 2: Check All Registered Routes
console.log('\n🔍 Test 2: Checking Registered Routes...');
fetch('/api/debug/routes')
  .then(r => r.json())
  .then(d => {
    console.log('✅ Routes Debug Response:');
    console.log('   - Enterprise Mode:', d.enterprise_mode);
    console.log('   - Total Routes:', d.total_routes);
    console.log('   - Billing Routes:', d.billing_routes.length);
    console.log('   - Admin Routes:', d.admin_routes.length);
    console.log('   - Enterprise Admin Routes:', d.enterprise_routes.length);
    
    // Check if our specific routes exist
    const hasUsageLogs = d.admin_routes.some(r => r.path.includes('usage-logs'));
    const hasCommitment = d.billing_routes.some(r => r.path.includes('subscription-commitment'));
    
    console.log('\n   🎯 Critical Routes Check:');
    console.log('   - Usage Logs Endpoint:', hasUsageLogs ? '✅ EXISTS' : '❌ MISSING');
    console.log('   - Subscription Commitment:', hasCommitment ? '✅ EXISTS' : '❌ MISSING');
  })
  .catch(e => console.error('❌ Test 2 Failed:', e));

// Test 3: Check Enterprise Billing Routes
console.log('\n🔍 Test 3: Checking Enterprise Billing Routes...');
fetch('/api/billing/debug-enterprise-routes')
  .then(r => r.json())
  .then(d => {
    console.log('✅ Enterprise Billing Response:', d);
    console.log('   - Status:', d.status);
    console.log('   - Message:', d.message);
    console.log('   - Routes Available:', d.routes_available);
  })
  .catch(e => console.error('❌ Test 3 Failed:', e));

// Test 4: Test the Exact Failing Endpoint (Usage Logs)
console.log('\n🔍 Test 4: Testing Usage Logs Endpoint...');
const userId = '99621235-d211-4fa9-87fa-dbc31b35639d'; // From your error
fetch(`/api/admin/users/${userId}/usage-logs?page=0&items_per_page=1000&days=30`)
  .then(r => {
    console.log('✅ Usage Logs Response Status:', r.status);
    if (r.status === 200) {
      return r.json();
    } else {
      return r.text().then(text => {
        throw new Error(`Status ${r.status}: ${text}`);
      });
    }
  })
  .then(d => {
    console.log('✅ Usage Logs Data:', d);
    console.log('   - Total Cost:', d.total_cost_period);
    console.log('   - Hierarchical:', d.is_hierarchical);
    console.log('   - Days:', d.days);
  })
  .catch(e => console.error('❌ Test 4 Failed:', e));

// Test 5: Test Subscription Commitment Endpoint
console.log('\n🔍 Test 5: Testing Subscription Commitment Endpoint...');
fetch('/api/billing/subscription-commitment/enterprise')
  .then(r => {
    console.log('✅ Subscription Commitment Status:', r.status);
    if (r.status === 200) {
      return r.json();
    } else {
      return r.text().then(text => {
        throw new Error(`Status ${r.status}: ${text}`);
      });
    }
  })
  .then(d => {
    console.log('✅ Subscription Commitment Data:', d);
    console.log('   - Has Commitment:', d.has_commitment);
    console.log('   - Can Cancel:', d.can_cancel);
    console.log('   - Type:', d.commitment_type);
  })
  .catch(e => console.error('❌ Test 5 Failed:', e));

console.log('\n📊 All tests launched! Check results above...');

