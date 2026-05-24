// Process Manager for grok-terminal-mcp
// Supports long-running / background processes with output buffering and pagination.

import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";

interface ManagedProcess {
  id: string;
  command: string;
  cwd: string;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  running: boolean;
  exitCode: number | null;
  startedAt: number;
}

class ProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private readonly MAX_BUFFER = 5 * 1024 * 1024; // 5 MB

  start(command: string, options: { cwd?: string } = {}): string {
    const cwd = options.cwd || process.cwd();
    const id = randomUUID();

    const child = spawn(command, [], {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    const proc: ManagedProcess = {
      id,
      command,
      cwd,
      child,
      stdout: "",
      stderr: "",
      running: true,
      exitCode: null,
      startedAt: Date.now(),
    };

    child.stdout?.on("data", (data: Buffer) => {
      proc.stdout += data.toString();
      if (proc.stdout.length > this.MAX_BUFFER) {
        proc.stdout = proc.stdout.slice(-this.MAX_BUFFER);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      proc.stderr += data.toString();
      if (proc.stderr.length > this.MAX_BUFFER) {
        proc.stderr = proc.stderr.slice(-this.MAX_BUFFER);
      }
    });

    child.on("close", (code) => {
      proc.running = false;
      proc.exitCode = code;
    });

    child.on("error", (err) => {
      proc.running = false;
      proc.stderr += `\n[Process Error] ${err.message}`;
    });

    this.processes.set(id, proc);
    return id;
  }

  list() {
    return Array.from(this.processes.values()).map((p) => ({
      id: p.id,
      command: p.command,
      cwd: p.cwd,
      running: p.running,
      exitCode: p.exitCode,
      startedAt: p.startedAt,
      runtimeMs: Date.now() - p.startedAt,
    }));
  }

  readOutput(
    id: string,
    options: { offset?: number; length?: number } = {}
  ) {
    const { offset = 0, length = 50000 } = options;
    const p = this.processes.get(id);
    if (!p) {
      return { error: "Process not found" };
    }

    return {
      id: p.id,
      running: p.running,
      exitCode: p.exitCode,
      stdout: p.stdout.slice(offset, offset + length),
      stderr: p.stderr.slice(offset, offset + length),
      stdoutLength: p.stdout.length,
      stderrLength: p.stderr.length,
    };
  }

  kill(id: string, signal: string = "SIGTERM") {
    const p = this.processes.get(id);
    if (!p || !p.running) {
      return { success: false, error: "Process not running or not found" };
    }

    try {
      p.child.kill(signal as any);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Optional: Cleanup finished processes (can be called periodically)
  cleanup() {
    for (const [id, p] of this.processes) {
      if (!p.running) {
        this.processes.delete(id);
      }
    }
  }
}

export const processManager = new ProcessManager();