import type { TerminalConfig } from "./config.js";
export interface ExecuteOptions {
    cwd?: string;
    timeout?: number;
    maxBuffer?: number;
    signal?: AbortSignal;
}
export interface ExecuteResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    command: string;
    cancelled?: boolean;
}
/**
 * Executes a command (after resolving shortcuts) with safety checks.
 */
export declare function executeCommand(rawCommand: string, config: TerminalConfig, options?: ExecuteOptions): Promise<ExecuteResult>;
/**
 * Starts a background process after resolving shortcuts and safety checks.
 */
export declare function startBackgroundProcess(rawCommand: string, config: TerminalConfig, options?: {
    cwd?: string;
}): string;
export interface TruncatedOutput {
    text: string;
    truncated: boolean;
    originalLength: number;
}
export declare function truncateOutput(text: string, maxBytes: number): TruncatedOutput;
export interface NormalizedMcpResult {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    truncated: boolean;
    totalBytes: {
        stdout: number;
        stderr: number;
    };
    cancelled?: boolean;
}
/**
 * Normalizes an ExecuteResult for safe, informative MCP tool responses.
 * Applies smart truncation to both streams and produces the canonical shape
 * used by run_command and all helpers.
 */
export declare function normalizeForMcp(result: ExecuteResult, maxBytes: number): NormalizedMcpResult;
