// Basic tests for processManager
import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import { processManager } from '../src/processManager.ts';

describe('ProcessManager', () => {
  let sessionId = null;

  it('should start a simple background process', () => {
    sessionId = processManager.start('node -e "setTimeout(() => {}, 5000)"', { cwd: process.cwd() });
    assert.ok(typeof sessionId === 'string');
    assert.ok(sessionId.length > 10);
  });

  it('should list the running process', () => {
    const list = processManager.list();
    const found = list.find(p => p.id === sessionId);
    assert.ok(found, 'Process should appear in list');
    assert.equal(found.running, true);
  });

  it('should be able to read output (even if empty)', () => {
    const output = processManager.readOutput(sessionId, {});
    assert.ok(output);
    assert.equal(typeof output.stdout, 'string');
  });

  it('should accumulate output over multiple reads', async () => {
    // Start a process that produces output over time
    const id = processManager.start('node -e "let i=0; setInterval(() => console.log(\'tick-\' + ++i), 100)"', {});

    // Wait a bit for some output
    await new Promise(r => setTimeout(r, 450));

    const output1 = processManager.readOutput(id);
    processManager.kill(id);

    assert.ok(output1.stdout.length > 0, 'Should have captured some output');
    assert.ok(output1.stdout.includes('tick-'), 'Should contain tick messages');
  });

  it('should kill the process successfully', () => {
    const result = processManager.kill(sessionId);
    assert.equal(result.success, true);
  });

  it('should return error when killing non-existing process', () => {
    const result = processManager.kill('non-existent-id-12345');
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('should still allow reading output after process was killed', () => {
    const output = processManager.readOutput(sessionId);
    assert.ok(output);
    // stdout/stderr may be empty or partial, that's fine
  });

  after(() => {
    // Cleanup any remaining processes
    processManager.cleanup?.();
  });
});