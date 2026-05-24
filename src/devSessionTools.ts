// devSessionTools.ts
// Higher-level "Smart Dev Session" helpers.
// Goal: Let the AI start a sensible dev loop with one call.

import { startWatch } from "./watchTools.js";
import type { TerminalConfig } from "./config.js";

export async function startDevSession(options: {
  projectDir: string;
  buildCommand: string;
  installCommand?: string;
  config: TerminalConfig;
}) {
  const { projectDir, buildCommand, installCommand, config } = options;

  let finalCommand = buildCommand;

  if (installCommand) {
    finalCommand = `${buildCommand} && ${installCommand}`;
  }

  const watchResult = await startWatch(projectDir, finalCommand, {
    debounceMs: 800,
    ignorePatterns: ["node_modules", ".git", "dist", "build", "*.log"],
    config,
  });

  return {
    success: true,
    sessionId: watchResult.sessionId,
    message: `Dev session started. Watching ${projectDir}. On changes will run: ${finalCommand}`,
    watchId: watchResult.sessionId,
  };
}
