// watchTools.ts
// General-purpose file watching + action execution.
// Allows the AI to set up "watch this folder → run this command on changes"
// Reusable for any project (rebuild + reinstall, test on save, etc.)

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { processManager } from "./processManager.js";
import { executeCommand } from "./executor.js";
import type { TerminalConfig } from "./config.js";

interface WatchSession {
  id: string;
  watchPath: string;
  command: string;
  debounceMs: number;
  ignorePatterns: string[];
  lastRun: number;
  running: boolean;
}

const activeWatches = new Map<string, WatchSession>();
const watchers = new Map<string, fs.FSWatcher>();

function matchesIgnore(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some(pattern => {
    const regex = new RegExp(
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")
    );
    return regex.test(normalized);
  });
}

async function runAction(
  session: WatchSession,
  config: TerminalConfig,
  reason: string
) {
  const now = Date.now();
  if (now - session.lastRun < session.debounceMs) {
    return;
  }
  session.lastRun = now;

  console.error(`[grok-terminal-mcp][watch] Change detected in ${session.watchPath} (${reason}). Running: ${session.command}`);

  try {
    await executeCommand(session.command, config, {
      cwd: session.watchPath,
      timeout: 300000,
    });
  } catch (err: any) {
    console.error(`[grok-terminal-mcp][watch] Command failed: ${err.message}`);
  }
}

export async function startWatch(
  watchPath: string,
  command: string,
  options: {
    debounceMs?: number;
    ignorePatterns?: string[];
    config: TerminalConfig;
  }
): Promise<{ sessionId: string; message: string }> {
  const absolutePath = path.resolve(watchPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Watch path does not exist: ${absolutePath}`);
  }

  const sessionId = randomUUID();
  const debounceMs = options.debounceMs ?? 750;
  const ignorePatterns = options.ignorePatterns ?? [
    "node_modules",
    ".git",
    "dist",
    "build",
    "*.log",
  ];

  const session: WatchSession = {
    id: sessionId,
    watchPath: absolutePath,
    command,
    debounceMs,
    ignorePatterns,
    lastRun: 0,
    running: true,
  };

  activeWatches.set(sessionId, session);

  // Simple recursive watcher using fs.watch
  function setupWatcher(dir: string) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename || !session.running) return;

        const fullPath = path.join(dir, filename.toString());
        if (matchesIgnore(fullPath, ignorePatterns)) return;

        runAction(session, options.config, `${eventType} on ${filename}`);
      });

      watchers.set(sessionId, watcher);

      watcher.on("error", (err) => {
        console.error(`[grok-terminal-mcp][watch] Watcher error: ${err}`);
      });
    } catch (err) {
      console.error(`[grok-terminal-mcp][watch] Failed to set up watcher on ${dir}: ${err}`);
    }
  }

  setupWatcher(absolutePath);

  return {
    sessionId,
    message: `Watch started on ${absolutePath}. Will run "${command}" on changes (debounce: ${debounceMs}ms). Use kill_process to stop.`,
  };
}

export function stopWatch(sessionId: string): { success: boolean; message: string } {
  const session = activeWatches.get(sessionId);
  if (!session) {
    return { success: false, message: "Watch session not found" };
  }

  session.running = false;

  const watcher = watchers.get(sessionId);
  if (watcher) {
    watcher.close();
    watchers.delete(sessionId);
  }

  activeWatches.delete(sessionId);

  return {
    success: true,
    message: `Watch session ${sessionId} stopped.`,
  };
}

export function listWatches() {
  return Array.from(activeWatches.values()).map((s) => ({
    id: s.id,
    watchPath: s.watchPath,
    command: s.command,
    running: s.running,
  }));
}
