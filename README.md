# grok-terminal-mcp

A clean, production-quality terminal and shell MCP server built with the official `@modelcontextprotocol/sdk`.

Works great with **any project** — not just one specific one.

It is designed to be reliable, practical, and safe for real development work, with:
- Strong support for long-running processes
- Useful built-in general helpers + structured file tools (`edit_file` with diff preview, `search_files`, etc.)
- Project-specific shortcuts via simple config

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

It was originally created to give an AI agent reliable terminal control, but is designed as a general-purpose tool that works with any software project.

## Quick Start

### Standalone Use (Recommended for most people)

1. Clone or copy the `grok-terminal-mcp` folder into your project (e.g. into `tools/grok-terminal-mcp`).
2. Create a `.grok-terminal.json` in your project root (start with the `.grok-terminal.example.json`).
3. Add it to your `~/.grok/config.toml` (or equivalent MCP client config).

Example entry:

```toml
[mcp_servers.grok-terminal]
command = "node"
args = ["/absolute/path/to/your/project/tools/grok-terminal-mcp/dist/server.js"]
```

See [STANDALONE.md](./STANDALONE.md) and [QUICKSTART.md](./QUICKSTART.md) for detailed instructions.

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
| `git_diff`              | Show unstaged (or staged) git diff                                       |
| `list_scripts`          | Show all scripts from package.json + auto-detect package manager         |
| `run_script`            | Run package.json scripts (auto npm/yarn/pnpm/bun)                        |
| `deps_outdated`         | Show outdated dependencies using the project's package manager           |
| `project_info`          | Quick project overview (name, version, git, node, package manager...)    |
| **Structured file tools** (inspired by official Filesystem MCP) | |
| `read_text_file`        | Read file content with optional head/tail                                |
| `write_file`            | Write/overwrite a file                                                   |
| `edit_file`             | Precise multi-edit with `dryRun` diff preview (recommended for edits)    |
| `search_files`          | Recursive content search with exclude patterns                           |
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

## Structured File Tools

In addition to raw shell access, the MCP provides a small set of higher-level file tools (inspired by the official Filesystem MCP). These are especially useful for precise edits without shell gymnastics.

### Recommended: `edit_file` + `dryRun`

Instead of using `run_command` with `sed` or similar, use the structured editor:

```json
{
  "path": "src/foo.ts",
  "edits": [
    {
      "oldText": "const foo = 42;",
      "newText": "const foo = 43;"
    }
  ],
  "dryRun": true
}
```

When `dryRun: true`, it returns a clean unified diff so you (or the agent) can review before applying.

This is currently the cleanest way to make safe, reviewable source changes.

Other available tools: `read_text_file` (with head/tail), `write_file`, `search_files`.

## Development

```bash
cd tools/grok-terminal-mcp
npm install
npm run dev                    # Fast iteration with tsx
npm run dev -- --debug
npm run build
npm test
```

## Contributing & Releases

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [RELEASE.md](./RELEASE.md)
- [CHANGELOG.md](./CHANGELOG.md)

## Known Limitations

- Cancellation works well for most commands but can be less reliable with very complex or long-running shell constructs.
- The new structured file tools (`edit_file`, `search_files`, etc.) are powerful and the recommended way for precise file work, but they are newer than the core terminal functionality.
- Test coverage is decent (29+ tests) but still being expanded, especially around the file tools and edge-case cancellation.
- The tool is intentionally pragmatic. It will not be as "bulletproof" or feature-complete as a dedicated Filesystem MCP for every possible file operation.

The project prioritizes real-world usefulness over theoretical perfection. All known gaps are tracked.

## License

MIT

---

Built to make working with terminals via Grok actually productive.