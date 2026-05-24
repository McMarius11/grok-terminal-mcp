// executor.ts
// Clean abstraction for executing shell commands (one-shot and background).
// This keeps the server.ts slim and makes execution logic easier to test / improve.
import { exec } from "child_process";
import { promisify } from "util";
import { processManager } from "./processManager.js";
import { isCommandAllowed, resolveCommand } from "./config.js";
const execAsync = promisify(exec);
/**
 * Executes a command (after resolving shortcuts) with safety checks.
 */
export async function executeCommand(rawCommand, config, options = {}) {
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
    }
    catch (err) {
        const isAbort = err.name === 'AbortError' || err.code === 'ABORT_ERR' || err.code === 'ERR_ABORTED';
        return {
            stdout: err.stdout || "",
            stderr: err.stderr || err.message || "",
            exitCode: isAbort ? 130 : (err.code ?? 1), // 130 is conventional for SIGINT / cancelled
            durationMs: Date.now() - start,
            command: resolvedCommand,
            cancelled: isAbort,
        }; // extend interface temporarily
    }
}
/**
 * Starts a background process after resolving shortcuts and safety checks.
 */
export function startBackgroundProcess(rawCommand, config, options = {}) {
    const resolved = resolveCommand(rawCommand, config);
    const check = isCommandAllowed(resolved, config);
    if (!check.allowed) {
        throw new Error(check.reason);
    }
    return processManager.start(resolved, { cwd: options.cwd });
}
export function truncateOutput(text, maxBytes) {
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
/**
 * Normalizes an ExecuteResult for safe, informative MCP tool responses.
 * Applies smart truncation to both streams and produces the canonical shape
 * used by run_command and all helpers.
 */
export function normalizeForMcp(result, maxBytes) {
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
        cancelled: result.cancelled || false,
    };
}
//# sourceMappingURL=executor.js.map