// blockbenchTools.ts
// Blockbench discovery, plugin directory resolution, and high-level dev workflow helpers
// (build + install the Blockbench MCP plugin into a running Blockbench instance).

import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { getBunInfo, ensureBunInstalled, getBunCommand } from "./bunTools.js";

const execAsync = promisify(exec);

export interface BlockbenchLocation {
  executable: string | null;
  pluginsDir: string | null;
  userDataDir: string | null;
  detectionMethod: string;
  platform: NodeJS.Platform;
}

const BB_PLUGIN_FILENAMES = ["mcp.js", "blockbench-mcp.js", "mcp-plugin.js"];

function getDefaultPluginsDir(): string {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "linux") {
    // Common for AppImage / native Linux installs
    return path.join(home, ".config", "Blockbench", "plugins");
  }
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Blockbench", "plugins");
  }
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Blockbench", "plugins");
  }
  // Fallback
  return path.join(home, ".config", "Blockbench", "plugins");
}

function getDefaultUserDataDir(): string {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "linux") return path.join(home, ".config", "Blockbench");
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "Blockbench");
  if (platform === "win32") return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Blockbench");
  return path.join(home, ".config", "Blockbench");
}

async function findBlockbenchExecutable(): Promise<string | null> {
  const home = os.homedir();
  const platform = process.platform;

  const candidates: string[] = [];

  if (platform === "linux") {
    candidates.push(
      path.join(home, "Applications", "*Blockbench*.AppImage"),
      path.join(home, ".local", "bin", "*blockbench*"),
      "/opt/Blockbench/Blockbench.AppImage",
      "/usr/local/bin/blockbench",
      path.join(home, "Desktop", "*Blockbench*.AppImage"),
      // Flatpak
      "flatpak",
    );
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Blockbench.app/Contents/MacOS/Blockbench",
      path.join(home, "Applications", "Blockbench.app", "Contents", "MacOS", "Blockbench"),
    );
  } else if (platform === "win32") {
    candidates.push(
      path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Blockbench", "Blockbench.exe"),
      path.join(process.env["LOCALAPPDATA"] || path.join(home, "AppData", "Local"), "Blockbench", "Blockbench.exe"),
    );
  }

  for (let c of candidates) {
    if (c.includes("*")) {
      // Very rough glob via ls (best effort)
      try {
        const dir = path.dirname(c);
        const base = path.basename(c);
        const { stdout } = await execAsync(`ls ${dir}/${base} 2>/dev/null | head -1`, { timeout: 2000 });
        if (stdout.trim()) {
          return stdout.trim();
        }
      } catch {}
    } else if (fs.existsSync(c)) {
      return c;
    }
  }

  // Try "blockbench" in PATH as last resort
  try {
    const { stdout } = await execAsync("command -v blockbench || which blockbench 2>/dev/null || echo ''", { timeout: 2000 });
    const p = stdout.trim();
    if (p) return p;
  } catch {}

  return null;
}

/**
 * Best-effort discovery of Blockbench installation and its plugins directory.
 * Respects overrides if passed.
 */
export async function findBlockbench(overridePluginsDir?: string): Promise<BlockbenchLocation> {
  const executable = await findBlockbenchExecutable();
  const userData = getDefaultUserDataDir();
  let pluginsDir = overridePluginsDir || getDefaultPluginsDir();

  // If the default plugins dir doesn't exist yet, still return it (user can create)
  const detectionMethod = executable ? "executable + standard paths" : "standard paths only (Blockbench may not be installed or not in common locations)";

  return {
    executable,
    pluginsDir: pluginsDir,
    userDataDir: userData,
    detectionMethod,
    platform: process.platform,
  };
}

export async function getBlockbenchPluginsDir(override?: string): Promise<{ pluginsDir: string; created: boolean; note: string }> {
  const loc = await findBlockbench(override);
  let dir = loc.pluginsDir!;
  let created = false;

  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      created = true;
    } catch (e: any) {
      // Will be reported by caller
    }
  }

  return {
    pluginsDir: dir,
    created,
    note: created ? "Directory was created" : fs.existsSync(dir) ? "Existing directory" : "Could not create directory",
  };
}

/**
 * Installs a built Blockbench plugin (the mcp.js bundle + optional assets) into the plugins directory.
 * Typically you point source at the dist/mcp.js produced by `bun run build` in the blockbench-mcp repo.
 */
export async function installBlockbenchPlugin(params: {
  source: string;                    // path to mcp.js OR to a dist/ folder containing mcp.js
  targetDir?: string;                // defaults to auto-detected Blockbench plugins dir
  pluginFilename?: string;           // defaults to "mcp.js"
}): Promise<{ success: boolean; targetPath: string; message: string; filesCopied: string[] }> {
  const { source, targetDir: override, pluginFilename = "mcp.js" } = params;

  if (!fs.existsSync(source)) {
    return { success: false, targetPath: "", message: `Source not found: ${source}`, filesCopied: [] };
  }

  const { pluginsDir } = await getBlockbenchPluginsDir(override);

  // Resolve actual source file
  let sourceFile = source;
  if (fs.statSync(source).isDirectory()) {
    const candidate = path.join(source, "mcp.js");
    if (fs.existsSync(candidate)) sourceFile = candidate;
    else {
      return { success: false, targetPath: "", message: `No mcp.js found in directory ${source}`, filesCopied: [] };
    }
  }

  const targetPath = path.join(pluginsDir, pluginFilename);
  const filesCopied: string[] = [];

  try {
    fs.copyFileSync(sourceFile, targetPath);
    filesCopied.push(targetPath);

    // Also try to copy icon and about.md if they sit next to the source mcp.js (nice for UI)
    const srcDir = path.dirname(sourceFile);
    const extras = [
      { from: path.join(srcDir, "icon.svg"), to: path.join(pluginsDir, "icon.svg") },
      { from: path.join(srcDir, "about.md"), to: path.join(pluginsDir, "about.md") },
    ];
    for (const ex of extras) {
      if (fs.existsSync(ex.from)) {
        fs.copyFileSync(ex.from, ex.to);
        filesCopied.push(ex.to);
      }
    }

    return {
      success: true,
      targetPath,
      message: `Installed plugin to ${targetPath}. ${filesCopied.length} file(s) copied. Restart Blockbench or use its "Reload plugins" action (or the inner install_plugin_from_path tool if the MCP plugin is already running).`,
      filesCopied,
    };
  } catch (err: any) {
    return { success: false, targetPath, message: `Copy failed: ${err.message}`, filesCopied };
  }
}

/**
 * High-level helper: builds the Blockbench MCP plugin (using Bun) and immediately installs it.
 * This is the one-shot command an AI agent wants after editing source.
 */
export async function buildAndInstallBlockbenchPlugin(params: {
  projectDir?: string;               // directory containing the blockbench-mcp package.json + build/ + index.ts
  targetPluginsDir?: string;
  pluginFilename?: string;
}): Promise<{
  success: boolean;
  buildOutput: string;
  installResult: any;
  bunUsed: string | null;
  message: string;
}> {
  const projectDir = params.projectDir || process.cwd();

  // Basic sanity
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { success: false, buildOutput: "", installResult: null, bunUsed: null, message: `No package.json in ${projectDir}. Pass explicit projectDir pointing at your blockbench-mcp-plugin checkout.` };
  }

  let pkg: any;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")); } catch {}
  if (!pkg || !pkg.name || !pkg.name.includes("blockbench")) {
    // Still allow, user might know what they're doing
  }

  // Ensure Bun
  const bunEnsure = await ensureBunInstalled({ timeoutMs: 180000 });
  if (!bunEnsure.success || !bunEnsure.info.bunPath) {
    return {
      success: false,
      buildOutput: "",
      installResult: null,
      bunUsed: null,
      message: `Bun is required for the build. ${bunEnsure.message}`,
    };
  }

  const bunCmd = await getBunCommand();

  // Run the project's build
  const buildCmd = `${bunCmd} run build`;
  let buildOutput = "";
  try {
    console.error(`[grok-terminal-mcp][blockbench] Building plugin in ${projectDir} using ${bunCmd}...`);
    const res = await execAsync(buildCmd, {
      cwd: projectDir,
      timeout: 300000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PATH: `${path.dirname(bunEnsure.info.bunPath!)}:${process.env.PATH}` },
    });
    buildOutput = (res.stdout || "") + (res.stderr || "");
  } catch (err: any) {
    buildOutput = (err.stdout || "") + (err.stderr || err.message || "");
    return {
      success: false,
      buildOutput,
      installResult: null,
      bunUsed: bunEnsure.info.bunPath,
      message: `Build failed. See output. First 2000 chars:\n${buildOutput.slice(0, 2000)}`,
    };
  }

  // Locate the produced artifact
  const distDir = path.join(projectDir, "dist");
  const candidateJs = path.join(distDir, "mcp.js");
  if (!fs.existsSync(candidateJs)) {
    return {
      success: false,
      buildOutput,
      installResult: null,
      bunUsed: bunEnsure.info.bunPath,
      message: `Build appeared to succeed but no dist/mcp.js found. Build log tail:\n${buildOutput.slice(-1500)}`,
    };
  }

  // Install
  const installResult = await installBlockbenchPlugin({
    source: candidateJs,
    targetDir: params.targetPluginsDir,
    pluginFilename: params.pluginFilename,
  });

  const overallSuccess = installResult.success;

  return {
    success: overallSuccess,
    buildOutput,
    installResult,
    bunUsed: bunEnsure.info.bunPath,
    message: overallSuccess
      ? `Build + install completed successfully using Bun at ${bunEnsure.info.bunPath}. ${installResult.message}`
      : `Build succeeded but install step failed: ${installResult.message}`,
  };
}

/**
 * Lists .js files in the Blockbench plugins directory (helps verify installation).
 */
export async function listBlockbenchPlugins(targetDir?: string): Promise<{ pluginsDir: string; plugins: Array<{ name: string; size: number; mtime: string; isMcp?: boolean }> }> {
  const { pluginsDir } = await getBlockbenchPluginsDir(targetDir);
  if (!fs.existsSync(pluginsDir)) {
    return { pluginsDir, plugins: [] };
  }

  const entries = fs.readdirSync(pluginsDir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".mjs"))
    .map((name) => {
      const full = path.join(pluginsDir, name);
      const stat = fs.statSync(full);
      const isMcp = BB_PLUGIN_FILENAMES.includes(name) || name.toLowerCase().includes("mcp");
      return {
        name,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isMcp,
      };
    });

  return { pluginsDir, plugins: entries };
}
