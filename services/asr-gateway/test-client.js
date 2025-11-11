/**
 * Simple test client for ASR Gateway WebSocket streaming
 *
 * This demonstrates how to connect to the ASR Gateway and stream audio.
 * In a real application, you would send actual PCM audio data.
 */

const WebSocket = require('ws');

// Connect to ASR Gateway
const ws = new WebSocket('ws://localhost:3001/transcribe/stream');

ws.on('open', () => {
  console.log('✅ Connected to ASR Gateway');

  // Start transcription session
  ws.send(JSON.stringify({
    action: 'start',
    languageCode: 'en-US',
    sampleRate: 16000
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  switch (message.type) {
    case 'status':
      console.log(`\n📡 Session Status: ${message.status}`);
      if (message.provider) {
        console.log(`   Provider: ${message.provider}`);
        console.log(`   Session ID: ${message.sessionId}`);
      }

      // In a real application, you would now start sending audio chunks
      // For this test, we'll just stop after starting
      setTimeout(() => {
        console.log('\n⏹️  Stopping session...');
        ws.send(JSON.stringify({ action: 'stop' }));

        setTimeout(() => {
          console.log('\n👋 Test complete. Closing connection.\n');
          ws.close();
        }, 1000);
      }, 2000);
      break;

    case 'transcript':
      console.log(`\n📝 Transcription (${message.isFinal ? 'FINAL' : 'partial'}):`);
      console.log(`   "${message.transcript}"`);
      if (message.confidence) {
        console.log(`   Confidence: ${(message.confidence * 100).toFixed(1)}%`);
      }
      break;

    case 'error':
      console.error(`\n❌ Error: ${message.message}`);
      break;

    default:
      console.log(`\n📨 Unknown message type: ${message.type}`);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 Disconnected from ASR Gateway');
  process.exit(0);
});

// To send actual audio data, you would do something like:
//
// const audioChunk = Buffer.from(...); // PCM audio data (16-bit, 16kHz, mono)
// ws.send(audioChunk);
//
// Audio should be sent in chunks of 50-200ms for optimal latency
