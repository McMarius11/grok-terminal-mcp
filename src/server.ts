#!/usr/bin/env node
/**
 * grok-terminal-mcp — A proper MCP server built with the official SDK (v0.3+)
 * Clean, best-practice implementation.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig, resolveCommand, isCommandAllowed } from "./config.js";
import { executeCommand, startBackgroundProcess, normalizeForMcp, type NormalizedMcpResult } from "./executor.js";
import { processManager } from "./processManager.js";
import { logger } from "./logger.js";
import { parseCliArgs } from "./cli.js";

import fs from "fs";
import path from "path";

// ============================================
// CLI Parsing (must happen very early)
// ============================================

const cliOptions = parseCliArgs();

// If the user just wants help or version, exit cleanly without starting the server
if (cliOptions.help || cliOptions.version) {
  // cac already printed the help/version output
  process.exit(0);
}

// Enable debug logging early if requested
if (cliOptions.debug) {
  process.env.GROK_TERMINAL_LOG_LEVEL = 'debug';
}

// Determine root directory (CLI flag > process.cwd)
const ROOT = cliOptions.root ? cliOptions.root : process.cwd();

// ============================================
// Setup
// ============================================

let currentConfig = loadConfig(ROOT, cliOptions.config);

// Helper for consistent error responses to the LLM (Item 2 — now returns structured shape)
function toolError(
  message: string,
  category: 'blocked' | 'timeout' | 'execution' | 'cancelled' | 'general' = 'general',
  extra: { command?: string; partialStdout?: string; partialStderr?: string; durationMs?: number } = {}
) {
  const baseTip = "\n\nTip: Use 'get_config' to see currently allowed commands and shortcuts.";
  let tip = baseTip;

  if (category === 'blocked') {
    tip = "\n\nThis command was blocked by the security policy. Use 'get_config' to inspect allowed commands.";
  } else if (category === 'timeout') {
    tip = "\n\nThe command timed out. Partial output included above if any. For long-running work use start_process + read_process_output (supports offset).";
  } else if (category === 'cancelled') {
    tip = "\n\nCommand was cancelled (client or timeout). Partial output returned. You can restart or inspect bg processes.";
  }

  const payload: any = {
    ok: false,
    error: message,
    category,
    tip: tip.trim(),
    command: extra.command || null,
    stdout: extra.partialStdout || "",
    stderr: extra.partialStderr || "",
    durationMs: extra.durationMs ?? 0,
    truncated: !!(extra.partialStdout || extra.partialStderr),
  };

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

logger.info(`grok-terminal-mcp v0.3.0 (SDK) starting...`);
logger.info(`Working directory: ${ROOT}`);
logger.info(`Config loaded from: ${currentConfig._loadedFrom || "defaults only"}`);
logger.info(`Allowed base commands: ${currentConfig.allowedCommands.length} | Shortcuts: ${Object.keys(currentConfig.projectShortcuts).length}`);

// ============================================
// Create the MCP Server properly
// ============================================

const server = new McpServer({
  name: "grok-terminal-mcp",
  version: "0.3.0",
});

// ============================================
// Tool Definitions (using Zod schemas - best practice)
// ============================================

server.tool(
  "run_command",
  "Execute a shell command. Supports project shortcuts defined in .grok-terminal.json (e.g. 'build', 'check:fast', 'verify:all').",
  {
    command: z.string().describe("Command or shortcut name"),
    cwd: z.string().optional().describe("Working directory (defaults to project root)"),
    timeout: z.number().int().positive().optional().describe("Timeout in ms (default 120000)")
  },
  async (args) => {
    const { command: rawCommand, cwd = ROOT, timeout = currentConfig.defaultTimeoutMs } = args;

    const resolvedCommand = resolveCommand(rawCommand, currentConfig);

    if (rawCommand !== resolvedCommand) {
      logger.info(`Shortcut resolved: "${rawCommand}" → "${resolvedCommand}"`);
    }

    const check = isCommandAllowed(resolvedCommand, currentConfig);
    if (!check.allowed) {
      logger.security(`BLOCKED: ${resolvedCommand} → ${check.reason}`);
      return toolError(check.reason, 'blocked') as any;
    }

    logger.info(`EXEC → ${resolvedCommand}`);
    logger.debug(`  cwd: ${cwd} | timeout: ${timeout}ms`);

    try {
      const result = await executeCommand(rawCommand, currentConfig, { cwd, timeout });
      const n = normalizeForMcp(result, currentConfig.maxOutputBytes);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            stdout: n.stdout,
            stderr: n.stderr,
            exitCode: n.exitCode,
            durationMs: n.durationMs,
            command: n.command,
            truncated: n.truncated,
            totalBytes: n.totalBytes,
            tip: n.truncated
              ? "Output was truncated for safety. Use start_process + read_process_output (with offset) for very large or long-running commands."
              : undefined,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      const message = err?.message || "Unknown error during command execution";
      logger.error(`Error executing command: ${message}`);

      const category = message.toLowerCase().includes('timeout') ? 'timeout' : 'execution';
      return toolError(message, category) as any;
    }
  }
);

server.tool(
  "start_process",
  "Start a long-running or background process. Returns a session ID for later inspection.",
  {
    command: z.string(),
    cwd: z.string().optional(),
  },
  async (args) => {
    try {
      const sessionId = startBackgroundProcess(args.command, currentConfig, { cwd: args.cwd });
      logger.info(`START_PROCESS started (via executor)`);
      return {
        content: [{ type: "text", text: JSON.stringify({ sessionId }) }],
      };
    } catch (err: any) {
      const message = err?.message || "Unknown error starting process";
      logger.error(`Error starting background process: ${message}`);
      return toolError(`Failed to start process: ${message}`) as any;
    }
  }
);

server.tool(
  "list_processes",
  "List all currently tracked background processes.",
  {},
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify({ processes: processManager.list() }, null, 2) }],
    };
  }
);

server.tool(
  "read_process_output",
  "Read output from a background process (supports offset for large outputs).",
  {
    sessionId: z.string(),
    offset: z.number().int().nonnegative().optional().default(0),
    length: z.number().int().positive().optional().default(50000),
  },
  async (args) => {
    const data = processManager.readOutput(args.sessionId, {
      offset: args.offset,
      length: args.length,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "kill_process",
  "Terminate a background process.",
  {
    sessionId: z.string(),
    signal: z.string().optional().default("SIGTERM"),
  },
  async (args) => {
    const result = processManager.kill(args.sessionId, args.signal);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);

server.tool(
  "get_config",
  "Inspect the currently loaded configuration (allowed commands, shortcuts, limits).",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          loadedFrom: currentConfig._loadedFrom,
          allowedCommands: currentConfig.allowedCommands,
          blockedPatterns: currentConfig.blockedPatterns,
          projectShortcuts: currentConfig.projectShortcuts,
          maxOutputBytes: currentConfig.maxOutputBytes,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "reload_config",
  "Reload .grok-terminal.json from disk without restarting the MCP server.",
  {},
  async () => {
    logger.info("reload_config requested");
    try {
      currentConfig = loadConfig(ROOT, cliOptions.config);
      logger.info("Config reloaded successfully");
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Configuration reloaded",
            loadedFrom: currentConfig._loadedFrom,
            allowedCommands: currentConfig.allowedCommands.length,
            shortcuts: Object.keys(currentConfig.projectShortcuts).length,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: err?.message || "Failed to reload config",
          }, null, 2),
        }],
      };
    }
  }
);

// ============================================
// High-value project helper tools (recommended for productivity)
// These are convenience wrappers with sensible defaults for this project.
// They resolve shortcuts and use good timeouts by default.
// ============================================

// Internal wrapper for helpers that returns a nice MCP response (now uses unified normalized shape — Item 2)
async function runProjectShortcut(shortcutOrCommand: string, customTimeout?: number) {
  try {
    const result = await executeCommand(shortcutOrCommand, currentConfig, {
      cwd: ROOT,
      timeout: customTimeout,
    });

    logger.info(`HELPER executed: ${result.command}`);
    const n = normalizeForMcp(result, currentConfig.maxOutputBytes);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          command: n.command,
          stdout: n.stdout,
          stderr: n.stderr,
          exitCode: n.exitCode,
          durationMs: n.durationMs,
          truncated: n.truncated,
          totalBytes: n.totalBytes,
          tip: n.truncated
            ? "Output truncated. For very large output use start_process + read_process_output with offset."
            : undefined,
        }, null, 2),
      }],
      isError: n.exitCode !== 0,
    } as any; // SDK v1 strict literal "text" + branded content union vs our runtime JSON payload. Payload is correct and consumed fine by Grok.
  } catch (err: any) {
    const message = err?.message || "Unknown error";
    logger.error(`Helper command failed: ${message}`);

    const category = message.toLowerCase().includes('timeout') ? 'timeout' : 'execution';
    return toolError(`Command failed: ${message}`, category, { command: shortcutOrCommand }) as any;
  }
}

server.tool(
  "run_build",
  "Runs the full project build (bash build.sh). Recommended after code changes.",
  {
    timeout: z.number().optional().describe("Timeout in ms (default 300000 = 5 minutes)")
  },
  async ({ timeout }) => {
    logger.info("Helper called: run_build");
    return runProjectShortcut("build", timeout) as any;
  }
);

server.tool(
  "run_check_fast",
  "Runs the fast project check (very useful for quick validation).",
  {},
  async () => {
    logger.info("Helper called: run_check_fast");
    return runProjectShortcut("check:fast") as any;
  }
);

server.tool(
  "run_verify_all",
  "Runs the full verification suite. Can take several minutes.",
  {
    timeout: z.number().optional().describe("Timeout in ms (default 600000 = 10 minutes)")
  },
  async ({ timeout }) => {
    logger.info("Helper called: run_verify_all");
    return runProjectShortcut("verify:all", timeout) as any;
  }
);

server.tool(
  "quick_check",
  "Runs the absolute fastest possible sanity check for the project.",
  {},
  async () => {
    logger.info("Helper called: quick_check");
    return runProjectShortcut("quick-check") as any;
  }
);

// ============================================
// General-purpose helpers (work in ANY project)
// These are always available and do not require shortcuts in .grok-terminal.json
// ============================================

/** Detects the package manager used in the current directory */
function detectPackageManager(cwd: string): { cmd: string; name: string } {
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return { cmd: 'yarn', name: 'yarn' };
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return { cmd: 'pnpm', name: 'pnpm' };
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return { cmd: 'bun', name: 'bun' };
  return { cmd: 'npm', name: 'npm' };
}

/** Safely reads package.json if it exists */
function getPackageJson(cwd: string): any | null {
  const pkgPath = path.join(cwd, 'package.json');
  try {
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    }
  } catch {}
  return null;
}

// --- git_status ---
server.tool(
  "git_status",
  "Shows a clean, compact git status (branch + changes). Works in any git repository.",
  {},
  async () => {
    logger.info("Helper called: git_status");
    try {
      const result = await executeCommand("git status --short -b", currentConfig, { cwd: ROOT, timeout: 15000 });
      const normalized = normalizeForMcp(result, currentConfig.maxOutputBytes);
      return {
        content: [{ type: "text", text: JSON.stringify(normalized, null, 2) }],
        isError: normalized.exitCode !== 0,
      } as any;
    } catch (err: any) {
      return toolError(err?.message || "Failed to get git status", "execution") as any;
    }
  }
);

// --- list_scripts ---
server.tool(
  "list_scripts",
  "Lists all available scripts from package.json (npm/yarn/pnpm/bun). Very useful before using run_script.",
  {},
  async () => {
    logger.info("Helper called: list_scripts");
    const pkg = getPackageJson(ROOT);
    if (!pkg || !pkg.scripts) {
      return {
        content: [{ type: "text", text: JSON.stringify({ message: "No package.json or no scripts found in this directory." }, null, 2) }],
      };
    }
    const pm = detectPackageManager(ROOT);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          packageManager: pm.name,
          scripts: pkg.scripts,
          count: Object.keys(pkg.scripts).length,
        }, null, 2),
      }],
    };
  }
);

// --- run_script ---
server.tool(
  "run_script",
  "Runs a script from package.json using the correct package manager (auto-detects npm/yarn/pnpm/bun). Safer than raw run_command.",
  {
    name: z.string().describe("Name of the script (e.g. 'dev', 'build', 'test')"),
    args: z.string().optional().describe("Optional extra arguments to pass to the script"),
  },
  async ({ name, args }) => {
    logger.info(`Helper called: run_script -> ${name}`);
    const pm = detectPackageManager(ROOT);
    let command = `${pm.cmd} run ${name}`;
    if (args) command += ` ${args}`;

    try {
      const result = await executeCommand(command, currentConfig, { cwd: ROOT, timeout: 300000 });
      const normalized = normalizeForMcp(result, currentConfig.maxOutputBytes);
      return {
        content: [{ type: "text", text: JSON.stringify(normalized, null, 2) }],
        isError: normalized.exitCode !== 0,
      } as any;
    } catch (err: any) {
      return toolError(err?.message || `Failed to run script "${name}"`, "execution") as any;
    }
  }
);

// --- project_info ---
server.tool(
  "project_info",
  "Gives a quick overview of the current project (name, version, package manager, git remote, node version, etc.). Useful for orientation.",
  {},
  async () => {
    logger.info("Helper called: project_info");
    const pkg = getPackageJson(ROOT);
    const pm = detectPackageManager(ROOT);

    const info: any = {
      packageManager: pm.name,
      cwd: ROOT,
    };

    if (pkg) {
      info.name = pkg.name;
      info.version = pkg.version;
      info.description = pkg.description;
      info.engines = pkg.engines || null;
    }

    // Try to get git remote
    try {
      const gitResult = await executeCommand("git config --get remote.origin.url", currentConfig, { cwd: ROOT, timeout: 8000 });
      if (gitResult.exitCode === 0) {
        info.gitRemote = gitResult.stdout.trim();
      }
    } catch {}

    // Node version
    try {
      const nodeResult = await executeCommand("node --version", currentConfig, { cwd: ROOT, timeout: 5000 });
      if (nodeResult.exitCode === 0) {
        info.nodeVersion = nodeResult.stdout.trim();
      }
    } catch {}

    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    };
  }
);

// ============================================
// Start the server
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Connected via official SDK. Ready.");

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    try {
      await server.close();
    } catch (e) {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("Fatal startup error:", error);
  process.exit(1);
});

// Catch unhandled errors / promise rejections
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});