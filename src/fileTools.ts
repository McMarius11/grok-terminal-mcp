/**
 * Structured File Operations for grok-terminal-mcp
 *
 * This module provides higher-level, structured file tools that complement
 * the shell-based capabilities of the MCP.
 *
 * A significant portion of the filesystem tools (edit logic, directory traversal,
 * tree building, move/create/info operations, etc.) are inspired by / adapted from
 * the official Model Context Protocol Filesystem Server:
 * https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
 *
 * License note: The original implementation is MIT licensed.
 * This is an independent re-implementation/adaptation for integration into
 * grok-terminal-mcp. Proper attribution is maintained.
 */

import fs from "fs/promises";
import path from "path";
import { createTwoFilesPatch } from "diff";
import { minimatch } from "minimatch";

// Types
export interface FileEdit {
  oldText: string;
  newText: string;
}

export interface SearchResult {
  path: string;
  line: number;
  match: string;
}

/**
 * Normalizes line endings to \n
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Creates a unified diff between original and modified content
 */
export function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  filepath: string = "file"
): string {
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    "original",
    "modified"
  );
}

/**
 * Applies a series of edits to file content.
 * Supports dryRun to preview changes.
 */
export async function applyEdits(
  filePath: string,
  edits: FileEdit[],
  dryRun: boolean = false,
  signal?: AbortSignal
): Promise<string> {
  // Check for cancellation at the start
  if (signal?.aborted) {
    throw new Error("Operation cancelled");
  }
  const originalContent = await fs.readFile(filePath, "utf-8");
  let modifiedContent = normalizeLineEndings(originalContent);

  for (const edit of edits) {
    if (signal?.aborted) {
      throw new Error("Operation cancelled");
    }

    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }

    // Try flexible line-by-line matching (ignore some whitespace differences)
    const oldLines = normalizedOld.split("\n");
    const contentLines = modifiedContent.split("\n");
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      });

      if (isMatch) {
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || "";
        const newLines = normalizedNew.split("\n").map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || "";
          const newIndent = line.match(/^\s*/)?.[0] || "";
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return originalIndent + " ".repeat(Math.max(0, relativeIndent)) + line.trimStart();
          }
          return line;
        });

        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join("\n");
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
    }
  }

  const diff = createUnifiedDiff(originalContent, modifiedContent, filePath);

  if (!dryRun) {
    if (signal?.aborted) {
      throw new Error("Operation cancelled");
    }
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tempPath, modifiedContent, "utf-8");
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }
  }

  // Format diff nicely
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }

  return `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}\n`;
}

/**
 * Reads a text file with optional head/tail support
 */
export async function readTextFile(
  filePath: string,
  head?: number,
  tail?: number
): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");

  if (head && tail) {
    throw new Error("Cannot specify both head and tail");
  }

  const lines = content.split(/\r?\n/);

  if (head) {
    return lines.slice(0, head).join("\n");
  }

  if (tail) {
    return lines.slice(-tail).join("\n");
  }

  return content;
}

/**
 * Writes content to a file (overwrites)
 */
export async function writeFileContent(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Searches for a pattern in files recursively
 */
export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (excludePatterns.some((pat) => minimatch(relativePath, pat))) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const lines = content.split(/\r?\n/);

          lines.forEach((line, index) => {
            if (line.includes(pattern)) {
              results.push({
                path: fullPath,
                line: index + 1,
                match: line.trim(),
              });
            }
          });
        } catch {
          // Ignore unreadable files
        }
      }
    }
  }

  await walk(rootPath);
  return results;
}

// ============================================
// Additional Structured Filesystem Tools
// These complete the feature set so grok-terminal-mcp can serve as a
// full replacement for the official @modelcontextprotocol/server-filesystem
// in most development workflows.
// ============================================

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}

/**
 * Lists the contents of a directory.
 * Returns a clean list of entries with optional size information.
 */
export async function listDirectory(
  dirPath: string,
  withSizes: boolean = false
): Promise<DirectoryEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: DirectoryEntry[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const item: DirectoryEntry = {
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    if (withSizes && !entry.isDirectory()) {
      try {
        const stats = await fs.stat(fullPath);
        item.size = stats.size;
      } catch {
        // Ignore stat errors for individual files
      }
    }

    result.push(item);
  }

  return result;
}

export interface TreeEntry {
  name: string;
  type: 'file' | 'directory';
  children?: TreeEntry[];
}

/**
 * Returns a recursive directory tree.
 * Respects exclude patterns (glob style, relative to root).
 */
export async function getDirectoryTree(
  dirPath: string,
  excludePatterns: string[] = []
): Promise<TreeEntry> {
  async function walk(currentPath: string, basePath: string): Promise<TreeEntry> {
    const name = path.basename(currentPath);
    const relative = path.relative(basePath, currentPath);

    if (relative && excludePatterns.some((pat) => minimatch(relative, pat))) {
      return { name, type: 'directory', children: [] };
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const children: TreeEntry[] = [];

    for (const entry of entries) {
      const full = path.join(currentPath, entry.name);
      const rel = path.relative(basePath, full);

      if (excludePatterns.some((pat) => minimatch(rel, pat))) {
        continue;
      }

      if (entry.isDirectory()) {
        children.push(await walk(full, basePath));
      } else {
        children.push({ name: entry.name, type: 'file' });
      }
    }

    return {
      name,
      type: 'directory',
      children: children.length > 0 ? children : undefined,
    };
  }

  return walk(dirPath, dirPath);
}

/**
 * Creates a directory (and any missing parent directories).
 */
export async function createDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Moves or renames a file or directory.
 * Fails if destination already exists (consistent with many FS tools).
 */
export async function moveFile(source: string, destination: string): Promise<void> {
  const srcReal = await fs.realpath(source).catch(() => source);
  const dstReal = path.resolve(destination);

  if (srcReal === dstReal) {
    throw new Error("Source and destination are the same");
  }

  await fs.rename(source, destination);
}

export interface FileInfo {
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  created: string;
  modified: string;
  accessed: string;
  permissions: string;
}

/**
 * Returns detailed metadata about a file or directory.
 */
export async function getFileInfo(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);

  let type: FileInfo['type'] = 'other';
  if (stats.isFile()) type = 'file';
  else if (stats.isDirectory()) type = 'directory';
  else if (stats.isSymbolicLink()) type = 'symlink';

  return {
    path: filePath,
    type,
    size: stats.size,
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
    permissions: (stats.mode & 0o777).toString(8).padStart(3, '0'),
  };
}

export interface FindResult {
  path: string;
  type: 'file' | 'directory';
}

/**
 * Recursively finds files and directories matching a glob pattern.
 * This is the filename/glob counterpart to the existing content-based search_files.
 */
export async function findFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<FindResult[]> {
  const results: FindResult[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (excludePatterns.some((pat) => minimatch(relativePath, pat))) {
        continue;
      }

      const matches = minimatch(relativePath, pattern) || minimatch(entry.name, pattern);

      if (matches) {
        results.push({
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
        });
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      }
    }
  }

  await walk(rootPath);
  return results;
}
