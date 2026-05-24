#!/usr/bin/env node
/**
 * Bin wrapper for grok-terminal-mcp.
 *
 * - After `npm run build`: uses the compiled dist/server.js
 * - During development (when running via tsx or npm link): falls back gracefully
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const distEntry = join(__dirname, '../dist/server.js');

  if (existsSync(distEntry)) {
    await import(distEntry);
  } else {
    // Fallback for development (user should run via `npm run dev` or tsx directly)
    console.error(
      '[grok-terminal-mcp] Built version not found. ' +
      'Please run "npm run build" first, or use "npm run dev" for development.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed to start grok-terminal-mcp:', err);
  process.exit(1);
});