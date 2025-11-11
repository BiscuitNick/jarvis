/**
 * test-orchestration.js
 *
 * Basic integration test for the orchestration layer
 * Tests pipeline creation, state transitions, and cleanup
 */

const WebSocket = require('ws');
const axios = require('axios');

const INGRESS_URL = process.env.INGRESS_URL || 'http://localhost:3000';
const WS_URL = INGRESS_URL.replace('http', 'ws') + '/stream';

// Test configuration
const config = {
  sessionId: `test-session-${Date.now()}`,
  userId: 'test-user',
  token: 'test-token', // In production, use real JWT
};

async function testRESTAPI() {
  console.log('\n=== Testing REST API ===\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await axios.get(`${INGRESS_URL}/api/orchestration/health`);
    console.log('✓ Health check:', health.data.status);
    console.log('  Services:', health.data.services);

    // Test starting a pipeline
    console.log('\n2. Testing pipeline start...');
    const startResponse = await axios.post(`${INGRESS_URL}/api/orchestration/start`, {
      sessionId: config.sessionId,
      userId: config.userId,
    });
    const pipelineId = startResponse.data.pipelineId;
    console.log('✓ Pipeline started:', pipelineId);
    console.log('  Status:', startResponse.data.status);
    console.log('  Stage:', startResponse.data.stage);

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test getting pipeline status
    console.log('\n3. Testing pipeline status...');
    const statusResponse = await axios.get(`${INGRESS_URL}/api/orchestration/pipeline/${pipelineId}`);
    console.log('✓ Pipeline status retrieved');
    console.log('  Stage:', statusResponse.data.stage);
    console.log('  Metrics:', statusResponse.data.metrics);

    // Test getting all active pipelines
    console.log('\n4. Testing active pipelines list...');
    const pipelinesResponse = await axios.get(`${INGRESS_URL}/api/orchestration/pipelines`);
    console.log('✓ Active pipelines:', pipelinesResponse.data.count);

    // Test interruption
    console.log('\n5. Testing pipeline interruption...');
    const interruptResponse = await axios.post(`${INGRESS_URL}/api/orchestration/interrupt/${pipelineId}`);
    console.log('✓ Pipeline interrupted');
    console.log('  Status:', interruptResponse.data.status);

    // Test ending pipeline
    console.log('\n6. Testing pipeline end...');
    const endResponse = await axios.post(`${INGRESS_URL}/api/orchestration/end/${pipelineId}`);
    console.log('✓ Pipeline ended');

    // Test latency stats
    console.log('\n7. Testing latency statistics...');
    const latencyResponse = await axios.get(`${INGRESS_URL}/api/orchestration/latency/stats`);
    console.log('✓ Latency stats retrieved');
    console.log('  Thresholds:', latencyResponse.data.thresholds);
    console.log('  Total violations:', latencyResponse.data.totalViolations);

    console.log('\n✅ All REST API tests passed!\n');
    return true;
  } catch (error) {
    console.error('\n❌ REST API test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    return false;
  }
}

async function testWebSocket() {
  console.log('\n=== Testing WebSocket API ===\n');

  return new Promise((resolve) => {
    try {
      // Connect to WebSocket
      console.log('1. Connecting to WebSocket...');
      const ws = new WebSocket(`${WS_URL}?token=${config.token}&sessionId=${config.sessionId}`);

      let connected = false;
      let pipelineStarted = false;

      ws.on('open', () => {
        console.log('✓ WebSocket connected');
        connected = true;
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`  Received: ${message.type}`);

          if (message.type === 'connected') {
            console.log('✓ Welcome message received');
            console.log('  Session ID:', message.sessionId);

            // Start pipeline
            console.log('\n2. Starting pipeline...');
            ws.send(JSON.stringify({ type: 'start' }));
          } else if (message.type === 'pipeline-started') {
            console.log('✓ Pipeline started');
            console.log('  Pipeline ID:', message.pipelineId);
            pipelineStarted = true;

            // Send a ping
            console.log('\n3. Testing ping/pong...');
            ws.send(JSON.stringify({ type: 'ping' }));
          } else if (message.type === 'pong') {
            console.log('✓ Pong received');

            // Test interruption
            console.log('\n4. Testing interruption...');
            ws.send(JSON.stringify({ type: 'interrupt' }));
          } else if (message.type === 'interrupted') {
            console.log('✓ Interruption confirmed');

            // Stop pipeline
            console.log('\n5. Stopping pipeline...');
            ws.send(JSON.stringify({ type: 'stop' }));
          } else if (message.type === 'pipeline-stopped') {
            console.log('✓ Pipeline stopped');

            // Close connection
            console.log('\n6. Closing connection...');
            ws.close();
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('✓ WebSocket closed');
        if (connected && pipelineStarted) {
          console.log('\n✅ All WebSocket tests passed!\n');
          resolve(true);
        } else {
          console.log('\n⚠️  WebSocket tests incomplete\n');
          resolve(false);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        resolve(false);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('\n⏱️  Test timeout, closing connection...');
          ws.close();
        }
      }, 30000);
    } catch (error) {
      console.error('❌ WebSocket test failed:', error.message);
      resolve(false);
    }
  });
}

async function runTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Orchestration Integration Tests      ║');
  console.log('╚════════════════════════════════════════╝');

  const restResult = await testRESTAPI();
  const wsResult = await testWebSocket();

  console.log('\n═══════════════════════════════════════');
  console.log('Test Results:');
  console.log('  REST API:', restResult ? '✅ PASS' : '❌ FAIL');
  console.log('  WebSocket:', wsResult ? '✅ PASS' : '❌ FAIL');
  console.log('═══════════════════════════════════════\n');

  process.exit(restResult && wsResult ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
