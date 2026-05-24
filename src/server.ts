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
import {
  readTextFile,
  writeFileContent,
  applyEdits,
  searchFiles,
  type FileEdit,
} from "./fileTools.js";

import {
  getBunInfo,
  ensureBunInstalled,
  getBunCommand,
} from "./bunTools.js";

import {
  getRuntimeInfo,
  ensureRuntime,
  getRuntimeCommand,
  type Runtime,
} from "./runtimes.js";

import {
  findBlockbench,
  getBlockbenchPluginsDir,
  installBlockbenchPlugin,
  buildAndInstallBlockbenchPlugin,
  listBlockbenchPlugins,
} from "./blockbenchTools.js";

import {
  installArtifact,
  findCommonPluginsDir,
} from "./artifactTools.js";

import {
  startWatch,
  stopWatch,
  listWatches,
} from "./watchTools.js";

import {
  findExecutable,
  launchApp,
  isAppRunning,
} from "./appTools.js";

import { getDevStatus } from "./healthTools.js";

import { startDevSession } from "./devSessionTools.js";

import { gitCommit, gitCreateBranch, gitPush } from "./gitTools.js";

import fs from "fs";
import path from "path";

/**
 * Helper to register MCP tools using the recommended registerTool API
 * (the .tool() overloads are deprecated in SDK >=1.29).
 *
 * Centralizes the casts so the rest of the file stays readable.
 */
function registerTool(
  name: string,
  description: string,
  schema: z.ZodObject<any> | Record<string, z.ZodTypeAny> | undefined,
  handler: (args: any, extra?: any) => Promise<any> | any
) {
  server.registerTool(name, {
    description,
    inputSchema: schema as any,
  }, handler as any);
}

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

logger.info(`grok-terminal-mcp v0.5.0 (SDK) starting...`);
logger.info(`Working directory: ${ROOT}`);
logger.info(`Config loaded from: ${currentConfig._loadedFrom || "defaults only"}`);
logger.info(`Allowed base commands: ${currentConfig.allowedCommands.length} | Shortcuts: ${Object.keys(currentConfig.projectShortcuts).length}`);

// ============================================
// Create the MCP Server properly
// ============================================

const server = new McpServer({
  name: "grok-terminal-mcp",
  version: "0.5.0",
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
  async (args, extra?: any) => {
    const { command: rawCommand, cwd = ROOT, timeout = currentConfig.defaultTimeoutMs } = args;
    const signal = extra?.signal;

    const resolvedCommand = resolveCommand(rawCommand, currentConfig);

    if (rawCommand !== resolvedCommand) {
      logger.info(`Shortcut resolved: "${rawCommand}" → "${resolvedCommand}"`);
    }

    const check = isCommandAllowed(resolvedCommand, currentConfig);
    if (!check.allowed) {
      logger.security(`BLOCKED: ${resolvedCommand} → ${check.reason}`);
      return toolError(check.reason as string, 'blocked') as any;
    }

    logger.info(`EXEC → ${resolvedCommand}`);
    logger.debug(`  cwd: ${cwd} | timeout: ${timeout}ms`);

    try {
      const result = await executeCommand(rawCommand, currentConfig, { cwd, timeout, signal });
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
            cancelled: n.cancelled || false,
            tip: n.cancelled
              ? "Command was cancelled by the client."
              : n.truncated
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
async function runProjectShortcut(shortcutOrCommand: string, customTimeout?: number, signal?: AbortSignal) {
  try {
    const result = await executeCommand(shortcutOrCommand, currentConfig, {
      cwd: ROOT,
      timeout: customTimeout,
      signal,
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
          cancelled: n.cancelled || false,
          tip: n.cancelled
            ? "Command was cancelled."
            : n.truncated
              ? "Output truncated. For very large output use start_process + read_process_output with offset."
              : undefined,
        }, null, 2),
      }],
      isError: n.exitCode !== 0,
    } as any;
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
  async ({ timeout }, extra?: any) => {
    logger.info("Helper called: run_build");
    return runProjectShortcut("build", timeout, extra?.signal) as any;
  }
);

registerTool(
  "run_check_fast",
  "Runs the fast project check (very useful for quick validation).",
  {},
  async (_, extra?: any) => {
    logger.info("Helper called: run_check_fast");
    return runProjectShortcut("check:fast", undefined, extra?.signal) as any;
  }
);

registerTool(
  "run_verify_all",
  "Runs the full verification suite. Can take several minutes.",
  {
    timeout: z.number().optional().describe("Timeout in ms (default 600000 = 10 minutes)")
  },
  async ({ timeout }, extra?: any) => {
    logger.info("Helper called: run_verify_all");
    return runProjectShortcut("verify:all", timeout, extra?.signal) as any;
  }
);

server.tool(
  "quick_check",
  "Runs the absolute fastest possible sanity check for the project.",
  {},
  async (_, extra?: any) => {
    logger.info("Helper called: quick_check");
    return runProjectShortcut("quick-check", undefined, extra?.signal) as any;
  }
);

// ============================================
// General-purpose helpers (work in ANY project)
// These are always available and do not require shortcuts in .grok-terminal.json
// ============================================

/** Detects the package manager used in the current directory (updated for modern bun.lock) */
function detectPackageManager(cwd: string): { cmd: string; name: string } {
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return { cmd: 'yarn', name: 'yarn' };
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return { cmd: 'pnpm', name: 'pnpm' };
  if (fs.existsSync(path.join(cwd, 'bun.lock')) || fs.existsSync(path.join(cwd, 'bun.lockb'))) {
    return { cmd: 'bun', name: 'bun' };
  }
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
  async (_, extra?: any) => {
    logger.info("Helper called: git_status");
    try {
      const result = await executeCommand("git status --short -b", currentConfig, { 
        cwd: ROOT, 
        timeout: 15000,
        signal: extra?.signal 
      });
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

// --- git_diff (new general helper) ---
server.tool(
  "git_diff",
  "Shows git diff (unstaged changes). Useful for seeing what has been changed.",
  {
    staged: z.boolean().optional().describe("If true, shows staged changes instead (git diff --staged)")
  },
  async ({ staged }, extra?: any) => {
    logger.info(`Helper called: git_diff (staged=${staged})`);
    const cmd = staged ? "git diff --staged" : "git diff";
    try {
      const result = await executeCommand(cmd, currentConfig, { 
        cwd: ROOT, 
        timeout: 30000,
        signal: extra?.signal 
      });
      const normalized = normalizeForMcp(result, currentConfig.maxOutputBytes);
      return {
        content: [{ type: "text", text: JSON.stringify(normalized, null, 2) }],
        isError: normalized.exitCode !== 0,
      } as any;
    } catch (err: any) {
      return toolError(err?.message || "Failed to get git diff", "execution") as any;
    }
  }
);

// --- deps_outdated (new general helper) ---
server.tool(
  "deps_outdated",
  "Shows outdated dependencies using the project's package manager (npm/yarn/pnpm/bun).",
  {},
  async (_, extra?: any) => {
    logger.info("Helper called: deps_outdated");
    const pm = detectPackageManager(ROOT);
    // Most package managers support "outdated" (npm, yarn, pnpm, bun)
    const cmd = `${pm.cmd} outdated`;
    try {
      const result = await executeCommand(cmd, currentConfig, { 
        cwd: ROOT, 
        timeout: 60000,
        signal: extra?.signal 
      });
      const normalized = normalizeForMcp(result, currentConfig.maxOutputBytes);
      return {
        content: [{ type: "text", text: JSON.stringify(normalized, null, 2) }],
        isError: normalized.exitCode !== 0,
      } as any;
    } catch (err: any) {
      // Many package managers return non-zero when there are outdated packages
      // So we still return the output even on error
      return toolError(err?.message || "Failed to check outdated dependencies", "execution") as any;
    }
  }
);

// ============================================
// Structured File Tools (inspired by official Filesystem MCP)
// These provide precise, AI-friendly file operations that are hard to do
// elegantly with raw shell commands.
// ============================================

const ReadTextFileSchema = z.object({
  path: z.string().describe("Path to the file to read"),
  head: z.number().optional().describe("Return only the first N lines"),
  tail: z.number().optional().describe("Return only the last N lines"),
});

registerTool(
  "read_text_file",
  "Read the contents of a text file. Supports head/tail for large files. This is more precise than shell commands for reading specific parts of files.",
  ReadTextFileSchema,
  async (args: any, extra?: any) => {
    logger.info(`Tool called: read_text_file -> ${args.path}`);
    try {
      const content = await readTextFile(args.path, args.head, args.tail);
      return {
        content: [{ type: "text", text: content }],
      };
    } catch (err: any) {
      return toolError(err?.message || "Failed to read file", "execution") as any;
    }
  }
);

const WriteFileSchema = z.object({
  path: z.string().describe("Path to the file to write"),
  content: z.string().describe("Content to write to the file"),
});

registerTool(
  "write_file",
  "Write content to a file (overwrites existing content). Use with caution — consider edit_file for modifications.",
  WriteFileSchema,
  async (args: any, extra?: any) => {
    logger.info(`Tool called: write_file -> ${args.path}`);
    try {
      await writeFileContent(args.path, args.content);
      return {
        content: [{ type: "text", text: `Successfully wrote ${args.content.length} characters to ${args.path}` }],
      };
    } catch (err: any) {
      return toolError(err?.message || "Failed to write file", "execution") as any;
    }
  }
);

const EditOperationSchema = z.object({
  oldText: z.string().describe("Text to search for (must match exactly)"),
  newText: z.string().describe("Text to replace it with"),
});

const EditFileSchema = z.object({
  path: z.string().describe("Path to the file to edit"),
  edits: z.array(EditOperationSchema).describe("List of edits to apply sequentially"),
  dryRun: z.boolean().optional().default(false).describe("If true, returns a unified diff preview instead of applying changes"),
});

registerTool(
  "edit_file",
  "The most powerful file editing tool. Apply precise text replacements. Use dryRun=true to preview changes as a git-style unified diff. This is the recommended way to modify source files.",
  EditFileSchema,
  async (args: any, extra?: any) => {
    logger.info(`Tool called: edit_file -> ${args.path} (dryRun=${args.dryRun})`);
    try {
      const result = await applyEdits(args.path, args.edits as any, args.dryRun, extra?.signal);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (err: any) {
      return toolError(err?.message || "Failed to edit file", "execution") as any;
    }
  }
);

const SearchFilesSchema = z.object({
  path: z.string().describe("Root directory to search in"),
  pattern: z.string().describe("Text pattern to search for inside files"),
  excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude (e.g. node_modules/**, *.log)"),
});

registerTool(
  "search_files",
  "Recursively search for a text pattern inside files. Much more convenient than manual grep for complex searches.",
  SearchFilesSchema,
  async (args: any, extra?: any) => {
    logger.info(`Tool called: search_files -> ${args.path}`);
    try {
      const results = await searchFiles(args.path, args.pattern, args.excludePatterns);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    } catch (err: any) {
      return toolError(err?.message || "Failed to search files", "execution") as any;
    }
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
  async ({ name, args }, extra?: any) => {
    logger.info(`Helper called: run_script -> ${name}`);
    const pm = detectPackageManager(ROOT);
    let command = `${pm.cmd} run ${name}`;
    if (args) command += ` ${args}`;

    try {
      const result = await executeCommand(command, currentConfig, { 
        cwd: ROOT, 
        timeout: 300000,
        signal: extra?.signal 
      });
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
  async (_, extra?: any) => {
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
      const gitResult = await executeCommand("git config --get remote.origin.url", currentConfig, { 
        cwd: ROOT, 
        timeout: 8000,
        signal: extra?.signal 
      });
      if (gitResult.exitCode === 0) {
        info.gitRemote = gitResult.stdout.trim();
      }
    } catch {}

    // Node version
    try {
      const nodeResult = await executeCommand("node --version", currentConfig, { 
        cwd: ROOT, 
        timeout: 5000,
        signal: extra?.signal 
      });
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
// General Runtime Tools (Bun, Node, future runtimes)
// These are the foundation for reliable development across many projects.
// ============================================

server.tool(
  "get_runtime_info",
  "Returns information about a runtime (bun, node, ...). General purpose, works for any project.",
  {
    runtime: z.enum(["bun", "node"]).describe("The runtime to check"),
  },
  async ({ runtime }) => {
    logger.info(`Tool called: get_runtime_info -> ${runtime}`);
    const info = await getRuntimeInfo(runtime as Runtime);
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

server.tool(
  "ensure_runtime",
  "Ensures a runtime (currently best support for 'bun') is installed and available. General purpose tool.",
  {
    runtime: z.enum(["bun", "node"]).describe("Runtime to ensure"),
    timeoutMs: z.number().optional().describe("Timeout for installation (default 180s)"),
  },
  async ({ runtime, timeoutMs }, extra?: any) => {
    logger.info(`Tool called: ensure_runtime -> ${runtime}`);
    try {
      const result = await ensureRuntime(runtime as Runtime, { timeoutMs });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return toolError(err?.message || "Failed to ensure runtime", "execution") as any;
    }
  }
);

// ============================================
// General Artifact Installation (reusable across projects)
// ============================================

server.tool(
  "install_artifact",
  "General tool to install/copy a built artifact (file or folder) into a target directory. Usable for plugins, extensions, binaries, etc. across many applications.",
  {
    source: z.string().describe("Path to the built file or directory"),
    target: z.string().describe("Destination directory"),
    name: z.string().optional().describe("Optional new name for the artifact"),
    strategy: z.enum(["copy", "symlink"]).optional().default("copy"),
  },
  async (args) => {
    logger.info(`Tool called: install_artifact -> ${args.source} → ${args.target}`);
    try {
      const result = await installArtifact(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      } as any;
    } catch (err: any) {
      return toolError(err?.message || "Artifact installation failed", "execution") as any;
    }
  }
);

registerTool(
  "find_common_plugins_dir",
  "Finds common plugin/extension directories for various apps (Blockbench, VSCode, Godot, etc.). General helper.",
  {
    appHint: z.string().optional().describe("Hint like 'blockbench', 'vscode', 'godot'"),
  },
  async ({ appHint }) => {
    logger.info(`Tool called: find_common_plugins_dir -> ${appHint || "generic"}`);
    const dir = findCommonPluginsDir(appHint);
    return { content: [{ type: "text", text: JSON.stringify({ directory: dir }, null, 2) }] };
  }
);

// ============================================
// General Watch + Action (for dev loops: rebuild + reinstall, test on save, etc.)
// ============================================

server.tool(
  "start_watch",
  "Starts a file watcher on a directory. On changes, runs the given command (with debounce). General purpose for any dev loop.",
  {
    path: z.string().describe("Directory to watch"),
    command: z.string().describe("Command to run when files change"),
    debounceMs: z.number().optional().default(750).describe("Debounce time in ms"),
    ignorePatterns: z.array(z.string()).optional().describe("Patterns to ignore (e.g. node_modules, dist)"),
  },
  async (args, extra) => {
    logger.info(`Tool called: start_watch on ${args.path}`);
    try {
      const result = await startWatch(args.path, args.command, {
        debounceMs: args.debounceMs,
        ignorePatterns: args.ignorePatterns,
        config: currentConfig,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return toolError(err?.message || "Failed to start watch", "execution") as any;
    }
  }
);

registerTool(
  "list_watches",
  "Lists all currently active file watchers started with start_watch.",
  {},
  async () => {
    logger.info("Tool called: list_watches");
    const watches = listWatches();
    return { content: [{ type: "text", text: JSON.stringify({ watches }, null, 2) }] };
  }
);

server.tool(
  "stop_watch",
  "Stops a previously started watch session.",
  {
    sessionId: z.string(),
  },
  async ({ sessionId }) => {
    logger.info(`Tool called: stop_watch -> ${sessionId}`);
    const result = stopWatch(sessionId);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.success,
    } as any;
  }
);

// ============================================
// General App Launch & Status Tools
// Useful for desktop/GUI applications (Blockbench, Godot, VSCode, Electron apps, etc.)
// ============================================

server.tool(
  "find_executable",
  "Tries to find an application executable or AppImage by name hint. General purpose across many programs.",
  {
    hint: z.string().describe("Name or hint of the app (e.g. 'blockbench', 'godot', 'myapp')"),
  },
  async ({ hint }) => {
    logger.info(`Tool called: find_executable -> ${hint}`);
    const result = await findExecutable(hint);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "launch_app",
  "Launches a desktop application (especially good for AppImages and GUI programs). Returns immediately.",
  {
    executable: z.string().describe("Full path to the executable or AppImage"),
    args: z.array(z.string()).optional().default([]),
  },
  async ({ executable, args }) => {
    logger.info(`Tool called: launch_app -> ${executable}`);
    const result = launchApp(executable, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.success,
    } as any;
  }
);

server.tool(
  "is_app_running",
  "Checks whether an application is currently running by name.",
  {
    name: z.string().describe("Process name or hint (e.g. 'blockbench', 'godot')"),
  },
  async ({ name }) => {
    logger.info(`Tool called: is_app_running -> ${name}`);
    const result = await isAppRunning(name);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// General Environment Health Check
server.tool(
  "dev_status",
  "Gives a quick, structured overview of the current development environment (runtimes, watches, git, processes). Very useful for the AI to orient itself.",
  {},
  async () => {
    logger.info("Tool called: dev_status");
    const status = await getDevStatus(currentConfig);
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  }
);

// Smart Dev Session (one-call dev loop setup)
server.tool(
  "start_dev_session",
  "Starts a smart development session: watches a project and runs build (+ optional install) on changes. General purpose.",
  {
    projectDir: z.string(),
    buildCommand: z.string(),
    installCommand: z.string().optional(),
  },
  async (args) => {
    logger.info(`Tool called: start_dev_session in ${args.projectDir}`);
    try {
      const result = await startDevSession({
        ...args,
        config: currentConfig,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err?.message || "Failed to start dev session", "execution") as any;
    }
  }
);

// General Git Workflow Helpers
server.tool(
  "git_commit",
  "Creates a git commit. Supports auto-adding all changes.",
  {
    message: z.string(),
    addAll: z.boolean().optional().default(true),
    cwd: z.string().optional(),
  },
  async (args) => {
    const result = await gitCommit(args.message, { addAll: args.addAll, config: currentConfig, cwd: args.cwd });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "git_create_branch",
  "Creates and optionally checks out a new git branch.",
  {
    name: z.string(),
    checkout: z.boolean().optional().default(true),
    cwd: z.string().optional(),
  },
  async (args) => {
    const result = await gitCreateBranch(args.name, { checkout: args.checkout, config: currentConfig, cwd: args.cwd });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "git_push",
  "Pushes current branch (with --set-upstream by default for safety).",
  {
    setUpstream: z.boolean().optional().default(true),
    cwd: z.string().optional(),
  },
  async (args) => {
    const result = await gitPush({ setUpstream: args.setUpstream, config: currentConfig, cwd: args.cwd });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================
// Bun + Blockbench dev workflow tools (the reason this fork/extension exists)
// These give the AI full autonomy for building and hot-installing the Blockbench
// MCP plugin even when Bun is not pre-installed on the host.
// ============================================

// --- ensure_bun ---
server.tool(
  "ensure_bun",
  "Ensures Bun (the JavaScript runtime) is installed and available. If missing, performs a controlled installation using the official installer. Critical for Blockbench plugin development (the blockbench-mcp-plugin uses Bun for its build).",
  {
    timeoutMs: z.number().optional().describe("Max time for install attempt (default 180s)"),
  },
  async ({ timeoutMs }, extra?: any) => {
    logger.info("Tool called: ensure_bun");
    try {
      const result = await ensureBunInstalled({ timeoutMs });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return toolError(err?.message || "Bun ensure failed", "execution") as any;
    }
  }
);

// --- get_bun_info ---
registerTool(
  "get_bun_info",
  "Reports whether Bun is available, the full path to the binary, version, and detection source. No side effects.",
  {},
  async () => {
    logger.info("Tool called: get_bun_info");
    const info = await getBunInfo();
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

// --- find_blockbench ---
server.tool(
  "find_blockbench",
  "Discovers Blockbench installation (executable) and the user plugins directory (cross-platform). Returns recommended locations for manual or automated plugin installation. Use the returned pluginsDir for install_blockbench_plugin.",
  {
    overridePluginsDir: z.string().optional().describe("Force a specific plugins directory instead of auto-detection"),
  },
  async ({ overridePluginsDir }) => {
    logger.info("Tool called: find_blockbench");
    const loc = await findBlockbench(overridePluginsDir);
    return { content: [{ type: "text", text: JSON.stringify(loc, null, 2) }] };
  }
);

// --- get_blockbench_plugins_dir ---
registerTool(
  "get_blockbench_plugins_dir",
  "Returns (and creates if necessary) the Blockbench plugins directory for the current platform. This is where you copy the built mcp.js for a persistent install.",
  {
    override: z.string().optional(),
  },
  async ({ override }) => {
    logger.info("Tool called: get_blockbench_plugins_dir");
    const res = await getBlockbenchPluginsDir(override);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
  }
);

// --- install_blockbench_plugin ---
server.tool(
  "install_blockbench_plugin",
  "Copies a built Blockbench plugin (usually dist/mcp.js from the blockbench-mcp-plugin project) into the Blockbench user plugins directory. This makes the plugin available after restarting Blockbench or reloading plugins. Pairs perfectly with the inner `install_plugin_from_path` tool once the MCP plugin is running inside Blockbench.",
  {
    source: z.string().describe("Path to the built mcp.js OR the dist/ folder containing it (e.g. /path/to/blockbench_mcp/dist)"),
    targetDir: z.string().optional().describe("Target plugins directory (auto-detected if omitted)"),
    pluginFilename: z.string().optional().default("mcp.js").describe("Filename to use inside the plugins dir"),
  },
  async (args, extra?: any) => {
    logger.info(`Tool called: install_blockbench_plugin -> ${args.source}`);
    try {
      const result = await installBlockbenchPlugin(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      } as any;
    } catch (err: any) {
      return toolError(err?.message || "Plugin install failed", "execution") as any;
    }
  }
);

// --- build_and_install_blockbench_plugin (the killer feature) ---
server.tool(
  "build_and_install_blockbench_plugin",
  "THE most powerful one-shot tool for Blockbench MCP development: ensures Bun, runs `bun run build` in the given blockbench-mcp-plugin checkout, then installs the resulting dist/mcp.js into your Blockbench plugins folder. Use this after every source change for instant iteration. Returns full build log + install status.",
  {
    projectDir: z.string().optional().describe("Path to the blockbench-mcp-plugin source root (the folder with package.json + build/ + index.ts). Defaults to current working dir."),
    targetPluginsDir: z.string().optional(),
    pluginFilename: z.string().optional(),
  },
  async (args, extra?: any) => {
    logger.info("Tool called: build_and_install_blockbench_plugin");
    try {
      const result = await buildAndInstallBlockbenchPlugin(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      } as any;
    } catch (err: any) {
      return toolError(err?.message || "Build+install failed", "execution") as any;
    }
  }
);

// --- list_blockbench_plugins ---
registerTool(
  "list_blockbench_plugins",
  "Lists all .js plugins currently present in the Blockbench plugins directory. Useful to verify that your mcp.js (or blockbench-mcp.js) landed correctly after an install.",
  {
    targetDir: z.string().optional(),
  },
  async ({ targetDir }) => {
    logger.info("Tool called: list_blockbench_plugins");
    const res = await listBlockbenchPlugins(targetDir);
    return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
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