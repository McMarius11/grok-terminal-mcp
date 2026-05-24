#!/usr/bin/env node
// Copyright (c) 2026 Marius Kamm. All rights reserved.
// See LICENSE file for terms.
// ==============================================================================
// grok-terminal-mcp — Grok-optimized Terminal/Shell MCP Server
//
// Stable stdio-based MCP server focused on:
// - Reliable handshake with Grok
// - Secure command execution (directory jail + allow-list)
// - Strong support for long-running processes and streaming
// - Minimal dependencies, easy to debug
//
// Start with: node tools/grok-terminal-mcp/server.js
// Or configure in ~/.grok/config.toml
// ==============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const processManager = require('./process-manager');
const { loadConfig, isCommandAllowed, resolveCommand } = require('./config');

const ROOT = process.cwd();
const config = loadConfig(ROOT);

// ---------------------------------------------------------------------------
// Minimal MCP stdio transport + protocol handling
// ---------------------------------------------------------------------------

let requestId = 0;
const pending = new Map();

function send(obj) {
  const json = JSON.stringify(obj);
  process.stdout.write(json + '\n');
}

function sendResponse(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data = null) {
  send({
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  });
}

function log(...args) {
  console.error('[grok-terminal-mcp]', ...args);
}

// ---------------------------------------------------------------------------
// Tool Registry
// ---------------------------------------------------------------------------

const tools = new Map();

function registerTool(def, handler) {
  tools.set(def.name, { def, handler });
}

// ---------------------------------------------------------------------------
// Security (basic for v1)
// ---------------------------------------------------------------------------

function isPathAllowed(targetPath) {
  const resolved = path.resolve(targetPath);
  // For now: everything under current working directory (project root)
  // This will be made configurable in Phase 2
  return resolved.startsWith(ROOT);
}

// isCommandAllowed is now provided by ./config.js (more sophisticated)

// ---------------------------------------------------------------------------
// Tool: run_command (Phase 1 core)
// ---------------------------------------------------------------------------

registerTool({
  name: 'run_command',
  description: 'Execute a shell command. Returns stdout, stderr, exit code and duration. Use for builds, tests, git, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' },
      cwd: { type: 'string', description: 'Working directory (defaults to project root)' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default 120000)' }
    },
    required: ['command']
  }
}, async (args) => {
  let { command, cwd = ROOT, timeout = 120000 } = args;

  // Resolve project shortcuts (e.g. "build" → "bash build.sh")
  const originalCommand = command;
  command = resolveCommand(command, config);

  if (originalCommand !== command) {
    log(`Shortcut resolved: "${originalCommand}" → "${command}"`);
  }

  if (!isPathAllowed(cwd)) {
    throw new Error(`Access denied: ${cwd} is outside the allowed directory`);
  }
  const check = isCommandAllowed(command, config);
  if (!check.allowed) {
    throw new Error(check.reason || 'Command blocked for security reasons');
  }

  log(`Executing: ${command} (cwd: ${cwd})`);

  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, [], {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        stdout: stdout.slice(0, 50000),
        stderr: stderr.slice(0, 50000) + '\n[Process killed after timeout]',
        exitCode: null,
        durationMs: Date.now() - start,
        timedOut: true
      });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.slice(0, 100000),
        stderr: stderr.slice(0, 100000),
        exitCode: code,
        durationMs: Date.now() - start,
        timedOut: false
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout: '',
        stderr: `Failed to start process: ${err.message}`,
        exitCode: 1,
        durationMs: Date.now() - start,
        timedOut: false
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Tools: Background / Long-running process management (Phase 2)
// ---------------------------------------------------------------------------

registerTool({
  name: 'start_process',
  description: 'Start a long-running or background process. Returns a session ID you can use with read_process_output and kill_process.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      cwd: { type: 'string' }
    },
    required: ['command']
  }
}, (args) => {
  let { command, cwd = ROOT } = args;
  const originalCommand = command;
  command = resolveCommand(command, config);

  if (originalCommand !== command) {
    log(`Shortcut resolved: "${originalCommand}" → "${command}"`);
  }

  if (!isPathAllowed(cwd)) throw new Error('Access denied to directory');
  const check = isCommandAllowed(command, config);
  if (!check.allowed) throw new Error(check.reason || 'Command blocked');

  log(`Starting background process: ${command}`);

  const id = processManager.start(command, { cwd });
  return { sessionId: id, command, message: 'Process started in background' };
});

registerTool({
  name: 'list_processes',
  description: 'List all currently managed background processes.',
  inputSchema: { type: 'object', properties: {} }
}, () => {
  return { processes: processManager.list() };
});

registerTool({
  name: 'read_process_output',
  description: 'Read (partial) output from a background process. Supports offset for pagination.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      offset: { type: 'number', default: 0 },
      length: { type: 'number', default: 50000 }
    },
    required: ['sessionId']
  }
}, (args) => {
  return processManager.readOutput(args.sessionId, {
    offset: args.offset || 0,
    length: args.length || 50000
  });
});

registerTool({
  name: 'kill_process',
  description: 'Terminate a background process.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      signal: { type: 'string', default: 'SIGTERM' }
    },
    required: ['sessionId']
  }
}, (args) => {
  return processManager.kill(args.sessionId, args.signal || 'SIGTERM');
});

// ---------------------------------------------------------------------------
// Tool: get_config - Inspect current security & shortcut configuration
// ---------------------------------------------------------------------------

registerTool({
  name: 'get_config',
  description: 'Show the currently loaded configuration (allowed commands, shortcuts, limits, etc.). Useful for debugging permissions.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}, () => {
  // Return a safe, readable view (hide nothing important for the owner)
  return {
    loadedFrom: config._loadedFrom || 'defaults only',
    allowedCommands: config.allowedCommands,
    blockedPatterns: config.blockedPatterns,
    projectShortcuts: config.projectShortcuts,
    maxOutputBytes: config.maxOutputBytes,
    maxBackgroundOutputBytes: config.maxBackgroundOutputBytes,
    defaultTimeoutMs: config.defaultTimeoutMs
  };
});

// ---------------------------------------------------------------------------
// Tool: reload_config - Reload configuration without restarting the server
// ---------------------------------------------------------------------------

registerTool({
  name: 'reload_config',
  description: 'Reload the .grok-terminal.json configuration file at runtime. Useful after editing the config.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}, () => {
  try {
    // Re-require to get fresh module (simple approach)
    delete require.cache[require.resolve('./config')];
    const freshConfig = require('./config');
    const newConfig = freshConfig.loadConfig(ROOT);

    // Replace the current config object
    Object.keys(config).forEach(key => delete config[key]);
    Object.assign(config, newConfig);

    log('Configuration reloaded successfully');
    return {
      success: true,
      loadedFrom: config._loadedFrom || 'defaults',
      message: 'Config reloaded. New settings are now active.'
    };
  } catch (err) {
    log('Config reload failed:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
});

// ---------------------------------------------------------------------------
// MCP Protocol Handlers
// ---------------------------------------------------------------------------

function handleInitialize(params) {
  log('Received initialize request');
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: { listChanged: false }
    },
    serverInfo: {
      name: 'grok-terminal-mcp',
      version: '0.1.0'
    }
  };
}

function handleToolsList() {
  const toolList = Array.from(tools.values()).map(t => ({
    name: t.def.name,
    description: t.def.description,
    inputSchema: t.def.inputSchema
  }));
  return { tools: toolList };
}

async function handleToolsCall(name, args) {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  try {
    const result = await tool.handler(args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true
    };
  }
}

// ---------------------------------------------------------------------------
// Main Message Loop
// ---------------------------------------------------------------------------

function handleMessage(msg) {
  if (!msg || !msg.method) {
    if (msg && msg.id !== undefined) {
      sendError(msg.id, -32600, 'Invalid Request');
    }
    return;
  }

  const { id, method, params } = msg;

  if (method === 'initialize') {
    const result = handleInitialize(params);
    sendResponse(id, result);
    return;
  }

  if (method === 'initialized') {
    // Notification – nothing to reply
    log('Client initialized successfully');
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, handleToolsList());
    return;
  }

  if (method === 'tools/call') {
    handleToolsCall(params.name, params.arguments)
      .then(res => sendResponse(id, res))
      .catch(err => sendError(id, -32000, err.message));
    return;
  }

  if (method === 'shutdown') {
    sendResponse(id, {});
    process.exit(0);
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Stdio Reader
// ---------------------------------------------------------------------------

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) {
      try {
        const msg = JSON.parse(line);
        handleMessage(msg);
      } catch (e) {
        log('Failed to parse message:', e.message, 'line:', line.slice(0, 200));
      }
    }
  }
});

process.stdin.on('end', () => {
  log('stdin closed, exiting');
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

log('grok-terminal-mcp starting...');
log('Working directory:', ROOT);
log('Ready for MCP connections via stdio');

// Send a startup log (helpful for debugging in Grok)
console.error('=== grok-terminal-mcp v0.2.0 ready ===');
console.error('Allowed base dir:', ROOT);
console.error('Config loaded with', config.allowedCommands.length, 'base allowed commands');
console.error('');
console.error('To connect this server to Grok, add the following to ~/.grok/config.toml:');
console.error('');
console.error('[mcp_servers.grok-terminal]');
console.error(`command = "node"`);
console.error(`args = ["${path.resolve(__dirname, 'server.js')}"]`);
console.error('');
console.error('Then completely restart Grok.');
console.error('For detailed instructions see tools/grok-terminal-mcp/QUICKSTART.md');
console.error('Create .grok-terminal.json in the project root for custom allow-lists.');
