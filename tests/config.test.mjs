// Basic tests for the config module
// Run with: node --test tests/config.test.mjs

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig, isCommandAllowed, resolveCommand } from '../src/config.ts';

describe('Config module', () => {
  it('should load config with defaults', () => {
    const config = loadConfig('/tmp/nonexistent-path-12345');
    assert.ok(Array.isArray(config.allowedCommands));
    assert.ok(Array.isArray(config.blockedPatterns));
    assert.ok(typeof config.projectShortcuts === 'object');
  });

  it('should correctly identify allowed commands', () => {
    const config = loadConfig('/tmp/nonexistent-path-12345');
    const result = isCommandAllowed('npm run build', config);
    assert.equal(result.allowed, true);
  });

  it('should block dangerous patterns', () => {
    const config = loadConfig('/tmp/nonexistent-path-12345');
    const result = isCommandAllowed('rm -rf /', config);
    assert.equal(result.allowed, false);
  });

  it('should resolve project shortcuts', () => {
    const config = loadConfig('/tmp/nonexistent-path-12345');
    const resolved = resolveCommand('build', config);
    assert.ok(resolved.includes('build.sh') || resolved.includes('bash'));
  });
});