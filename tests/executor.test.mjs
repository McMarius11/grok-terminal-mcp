// Basic tests for the executor module
import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs/promises';
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

  it('normalizeForMcp should correctly carry the cancelled flag', () => {
    const fakeResult = {
      stdout: 'partial output',
      stderr: '',
      exitCode: 130,
      durationMs: 500,
      command: 'long running command',
      cancelled: true
    };
    const normalized = normalizeForMcp(fakeResult, 10000);
    assert.equal(normalized.cancelled, true);
    assert.equal(normalized.exitCode, 130);
  });

  it('truncateOutput should handle empty and null input gracefully', () => {
    assert.deepEqual(truncateOutput('', 100), { text: '', truncated: false, originalLength: 0 });
    assert.deepEqual(truncateOutput(null, 100), { text: '', truncated: false, originalLength: 0 });
  });

  it('truncateOutput should produce head + tail with marker for very large output', () => {
    const huge = 'LINE\n'.repeat(5000);
    const result = truncateOutput(huge, 2000);
    assert.equal(result.truncated, true);
    assert.ok(result.text.includes('[... TRUNCATED'));
    // Should contain beginning and end
    assert.ok(result.text.startsWith('LINE'));
    assert.ok(result.text.endsWith('LINE\n'));
  });
});

// ============================================
// Tests for new Structured File Tools
// ============================================

import {
  applyEdits,
  readTextFile,
  writeFileContent,
  searchFiles,
} from '../src/fileTools.ts';

import os from 'os';
import path from 'path';

describe('Structured File Tools (basic)', () => {
  it('readTextFile should read full content', async () => {
    const filePath = path.join(os.tmpdir(), `read-test-${Date.now()}.txt`);
    await fs.writeFile(filePath, 'hello\nworld');
    const content = await readTextFile(filePath);
    assert.ok(content.includes('hello'));
    await fs.unlink(filePath);
  });

  it('applyEdits should apply simple replacement', async () => {
    const filePath = path.join(os.tmpdir(), `edit-test-${Date.now()}.txt`);
    await fs.writeFile(filePath, 'hello world');
    await applyEdits(filePath, [
      { oldText: 'hello world', newText: 'hello universe' }
    ]);
    const newContent = await fs.readFile(filePath, 'utf8');
    assert.equal(newContent.trim(), 'hello universe');
    await fs.unlink(filePath);
  });

  it('searchFiles should find pattern', async () => {
    const dir = path.join(os.tmpdir(), `search-test-${Date.now()}`);
    await fs.mkdir(dir);
    const file1 = path.join(dir, 'a.txt');
    await fs.writeFile(file1, 'foo bar');

    const results = await searchFiles(dir, 'foo');
    assert.ok(results.length >= 1);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

// ============================================
// Cancellation Tests
// ============================================

describe('Cancellation (basic)', () => {
  it('applyEdits should throw on aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const filePath = path.join(os.tmpdir(), `cancel-test-${Date.now()}.txt`);
    await fs.writeFile(filePath, 'test');

    await assert.rejects(
      async () => await applyEdits(filePath, [{ oldText: 'test', newText: 'changed' }], false, controller.signal),
      /cancelled/i
    );

    await fs.unlink(filePath);
  });
});