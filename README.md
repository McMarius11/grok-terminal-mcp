# grok-terminal-mcp

A clean, production-quality terminal and shell MCP server built with the official `@modelcontextprotocol/sdk`.

It is designed to be reliable, practical, and safe for real development work — with a strong focus on **productivity** through project-specific shortcuts.

## Why This Exists

Most existing terminal MCP servers have one or more of these problems:
- Unreliable stdio handshake with Grok
- Overly restrictive security models that make real work painful
- Extremely bloated (heavily optimized for Claude Desktop / Cursor)
- Weak support for long-running processes and background tasks

`grok-terminal-mcp` was built with a different philosophy:
- Uses the official MCP SDK correctly and reliably
- Pragmatic but explicit security (you stay in full control)
- Excellent support for long-running and background processes
- First-class **project shortcuts** — the feature that gives the biggest real-world productivity boost

It was originally created so an AI agent could work effectively and safely on the [PanOS-Analyzer](https://github.com/McMarius11/PanOS-Analyzer) project.

## Quick Start

### For the PanOS-Analyzer Project

Add this to your `~/.grok/config.toml`:

```toml
[mcp_servers.grok-terminal]
command = "node"
args = ["/absolute/path/to/PanOS-Analyzer-main/tools/grok-terminal-mcp/dist/server.js"]
```

### For Other Projects (Standalone)

1. Copy the `grok-terminal-mcp` folder into your project (recommended: `tools/grok-terminal-mcp`).
2. Create a `.grok-terminal.json` in your project root (start with `.grok-terminal.example.json`).
3. Add an entry in your `~/.grok/config.toml`.

See [STANDALONE.md](./STANDALONE.md) for detailed instructions.

## CLI

```bash
grok-terminal-mcp --help
grok-terminal-mcp --version
grok-terminal-mcp --debug
grok-terminal-mcp --config ./my-config.json
grok-terminal-mcp --root /path/to/project
```

During development:
```bash
npm run dev -- --debug
npm run dev:from-root -- --debug
```

## Available Tools

| Tool                    | Description                                                              |
|-------------------------|--------------------------------------------------------------------------|
| `run_command`           | Execute any allowed command (with shortcut support)                      |
| `start_process`         | Start long-running / background processes                                |
| `list_processes`        | List active background processes                                         |
| `read_process_output`   | Read output from background processes (with offset)                      |
| `kill_process`          | Terminate background processes                                           |
| `get_config`            | Inspect current security config and shortcuts                            |
| `reload_config`         | Reload `.grok-terminal.json` without restarting                          |
| **General helpers (always available)** | |
| `git_status`            | Clean git status for any repository                                      |
| `list_scripts`          | Show all scripts from package.json + auto-detect package manager         |
| `run_script`            | Run package.json scripts (auto npm/yarn/pnpm/bun)                        |
| `project_info`          | Quick project overview (name, version, git, node, package manager...)    |
| **Project-specific** (via shortcuts in .grok-terminal.json) | |
| `run_build` / `run_check_fast` / etc. | Whatever you define in your config |

## Configuration

Everything is controlled via a `.grok-terminal.json` file in your project root.

You can define:
- Allowed and blocked commands
- Custom project shortcuts (highly recommended)

See `.grok-terminal.example.json` for a well-documented example.

You can inspect and reload the configuration at runtime using `get_config` and `reload_config`.

## Security Model

This tool is designed exclusively for **trusted local development** on your own machine.

- Commands run inside a configurable directory (default = project root)
- Explicit allow-list + block-list
- Every executed command is logged (including resolved shortcuts)
- No elevated privileges are used

**Do not** expose this MCP to untrusted users or networks.

Review `allowedCommands` and `blockedPatterns` carefully before sharing configurations.

## Development

```bash
cd tools/grok-terminal-mcp
npm install
npm run dev                    # Fast iteration with tsx
npm run dev -- --debug
npm run dev:from-root          # From project root
npm run dev:analyzer           # Best experience when developing inside PanOS-Analyzer
npm run build
npm test
```

## Migration from Legacy

If you previously used the old pure JavaScript version, see [MIGRATION.md](./MIGRATION.md).

## Contributing & Releases

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [RELEASE.md](./RELEASE.md)
- [CHANGELOG.md](./CHANGELOG.md)

## License

MIT

---

Built to make working with terminals via Grok actually productive.