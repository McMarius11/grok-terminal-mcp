// bunTools.ts
// Bun version management, detection, and reliable installation for dev workflows.
// Designed so the AI can bootstrap and use Bun even when it is not in PATH.

import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface BunInfo {
  found: boolean;
  bunPath: string | null;
  version: string | null;
  installDir: string | null;
  source: "PATH" | "standard" | "env" | "not-found";
}

const BUN_STANDARD_LOCATIONS = [
  path.join(os.homedir(), ".bun", "bin", "bun"),
  "/usr/local/bin/bun",
  "/opt/bun/bin/bun",
  path.join(os.homedir(), ".local", "bin", "bun"),
];

export async function getBunInfo(): Promise<BunInfo> {
  // 1. Check PATH via which/where
  try {
    const { stdout } = await execAsync("command -v bun || which bun 2>/dev/null || echo ''", { timeout: 3000 });
    const p = stdout.trim();
    if (p && fs.existsSync(p)) {
      const version = await getBunVersion(p);
      return { found: true, bunPath: p, version, installDir: path.dirname(path.dirname(p)), source: "PATH" };
    }
  } catch {}

  // 2. Check BUN_INSTALL env
  const envInstall = process.env.BUN_INSTALL;
  if (envInstall) {
    const candidate = path.join(envInstall, "bin", "bun");
    if (fs.existsSync(candidate)) {
      const version = await getBunVersion(candidate);
      return { found: true, bunPath: candidate, version, installDir: envInstall, source: "env" };
    }
  }

  // 3. Standard locations
  for (const loc of BUN_STANDARD_LOCATIONS) {
    if (fs.existsSync(loc)) {
      try {
        const version = await getBunVersion(loc);
        return { found: true, bunPath: loc, version, installDir: path.dirname(path.dirname(loc)), source: "standard" };
      } catch {}
    }
  }

  return { found: false, bunPath: null, version: null, installDir: null, source: "not-found" };
}

async function getBunVersion(bunPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`"${bunPath}" --version`, { timeout: 5000 });
    return stdout.trim().replace(/^bun /, "");
  } catch {
    return null;
  }
}

/**
 * Ensures Bun is available. If missing, attempts a safe, controlled installation
 * using the official bun.sh installer (runs inside the MCP process only).
 */
export async function ensureBunInstalled(options: { timeoutMs?: number } = {}): Promise<{
  success: boolean;
  info: BunInfo;
  message: string;
  installedNow: boolean;
}> {
  const timeoutMs = options.timeoutMs ?? 180000;

  let info = await getBunInfo();
  if (info.found && info.bunPath) {
    return {
      success: true,
      info,
      message: `Bun ${info.version} already available at ${info.bunPath}`,
      installedNow: false,
    };
  }

  // Perform controlled install
  const home = os.homedir();
  const targetInstall = path.join(home, ".bun");
  const cmd = `curl -fsSL https://bun.sh/install | BUN_INSTALL="${targetInstall}" bash`;

  console.error(`[grok-terminal-mcp][bun] Starting controlled Bun bootstrap (this may take 30-90s)...`);

  try {
    const result = await execAsync(cmd, {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, BUN_INSTALL: targetInstall },
    });

    // Re-detect after install
    info = await getBunInfo();

    if (info.found && info.bunPath) {
      console.error(`[grok-terminal-mcp][bun] Bun installed successfully: ${info.bunPath} (${info.version})`);
      return {
        success: true,
        info,
        message: `Bun ${info.version} installed to ${targetInstall}. Path: ${info.bunPath}`,
        installedNow: true,
      };
    }

    // Partial success? Check common post-install location anyway
    const postInstall = path.join(targetInstall, "bin", "bun");
    if (fs.existsSync(postInstall)) {
      const ver = await getBunVersion(postInstall);
      return {
        success: true,
        info: { found: true, bunPath: postInstall, version: ver, installDir: targetInstall, source: "standard" },
        message: `Bun installed (post-install detection). You may need to add ${targetInstall}/bin to PATH in your shell.`,
        installedNow: true,
      };
    }

    return {
      success: false,
      info,
      message: `Install script ran but Bun not detected. Output: ${result.stdout?.slice(-500) || ""} ${result.stderr?.slice(-500) || ""}. Try manual install: curl -fsSL https://bun.sh/install | bash`,
      installedNow: false,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[grok-terminal-mcp][bun] Bootstrap failed: ${msg}`);
    return {
      success: false,
      info,
      message: `Failed to install Bun: ${msg}. Common fixes: ensure 'curl' and 'bash' are available, or install Bun manually from https://bun.sh`,
      installedNow: false,
    };
  }
}

/**
 * Returns a ready-to-use command prefix for running bun (full path if known, else "bun").
 * Use this for constructing reliable commands in other tools.
 */
export async function getBunCommand(): Promise<string> {
  const info = await getBunInfo();
  if (info.bunPath) {
    // Quote for safety in case of spaces
    return `"${info.bunPath}"`;
  }
  return "bun";
}
