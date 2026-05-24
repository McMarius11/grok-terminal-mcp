// gitTools.ts
// General Git workflow helpers for the AI.
// Focus on common safe and useful operations.

import { executeCommand } from "./executor.js";
import type { TerminalConfig } from "./config.js";

export async function gitCommit(
  message: string,
  options: { addAll?: boolean; config: TerminalConfig; cwd?: string }
) {
  const { addAll = true, config, cwd } = options;

  let cmd = "";
  if (addAll) {
    cmd = `git add -A && git commit -m "${message.replace(/"/g, '\\"')}"`;
  } else {
    cmd = `git commit -m "${message.replace(/"/g, '\\"')}"`;
  }

  const result = await executeCommand(cmd, config, { cwd: cwd || process.cwd(), timeout: 30000 });

  return {
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.exitCode === 0 ? "Commit successful" : "Commit failed",
  };
}

export async function gitCreateBranch(
  branchName: string,
  options: { checkout?: boolean; config: TerminalConfig; cwd?: string }
) {
  const { checkout = true, config, cwd } = options;
  const cmd = checkout ? `git checkout -b ${branchName}` : `git branch ${branchName}`;

  const result = await executeCommand(cmd, config, { cwd: cwd || process.cwd(), timeout: 10000 });

  return {
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function gitPush(
  options: { setUpstream?: boolean; config: TerminalConfig; cwd?: string }
) {
  const { setUpstream = true, config, cwd } = options;

  let cmd = "git push";
  if (setUpstream) {
    // Get current branch
    const branchRes = await executeCommand("git rev-parse --abbrev-ref HEAD", config, { cwd: cwd || process.cwd(), timeout: 5000 });
    if (branchRes.exitCode === 0) {
      const branch = branchRes.stdout.trim();
      cmd = `git push --set-upstream origin ${branch}`;
    }
  }

  const result = await executeCommand(cmd, config, { cwd: cwd || process.cwd(), timeout: 60000 });

  return {
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
