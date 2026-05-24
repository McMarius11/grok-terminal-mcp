#!/usr/bin/env node
// Quick manual test for the MCP handshake
// Run: node tools/grok-terminal-mcp/test-handshake.js

const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');

console.log('Starting grok-terminal-mcp for handshake test...\n');

const child = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';

child.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        console.log('← Received:', JSON.stringify(msg, null, 2));
      } catch (e) {
        console.log('← Raw:', line);
      }
    }
  }
});

child.stderr.on('data', (data) => {
  console.error('LOG:', data.toString().trim());
});

function send(msg) {
  const json = JSON.stringify(msg);
  console.log('→ Sending:', json);
  child.stdin.write(json + '\n');
}

// Simulate a real Grok-style initialization sequence
setTimeout(() => {
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'grok-test', version: '1.0' }
    }
  });
}, 300);

setTimeout(() => {
  send({ jsonrpc: '2.0', method: 'initialized' });
}, 600);

setTimeout(() => {
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });
}, 900);

// Let it run for a bit then exit
setTimeout(() => {
  console.log('\nTest finished. Killing server...');
  child.kill();
  process.exit(0);
}, 4000);
