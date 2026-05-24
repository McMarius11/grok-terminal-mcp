// config.js - Configuration system for grok-terminal-mcp (Teil 2)
// Supports .grok-terminal.json in project root or user home

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_CONFIG = {
  // Commands that are allowed to be executed (prefix match on first word)
  allowedCommands: [
    "npm", "node", "npx", "bash", "sh", "git", "python3", "python",
    "ls", "cat", "echo", "find", "grep", "timeout", "wc", "head", "tail",
    "make"
  ],

  // Patterns that are always blocked (substring match, case-insensitive)
  blockedPatterns: [
    "rm -rf /", "curl | sh", ":(){ :|:& };:", "mkfs", "dd if=/dev/zero",
    "> /dev/sda", "shutdown", "reboot", "halt"
  ],

  // Output control
  maxOutputBytes: 200000,                    // ~200 KB for normal commands
  maxBackgroundOutputBytes: 5 * 1024 * 1024, // 5 MB ring buffer for background

  // Default timeouts
  defaultTimeoutMs: 120000, // 2 minutes

  // Project-specific shortcuts (can be used as command name)
  // Example: "build" → expands to "bash build.sh"
  projectShortcuts: {
    "check": "npm run check",
    "check:fast": "npm run check:fast",
    "build": "bash build.sh",
    "test": "npm test",
    "test:watch": "npm run test:watch",
    "verify:all": "npm run verify:all",
    "verify:security": "npm run verify:security",
    "verify:topology": "npm run verify:topology",
    "status": "npm run status:fast",
    "quick-check": "node tools/quick-check.js --no-tests"
  }
};

function loadConfig(startDir = process.cwd()) {
  const candidates = [
    path.join(startDir, '.grok-terminal.json'),
    path.join(startDir, '.grok-terminal.config.json'),
    path.join(os.homedir(), '.grok-terminal.json')
  ];

  let userConfig = {};
  let loadedFrom = null;

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        userConfig = JSON.parse(raw);
        loadedFrom = file;
        console.error(`[grok-terminal-mcp] Loaded config from ${file}`);
        break;
      }
    } catch (err) {
      console.error(`[grok-terminal-mcp] Failed to load config ${file}:`, err.message);
    }
  }

  // Deep-ish merge for the important arrays + objects
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,

    allowedCommands: [
      ...DEFAULT_CONFIG.allowedCommands,
      ...(userConfig.allowedCommands || [])
    ],

    blockedPatterns: [
      ...DEFAULT_CONFIG.blockedPatterns,
      ...(userConfig.blockedPatterns || [])
    ],

    projectShortcuts: {
      ...DEFAULT_CONFIG.projectShortcuts,
      ...(userConfig.projectShortcuts || {})
    }
  };

  config._loadedFrom = loadedFrom;
  return config;
}

function resolveCommand(inputCommand, config) {
  const trimmed = inputCommand.trim();

  // Check if it's a project shortcut
  const firstToken = trimmed.split(/\s+/)[0];
  if (config.projectShortcuts[firstToken]) {
    const expansion = config.projectShortcuts[firstToken];
    // Replace the shortcut with the real command, keep any extra args
    const rest = trimmed.slice(firstToken.length).trim();
    return rest ? `${expansion} ${rest}` : expansion;
  }

  return trimmed;
}

function isCommandAllowed(fullCommand, config) {
  const command = fullCommand.trim();
  const lower = command.toLowerCase();

  // 1. Blocked patterns (highest priority)
  for (const pattern of config.blockedPatterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return {
        allowed: false,
        reason: `Blocked by pattern: ${pattern}`
      };
    }
  }

  // 2. Must start with an allowed binary
  const firstWord = command.split(/\s+/)[0];
  const base = path.basename(firstWord);

  const allowed = config.allowedCommands.some(allowedCmd => {
    return base === allowedCmd || base.endsWith('/' + allowedCmd);
  });

  if (!allowed) {
    return {
      allowed: false,
      reason: `Command '${base}' is not allowed. You can add it in .grok-terminal.json under "allowedCommands".`
    };
  }

  return { allowed: true };
}

module.exports = {
  loadConfig,
  isCommandAllowed,
  resolveCommand,
  DEFAULT_CONFIG
};
