// appTools.ts
// General-purpose tools for launching and managing desktop / GUI applications.
// Designed to be reusable for any app (Blockbench, VSCode, Godot, Electron apps, etc.).

import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";

export interface AppInfo {
  name: string;
  executable: string | null;
  found: boolean;
  type: "AppImage" | "binary" | "flatpak" | "not-found";
}

const COMMON_LOCATIONS = [
  path.join(os.homedir(), "Applications"),
  path.join(os.homedir(), ".local", "bin"),
  "/opt",
  "/usr/local/bin",
  path.join(os.homedir(), "Desktop"),
];

/**
 * Tries to find an executable or AppImage by name hint.
 * General purpose – works for Blockbench, Godot, etc.
 */
export async function findExecutable(hint: string): Promise<AppInfo> {
  const lowerHint = hint.toLowerCase();

  // Check common locations
  for (const base of COMMON_LOCATIONS) {
    if (!fs.existsSync(base)) continue;

    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(base, entry.name);

        if (entry.isFile() && fullPath.toLowerCase().includes(lowerHint)) {
          if (fullPath.endsWith(".AppImage") || fullPath.includes(hint)) {
            return {
              name: entry.name,
              executable: fullPath,
              found: true,
              type: fullPath.endsWith(".AppImage") ? "AppImage" : "binary",
            };
          }
        }

        if (entry.isDirectory() && fullPath.toLowerCase().includes(lowerHint)) {
          // Check inside folder for binaries
          const inner = path.join(fullPath, hint);
          if (fs.existsSync(inner)) {
            return {
              name: hint,
              executable: inner,
              found: true,
              type: "binary",
            };
          }
        }
      }
    } catch {}
  }

  // Try PATH
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = spawn("which", [hint], { stdio: ["ignore", "pipe", "ignore"] });
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.on("close", (code) => {
        if (code === 0) resolve({ stdout: output.trim() });
        else reject(new Error("not found"));
      });
    });

    if (stdout) {
      return {
        name: hint,
        executable: stdout,
        found: true,
        type: "binary",
      };
    }
  } catch {}

  // Flatpak fallback
  if (hint.toLowerCase().includes("blockbench") || hint.toLowerCase().includes("godot")) {
    return {
      name: hint,
      executable: `flatpak run ${hint}`,
      found: false,
      type: "flatpak",
    };
  }

  return {
    name: hint,
    executable: null,
    found: false,
    type: "not-found",
  };
}

/**
 * Launches an application (especially good for AppImages and GUI apps).
 * Returns immediately (detached).
 */
export function launchApp(executable: string, args: string[] = []): { success: boolean; message: string; pid?: number } {
  try {
    const isAppImage = executable.endsWith(".AppImage");
    const isFlatpak = executable.startsWith("flatpak run");

    let command: string;
    let finalArgs: string[];

    if (isFlatpak) {
      const parts = executable.split(" ");
      command = parts[0];
      finalArgs = [...parts.slice(1), ...args];
    } else {
      command = executable;
      finalArgs = args;
    }

    const child = spawn(command, finalArgs, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });

    child.unref();

    return {
      success: true,
      message: `Launched ${executable}`,
      pid: child.pid,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to launch ${executable}: ${err.message}`,
    };
  }
}

/**
 * Checks if an application is likely running by name.
 * Uses pgrep / tasklist depending on platform.
 */
export async function isAppRunning(name: string): Promise<{ running: boolean; matches: string[] }> {
  const lower = name.toLowerCase();

  try {
    if (process.platform === "win32") {
      const { stdout } = await new Promise<{ stdout: string }>((res, rej) => {
        const child = spawn("tasklist", [], { stdio: ["ignore", "pipe", "ignore"] });
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.on("close", () => res({ stdout: out }));
      });
      const matches = stdout
        .split("\n")
        .filter((line) => line.toLowerCase().includes(lower))
        .map((l) => l.trim());
      return { running: matches.length > 0, matches };
    } else {
      const { stdout } = await new Promise<{ stdout: string }>((res, rej) => {
        const child = spawn("pgrep", ["-a", "-i", name], { stdio: ["ignore", "pipe", "ignore"] });
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.on("close", () => res({ stdout: out }));
      });
      const matches = stdout
        .split("\n")
        .filter((line) => line.length > 0);
      return { running: matches.length > 0, matches };
    }
  } catch {
    return { running: false, matches: [] };
  }
}
