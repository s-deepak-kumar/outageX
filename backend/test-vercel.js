// Quick test script for Vercel integration
// Usage: node test-vercel.js

require('dotenv').config();
const axios = require('axios');

async function testVercelIntegration() {
  const token = process.env.VERCEL_TOKEN;
  
  if (!token) {
    console.error('❌ VERCEL_TOKEN not found in .env file');
    console.log('\n📝 Add this to backend/.env:');
    console.log('VERCEL_TOKEN=your_token_here');
    console.log('\n🔑 Get token from: https://vercel.com/account/tokens');
    return;
  }

  console.log('🔧 Testing Vercel integration...\n');

  try {
    // Test 1: List projects
    console.log('1️⃣ Fetching projects...');
    const projectsResponse = await axios.get(
      'https://api.vercel.com/v9/projects',
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    
    const projects = projectsResponse.data.projects;
    console.log(`✅ Found ${projects.length} projects`);
    
    if (projects.length > 0) {
      console.log('\n📦 Your projects:');
      projects.slice(0, 5).forEach(p => {
        console.log(`   - ${p.name} (${p.framework || 'unknown'})`);
      });

      // Test 2: Get deployments
      const firstProject = projects[0];
      console.log(`\n2️⃣ Fetching deployments for: ${firstProject.name}`);
      
      const deploymentsResponse = await axios.get(
        `https://api.vercel.com/v6/deployments?projectId=${firstProject.id}&limit=5`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      const deployments = deploymentsResponse.data.deployments;
      console.log(`✅ Found ${deployments.length} deployments`);
      
      if (deployments.length > 0) {
        console.log('\n🚀 Recent deployments:');
        deployments.forEach(d => {
          const status = d.readyState === 'READY' ? '✅' : 
                        d.readyState === 'ERROR' ? '❌' : '⏳';
          console.log(`   ${status} ${d.url} (${d.readyState})`);
        });

        // Test 3: Get deployment logs
        console.log(`\n3️⃣ Fetching logs for latest deployment...`);
        const latestDeployment = deployments[0];
        
        const logsResponse = await axios.get(
          `https://api.vercel.com/v2/deployments/${latestDeployment.uid}/events?limit=10`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        
        const logs = logsResponse.data;
        console.log(`✅ Found ${logs.length} log entries`);
        
        if (logs.length > 0) {
          console.log('\n📜 Recent logs:');
          logs.slice(0, 3).forEach(log => {
            const icon = log.type === 'stderr' ? '❌' : 'ℹ️';
            const text = log.payload?.text || 'No message';
            console.log(`   ${icon} ${text.substring(0, 80)}`);
          });
        }
      }
    }

    console.log('\n\n✅ Integration test passed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Add VERCEL_PROJECT_NAME to .env');
    console.log('   2. Start backend: npm run dev');
    console.log('   3. Test endpoints: curl http://localhost:3001/api/integrations/vercel/projects');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('   - Check token is valid');
    console.log('   - Token should start with "vercel_"');
    console.log('   - Get new token: https://vercel.com/account/tokens');
  }
}

testVercelIntegration();

