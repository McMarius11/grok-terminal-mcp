# Using grok-terminal-mcp in Other Projects

This document explains how to use `grok-terminal-mcp` as a standalone tool in any project.

## Quick Setup

1. Copy the entire `grok-terminal-mcp` folder into your project (recommended: `tools/grok-terminal-mcp`).

2. Create a `.grok-terminal.json` in your project root.

   You can start with the example:
   ```bash
   cp tools/grok-terminal-mcp/.grok-terminal.example.json .grok-terminal.json
   ```

3. Edit `.grok-terminal.json` to fit your project (especially `allowedCommands` and `projectShortcuts`).

4. Add the server to your Grok configuration (`~/.grok/config.toml`):

   **Using the built version (recommended):**
   ```toml
   [mcp_servers.grok-terminal]
   command = "node"
   args = ["/absolute/path/to/your-project/tools/grok-terminal-mcp/dist/server.js"]
   ```

   **During development (using tsx):**
   ```toml
   [mcp_servers.grok-terminal]
   command = "npx"
   args = ["tsx", "/absolute/path/to/your-project/tools/grok-terminal-mcp/src/server.ts"]
   ```

   You can also pass CLI flags (see README for details):
   ```toml
   args = ["node", "/path/to/dist/server.js", "--debug", "--root", "/path/to/your/project"]
   ```

## Recommended Settings by Project Type

### Typical Node.js / TypeScript Project
- Include at minimum: `npm`, `node`, `npx`, `bash`, `git`
- Useful shortcuts: `build`, `dev`, `test`, `lint`, `typecheck`

### Python Project
- Add: `python`, `python3`, `pip`, `poetry`, `uv`, `make`
- Useful shortcuts: `test`, `lint`, `format`, `install`

### Monorepo or Complex Projects
- Be more generous with `allowedCommands`
- Use `blockedPatterns` to aggressively block dangerous operations
- Define many project-specific shortcuts

## Tips

- Use the `get_config` tool inside your AI to see exactly what is currently allowed.
- Use `reload_config` after editing `.grok-terminal.json` — no need to restart the MCP server.
- All executed commands are logged on the MCP server side (stderr). This is very useful for auditing and debugging.
- The security model is intentionally pragmatic: it trusts the local developer but gives clear visibility and control.

## Future

Once published to npm, standalone usage will become significantly simpler (just `npx grok-terminal-mcp` or a one-line config entry).