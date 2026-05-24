// Configuration system for the new proper grok-terminal-mcp

import fs from "fs";
import path from "path";
import os from "os";

export interface TerminalConfig {
  allowedCommands: string[];
  blockedPatterns: string[];
  maxOutputBytes: number;
  maxBackgroundOutputBytes: number;
  defaultTimeoutMs: number;
  projectShortcuts: Record<string, string>;
  _loadedFrom?: string | null;
}

const DEFAULT_CONFIG: TerminalConfig = {
  allowedCommands: [
    "npm", "node", "npx", "yarn", "pnpm", "bun",
    "bash", "sh", "git", "python3", "python", "curl", "unzip", "chmod", "cp", "mv",
    "ls", "cat", "echo", "find", "grep", "timeout", "wc", "head", "tail", "make"
  ],
  blockedPatterns: [
    "rm -rf /", "curl | sh", ":(){ :|:& };:", "mkfs", "dd if=/dev/zero",
    "> /dev/sda", "shutdown", "reboot"
  ],
  maxOutputBytes: 300000,
  maxBackgroundOutputBytes: 5 * 1024 * 1024,
  defaultTimeoutMs: 180000,
  projectShortcuts: {
    "check": "npm run check",
    "check:fast": "npm run check:fast",
    "build": "bash build.sh",
    "test": "npm test",
    "verify:all": "npm run verify:all"
  },
  _loadedFrom: null
};

export function loadConfig(
  startDir: string = process.cwd(),
  explicitConfigPath?: string
): TerminalConfig {
  // If an explicit config path is provided via CLI, use it directly
  if (explicitConfigPath) {
    if (fs.existsSync(explicitConfigPath)) {
      try {
        const raw = fs.readFileSync(explicitConfigPath, "utf8");
        const userConfig = JSON.parse(raw);
        console.error(`[grok-terminal-mcp] Loaded config from ${explicitConfigPath}`);
        return mergeWithDefaults(userConfig, explicitConfigPath);
      } catch (e) {
        console.error(`[grok-terminal-mcp] Failed to parse explicit config ${explicitConfigPath}`);
      }
    } else {
      console.error(`[grok-terminal-mcp] Explicit config not found: ${explicitConfigPath}`);
    }
  }

  // Walk upwards from startDir looking for .grok-terminal.json
  let current = startDir;
  const root = path.parse(current).root;

  while (current !== root) {
    const candidate = path.join(current, ".grok-terminal.json");
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf8");
        const userConfig = JSON.parse(raw);
        console.error(`[grok-terminal-mcp] Loaded config from ${candidate}`);
        return mergeWithDefaults(userConfig, candidate);
      } catch (e) {
        console.error(`[grok-terminal-mcp] Failed to parse ${candidate}`);
      }
    }
    current = path.dirname(current);
  }

  // Fallback to home
  const homeCandidate = path.join(os.homedir(), ".grok-terminal.json");
  if (fs.existsSync(homeCandidate)) {
    try {
      const raw = fs.readFileSync(homeCandidate, "utf8");
      const userConfig = JSON.parse(raw);
      console.error(`[grok-terminal-mcp] Loaded config from ${homeCandidate}`);
      return mergeWithDefaults(userConfig, homeCandidate);
    } catch (e) {
      console.error(`[grok-terminal-mcp] Failed to parse home config`);
    }
  }

  console.error(`[grok-terminal-mcp] Using default configuration`);
  return { ...DEFAULT_CONFIG, _loadedFrom: null };
}

function mergeWithDefaults(userConfig: any, loadedFrom: string): TerminalConfig {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    allowedCommands: [...DEFAULT_CONFIG.allowedCommands, ...(userConfig.allowedCommands || [])],
    blockedPatterns: [...DEFAULT_CONFIG.blockedPatterns, ...(userConfig.blockedPatterns || [])],
    projectShortcuts: { ...DEFAULT_CONFIG.projectShortcuts, ...(userConfig.projectShortcuts || {}) },
    _loadedFrom: loadedFrom,
  };
}

export function resolveCommand(input: string, config: TerminalConfig): string {
  const trimmed = input.trim();
  const first = trimmed.split(/\s+/)[0];

  if (config.projectShortcuts[first]) {
    const rest = trimmed.slice(first.length).trim();
    return rest ? `${config.projectShortcuts[first]} ${rest}` : config.projectShortcuts[first];
  }
  return trimmed;
}

export function isCommandAllowed(fullCommand: string, config: TerminalConfig) {
  const lower = fullCommand.toLowerCase();

  for (const pattern of config.blockedPatterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return { allowed: false, reason: `Blocked pattern: ${pattern}` };
    }
  }

  const firstWord = fullCommand.trim().split(/\s+/)[0];
  const base = path.basename(firstWord);

  const allowed = config.allowedCommands.some(cmd => base === cmd || base.endsWith("/" + cmd));

  if (!allowed) {
    return {
      allowed: false,
      reason: `Command '${base}' is not allowed. Add it to .grok-terminal.json`
    };
  }

  return { allowed: true };
}