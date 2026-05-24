// Basic tests for the executor module
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeCommand } from '../src/executor.ts';
import { loadConfig } from '../src/config.ts';

const config = loadConfig('/tmp/nonexistent-path-for-tests');

describe('Executor', () => {
  it('should execute a simple allowed command', async () => {
    const result = await executeCommand('echo hello', config, { timeout: 5000 });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes('hello'));
  });

  it('should block dangerous commands', async () => {
    await assert.rejects(
      async () => await executeCommand('rm -rf /', config),
      /Blocked pattern/
    );
  });

  it('should block dangerous commands even with arguments', async () => {
    await assert.rejects(
      async () => await executeCommand('rm -rf / --no-preserve-root', config),
      /Blocked pattern/
    );
  });

  it('should block dangerous commands case-insensitively', async () => {
    await assert.rejects(
      async () => await executeCommand('RM -rf /etc', config),
      /Blocked pattern/
    );
  });

  it('should resolve shortcuts', async () => {
    const result = await executeCommand('build', config, { timeout: 1000 });
    assert.ok(result.command.includes('build'));
  });

  it('should not allow shortcuts to bypass blocked patterns', async () => {
    // Even if someone defines a malicious shortcut, the underlying command must still be checked
    // (This test assumes no malicious shortcuts are in the default test config)
    const maliciousConfig = {
      ...config,
      projectShortcuts: {
        ...config.projectShortcuts,
        "evil": "rm -rf /"
      }
    };

    await assert.rejects(
      async () => await executeCommand('evil', maliciousConfig),
      /Blocked pattern/
    );
  });

  it('should respect custom timeout', async () => {
    const start = Date.now();
    // Use a node command that runs for a while instead of 'sleep' (which may be blocked)
    const result = await executeCommand('node -e "setTimeout(() => {}, 2000)"', config, { timeout: 500 });
    const duration = Date.now() - start;
    assert.ok(duration < 1500, 'Should have timed out before 1.5s');
    assert.ok(result.exitCode !== 0 || result.stderr.includes('timeout') || result.stderr.includes('signal'));
  });

  it('should return proper error info for blocked commands', async () => {
    try {
      await executeCommand('rm -rf /etc/passwd', config);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('Blocked'));
    }
  });
});

// Tests for output normalization (new in 0.4.x)
import { truncateOutput, normalizeForMcp } from '../src/executor.ts';

describe('Output Normalization', () => {
  it('should not truncate small outputs', () => {
    const result = truncateOutput('hello world', 100);
    assert.equal(result.truncated, false);
    assert.equal(result.text, 'hello world');
  });

  it('should truncate large outputs and mark them', () => {
    const longText = 'x'.repeat(10000);
    const result = truncateOutput(longText, 1000);
    assert.equal(result.truncated, true);
    assert.ok(result.text.includes('TRUNCATED'));
    assert.ok(result.text.length < longText.length);
  });

  it('normalizeForMcp should include truncated and totalBytes fields', () => {
    const fakeResult = {
      stdout: 'a'.repeat(5000),
      stderr: '',
      exitCode: 0,
      durationMs: 10,
      command: 'echo test'
    };
    const normalized = normalizeForMcp(fakeResult, 2000);
    assert.equal(normalized.truncated, true);
    assert.ok(normalized.totalBytes.stdout > 2000);
  });
});