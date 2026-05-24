// runtimes.ts
// General runtime management for the AI (Bun, Node, future: Go, Rust, Python, etc.).
// Goal: Give the AI reliable access to common development runtimes without manual setup.

import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type Runtime = "bun" | "node";

export interface RuntimeInfo {
  runtime: Runtime;
  found: boolean;
  path: string | null;
  version: string | null;
  installDir: string | null;
  source: "PATH" | "standard" | "env" | "not-found";
}

const RUNTIME_LOCATIONS: Record<Runtime, string[]> = {
  bun: [
    path.join(os.homedir(), ".bun", "bin", "bun"),
    "/usr/local/bin/bun",
    "/opt/bun/bin/bun",
    path.join(os.homedir(), ".local", "bin", "bun"),
  ],
  node: [
    "/usr/local/bin/node",
    "/opt/node/bin/node",
    path.join(os.homedir(), ".nvm", "versions", "node", "current", "bin", "node"),
  ],
};

export async function getRuntimeInfo(runtime: Runtime): Promise<RuntimeInfo> {
  const locations = RUNTIME_LOCATIONS[runtime] || [];

  // 1. Check PATH
  const cmd = runtime === "bun" ? "bun" : "node";
  try {
    const { stdout } = await execAsync(`command -v ${cmd} || which ${cmd} 2>/dev/null || echo ''`, { timeout: 3000 });
    const p = stdout.trim();
    if (p && fs.existsSync(p)) {
      const version = await getRuntimeVersion(runtime, p);
      return {
        runtime,
        found: true,
        path: p,
        version,
        installDir: path.dirname(path.dirname(p)),
        source: "PATH",
      };
    }
  } catch {}

  // 2. Environment variable hints
  if (runtime === "bun") {
    const envInstall = process.env.BUN_INSTALL;
    if (envInstall) {
      const candidate = path.join(envInstall, "bin", "bun");
      if (fs.existsSync(candidate)) {
        const version = await getRuntimeVersion(runtime, candidate);
        return { runtime, found: true, path: candidate, version, installDir: envInstall, source: "env" };
      }
    }
  }

  // 3. Standard locations
  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      try {
        const version = await getRuntimeVersion(runtime, loc);
        return {
          runtime,
          found: true,
          path: loc,
          version,
          installDir: path.dirname(path.dirname(loc)),
          source: "standard",
        };
      } catch {}
    }
  }

  return { runtime, found: false, path: null, version: null, installDir: null, source: "not-found" };
}

async function getRuntimeVersion(runtime: Runtime, execPath: string): Promise<string | null> {
  const arg = runtime === "bun" ? "--version" : "--version";
  try {
    const { stdout } = await execAsync(`"${execPath}" ${arg}`, { timeout: 5000 });
    return stdout.trim().replace(/^bun |^v/, "");
  } catch {
    return null;
  }
}

/**
 * Ensures a runtime is available. Currently fully supports "bun".
 * "node" only does detection for now.
 */
export async function ensureRuntime(
  runtime: Runtime,
  options: { timeoutMs?: number } = {}
): Promise<{
  success: boolean;
  info: RuntimeInfo;
  message: string;
  installedNow: boolean;
}> {
  const timeoutMs = options.timeoutMs ?? 180000;

  let info = await getRuntimeInfo(runtime);
  if (info.found && info.path) {
    return {
      success: true,
      info,
      message: `${runtime} ${info.version} already available at ${info.path}`,
      installedNow: false,
    };
  }

  if (runtime !== "bun") {
    return {
      success: false,
      info,
      message: `Automatic installation for runtime "${runtime}" is not yet supported.`,
      installedNow: false,
    };
  }

  // === Bun installation (existing logic) ===
  const home = os.homedir();
  const targetInstall = path.join(home, ".bun");
  const cmd = `curl -fsSL https://bun.sh/install | BUN_INSTALL="${targetInstall}" bash`;

  console.error(`[grok-terminal-mcp][runtimes] Starting controlled ${runtime} bootstrap...`);

  try {
    await execAsync(cmd, {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, BUN_INSTALL: targetInstall },
    });

    info = await getRuntimeInfo(runtime);

    if (info.found && info.path) {
      return {
        success: true,
        info,
        message: `Bun ${info.version} installed to ${targetInstall}. Path: ${info.path}`,
        installedNow: true,
      };
    }

    const postInstall = path.join(targetInstall, "bin", "bun");
    if (fs.existsSync(postInstall)) {
      const ver = await getRuntimeVersion(runtime, postInstall);
      return {
        success: true,
        info: { runtime, found: true, path: postInstall, version: ver, installDir: targetInstall, source: "standard" },
        message: `Bun installed. You may need to add ${targetInstall}/bin to PATH.`,
        installedNow: true,
      };
    }

    return {
      success: false,
      info,
      message: `Installation ran but ${runtime} was not detected.`,
      installedNow: false,
    };
  } catch (err: any) {
    return {
      success: false,
      info,
      message: `Failed to install ${runtime}: ${err?.message || err}`,
      installedNow: false,
    };
  }
}

export async function getRuntimeCommand(runtime: Runtime): Promise<string> {
  const info = await getRuntimeInfo(runtime);
  if (info.path) {
    return `"${info.path}"`;
  }
  return runtime;
}
