#!/usr/bin/env node
/**
 * Convenience wrapper for developing grok-terminal-mcp inside the PanOS-Analyzer project.
 *
 * Automatically sets the correct project root and uses the project's .grok-terminal.json.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The PanOS-Analyzer project root is two levels above this bin folder
const projectRoot = join(__dirname, '../../../');
const serverPath = join(__dirname, '../src/server.ts');

const args = [
  'tsx',
  serverPath,
  '--root',
  projectRoot
];

// Pass through any additional arguments
const extraArgs = process.argv.slice(2);
if (extraArgs.length > 0) {
  args.push(...extraArgs);
}

const child = spawn('npx', args, {
  stdio: 'inherit',
  cwd: projectRoot,
  env: process.env
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});