// healthTools.ts
// General Environment Health Check for the AI.
// Gives a quick, structured overview of the current dev situation.

import { getRuntimeInfo } from "./runtimes.js";
import { listWatches } from "./watchTools.js";
import { processManager } from "./processManager.js";
import { executeCommand } from "./executor.js";
import type { TerminalConfig } from "./config.js";

export async function getDevStatus(config: TerminalConfig) {
  const [bun, node] = await Promise.all([
    getRuntimeInfo("bun"),
    getRuntimeInfo("node"),
  ]);

  const watches = listWatches();
  const processes = processManager.list();

  // Git status (quick)
  let git: { branch: string | null; dirty: boolean; message: string } = { branch: null, dirty: false, message: "not a git repo" };
  try {
    const branchResult = await executeCommand("git rev-parse --abbrev-ref HEAD", config, { timeout: 3000 });
    if (branchResult.exitCode === 0) {
      const branch = branchResult.stdout.trim();
      const statusResult = await executeCommand("git status --porcelain", config, { timeout: 3000 });
      git = {
        branch,
        dirty: statusResult.stdout.trim().length > 0,
        message: statusResult.stdout.trim().length > 0 ? "dirty" : "clean",
      };
    }
  } catch {}

  // Basic project info
  const cwd = process.cwd();

  return {
    cwd,
    runtimes: {
      bun: bun.found ? { path: bun.path, version: bun.version } : null,
      node: node.found ? { path: node.path, version: node.version } : null,
    },
    watches: watches.map(w => ({ id: w.id, path: w.watchPath, command: w.command })),
    activeProcesses: processes.length,
    git,
    timestamp: new Date().toISOString(),
  };
}
