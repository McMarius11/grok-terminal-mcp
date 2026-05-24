// executor.ts
// Clean abstraction for executing shell commands (one-shot and background).
// This keeps the server.ts slim and makes execution logic easier to test / improve.

import { exec } from "child_process";
import { promisify } from "util";
import { processManager } from "./processManager.js";
import { isCommandAllowed, resolveCommand } from "./config.js";
import type { TerminalConfig } from "./config.js";

const execAsync = promisify(exec);

export interface ExecuteOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
  signal?: AbortSignal;   // Item 1: supports cancellation from MCP handler / client
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  command: string;
}

/**
 * Executes a command (after resolving shortcuts) with safety checks.
 */
export async function executeCommand(
  rawCommand: string,
  config: TerminalConfig,
  options: ExecuteOptions = {}
): Promise<ExecuteResult> {
  const resolvedCommand = resolveCommand(rawCommand, config);
  const check = isCommandAllowed(resolvedCommand, config);

  if (!check.allowed) {
    throw new Error(check.reason);
  }

  const cwd = options.cwd || process.cwd();
  const timeout = options.timeout ?? config.defaultTimeoutMs;
  const maxBuffer = options.maxBuffer ?? 4 * 1024 * 1024;

  const start = Date.now();

  try {
    const result = await execAsync(resolvedCommand, {
      cwd,
      timeout,
      maxBuffer,
      signal: options.signal,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
      durationMs: Date.now() - start,
      command: resolvedCommand,
    };
  } catch (err: any) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || err.message || "",
      exitCode: err.code ?? 1,
      durationMs: Date.now() - start,
      command: resolvedCommand,
    };
  }
}

/**
 * Starts a background process after resolving shortcuts and safety checks.
 */
export function startBackgroundProcess(
  rawCommand: string,
  config: TerminalConfig,
  options: { cwd?: string } = {}
): string {
  const resolved = resolveCommand(rawCommand, config);
  const check = isCommandAllowed(resolved, config);

  if (!check.allowed) {
    throw new Error(check.reason);
  }

  return processManager.start(resolved, { cwd: options.cwd });
}

// ============================================
// Output normalization for MCP responses (Item 2)
// Smart truncation: head + tail with newline snapping, UTF-8 friendly in practice,
// always reports totals and a clear truncation marker + tip-ready flag.
// ============================================

export interface TruncatedOutput {
  text: string;
  truncated: boolean;
  originalLength: number;
}

export function truncateOutput(text: string, maxBytes: number): TruncatedOutput {
  if (!text) {
    return { text: "", truncated: false, originalLength: 0 };
  }
  const len = text.length;
  if (len <= maxBytes) {
    return { text, truncated: false, originalLength: len };
  }

  // Allocate ~40% head / 40% tail of the budget for content (rest for marker)
  const headBudget = Math.max(2048, Math.floor(maxBytes * 0.38));
  const tailBudget = Math.max(2048, Math.floor(maxBytes * 0.38));

  let head = text.slice(0, headBudget);
  // Snap head to a reasonable newline (prefer last \n in the second half of head)
  const lastNl = head.lastIndexOf('\n');
  if (lastNl > Math.floor(headBudget * 0.55)) {
    head = head.slice(0, lastNl + 1);
  }

  let tail = text.slice(-tailBudget);
  // Snap tail start to first \n for clean continuation
  const firstNl = tail.indexOf('\n');
  if (firstNl > 0 && firstNl < Math.floor(tailBudget * 0.45)) {
    tail = tail.slice(firstNl + 1);
  }

  const marker = `\n\n[... TRUNCATED — original ${len} chars (~${Math.round(len / 1024)} KB). Use start_process + read_process_output with offset for full capture ...]\n\n`;
  const combined = head + marker + tail;

  return {
    text: combined,
    truncated: true,
    originalLength: len,
  };
}

export interface NormalizedMcpResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  truncated: boolean;
  totalBytes: { stdout: number; stderr: number };
  cancelled?: boolean;
}

/**
 * Normalizes an ExecuteResult for safe, informative MCP tool responses.
 * Applies smart truncation to both streams and produces the canonical shape
 * used by run_command and all helpers.
 */
export function normalizeForMcp(
  result: ExecuteResult,
  maxBytes: number
): NormalizedMcpResult {
  const out = truncateOutput(result.stdout, maxBytes);
  const err = truncateOutput(result.stderr, maxBytes);

  return {
    command: result.command,
    stdout: out.text,
    stderr: err.text,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    truncated: out.truncated || err.truncated,
    totalBytes: {
      stdout: out.originalLength,
      stderr: err.originalLength,
    },
  };
}