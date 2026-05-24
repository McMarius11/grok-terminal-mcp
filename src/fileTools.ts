/**
 * Structured File Operations for grok-terminal-mcp
 *
 * This module provides higher-level, structured file tools that complement
 * the shell-based capabilities of the MCP.
 *
 * Parts of the edit logic (especially applyEdits + unified diff generation)
 * are inspired by the official Model Context Protocol Filesystem Server:
 * https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem
 *
 * License note: The original implementation is MIT licensed.
 * This is an independent re-implementation/adaptation for integration into
 * grok-terminal-mcp.
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