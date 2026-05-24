// Simple in-memory process manager for long-running / background tasks
// Used by grok-terminal-mcp

'use strict';

const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

class ProcessManager {
  constructor() {
    this.processes = new Map(); // id -> { child, stdout, stderr, ... }
  }

  start(command, options = {}) {
    const {
      cwd = process.cwd(),
      shell = true,
      env = process.env,
      maxBuffer = 1024 * 1024 * 5 // 5 MB ring buffer per stream
    } = options;

    const id = randomUUID();
    const child = spawn(command, [], { cwd, shell, env, stdio: ['pipe', 'pipe', 'pipe'] });

    const proc = {
      id,
      command,
      cwd,
      startedAt: Date.now(),
      child,
      stdout: '',
      stderr: '',
      exitCode: null,
      running: true
    };

    // Ring buffer style (keep last N bytes)
    function append(buffer, data, max) {
      buffer += data.toString();
      if (buffer.length > max) {
        buffer = buffer.slice(-max);
      }
      return buffer;
    }

    child.stdout.on('data', (d) => {
      proc.stdout = append(proc.stdout, d, maxBuffer);
    });

    child.stderr.on('data', (d) => {
      proc.stderr = append(proc.stderr, d, maxBuffer);
    });

    child.on('close', (code) => {
      proc.running = false;
      proc.exitCode = code;
    });

    child.on('error', (err) => {
      proc.running = false;
      proc.stderr += `\n[Process error] ${err.message}`;
    });

    this.processes.set(id, proc);
    return id;
  }

  get(id) {
    return this.processes.get(id) || null;
  }

  list() {
    return Array.from(this.processes.values()).map(p => ({
      id: p.id,
      command: p.command,
      cwd: p.cwd,
      running: p.running,
      exitCode: p.exitCode,
      startedAt: p.startedAt,
      runtimeMs: Date.now() - p.startedAt
    }));
  }

  readOutput(id, { offset = 0, length = 50000 } = {}) {
    const p = this.processes.get(id);
    if (!p) return { error: 'Process not found' };

    const stdout = p.stdout.slice(offset, offset + length);
    const stderr = p.stderr.slice(offset, offset + length);

    return {
      id: p.id,
      running: p.running,
      exitCode: p.exitCode,
      stdout,
      stderr,
      stdoutLength: p.stdout.length,
      stderrLength: p.stderr.length
    };
  }

  kill(id, signal = 'SIGTERM') {
    const p = this.processes.get(id);
    if (!p || !p.running) {
      return { success: false, error: 'Process not running or not found' };
    }
    try {
      p.child.kill(signal);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  remove(id) {
    const p = this.processes.get(id);
    if (p && p.running) {
      try { p.child.kill('SIGKILL'); } catch (_) {}
    }
    this.processes.delete(id);
  }
}

module.exports = new ProcessManager();
