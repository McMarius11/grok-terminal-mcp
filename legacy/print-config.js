#!/usr/bin/env node
// Prints the ready-to-paste config block for the current machine

const path = require('path');

const serverPath = path.resolve(__dirname, 'server.js');

console.log(`
Add this block to your ~/.grok/config.toml:

[mcp_servers.grok-terminal]
command = "node"
args = ["${serverPath}"]

After adding, completely restart Grok.
`);
