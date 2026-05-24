// artifactTools.ts
// General-purpose tools for installing/copying built artifacts.
// Designed to be reusable across many projects (plugins, extensions, binaries, etc.).

import fs from "fs";
import path from "path";
import os from "os";

export interface InstallArtifactResult {
  success: boolean;
  targetPath: string;
  message: string;
  filesCopied: string[];
}

export interface InstallArtifactOptions {
  source: string;                    // File or directory to install
  target: string;                    // Destination directory
  name?: string;                     // Optional new name for the artifact
  strategy?: "copy" | "symlink";     // Default: "copy"
}

/**
 * General tool to install a built artifact (file or folder) into a target directory.
 * This is the generalized version of what was previously Blockbench-specific.
 */
export async function installArtifact(options: InstallArtifactOptions): Promise<InstallArtifactResult> {
  const { source, target, name, strategy = "copy" } = options;

  if (!fs.existsSync(source)) {
    return {
      success: false,
      targetPath: "",
      message: `Source not found: ${source}`,
      filesCopied: [],
    };
  }

  // Ensure target directory exists
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const baseName = name || path.basename(source);
  const targetPath = path.join(target, baseName);
  const filesCopied: string[] = [];

  try {
    const stat = fs.statSync(source);

    if (stat.isDirectory()) {
      // Copy entire directory
      copyDirectory(source, targetPath, filesCopied);
    } else {
      // Copy single file
      if (strategy === "symlink") {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        fs.symlinkSync(path.resolve(source), targetPath);
      } else {
        fs.copyFileSync(source, targetPath);
      }
      filesCopied.push(targetPath);
    }

    return {
      success: true,
      targetPath,
      message: `Artifact installed to ${targetPath} (${filesCopied.length} file(s))`,
      filesCopied,
    };
  } catch (err: any) {
    return {
      success: false,
      targetPath,
      message: `Installation failed: ${err.message}`,
      filesCopied,
    };
  }
}

function copyDirectory(src: string, dest: string, filesCopied: string[]) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath, filesCopied);
    } else {
      fs.copyFileSync(srcPath, destPath);
      filesCopied.push(destPath);
    }
  }
}

/**
 * Helper to find common plugin/extension directories for various applications.
 * This is a generalized version of the previous Blockbench-specific finder.
 */
export function findCommonPluginsDir(appHint?: string): string | null {
  const home = os.homedir();

  const commonPaths: Record<string, string[]> = {
    blockbench: [
      path.join(home, ".config", "Blockbench", "plugins"),
      path.join(home, "Library", "Application Support", "Blockbench", "plugins"),
    ],
    vscode: [
      path.join(home, ".vscode", "extensions"),
    ],
    godot: [
      path.join(home, ".godot", "addons"),
      path.join(home, "AppData", "Roaming", "Godot", "addons"),
    ],
  };

  if (appHint && commonPaths[appHint.toLowerCase()]) {
    for (const p of commonPaths[appHint.toLowerCase()]) {
      if (fs.existsSync(p)) return p;
    }
    // Return first candidate even if it doesn't exist yet
    return commonPaths[appHint.toLowerCase()][0];
  }

  // Fallback: return a generic "plugins" idea
  return path.join(home, ".config", "plugins");
}
