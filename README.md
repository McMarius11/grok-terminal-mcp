# grok-terminal-mcp

A production-quality terminal and filesystem MCP server built with the official `@modelcontextprotocol/sdk`.

It works with any project and aims to combine reliable terminal execution with useful structured file operations, so you don't always need multiple separate MCP servers.

Key strengths:
- Good support for long-running processes and background tasks
- Practical structured file tools (including `edit_file` with dry-run preview)
- Built-in HTTP client
- Project-specific shortcuts
- Configurable security model

## Why This Exists

Many terminal-focused MCP servers have recurring issues:
- Unstable connections
- Weak support for long-running processes
- Limited or no structured file operations

`grok-terminal-mcp` was created with these priorities:
- Use the official MCP SDK for better reliability
- Offer a pragmatic, configurable security model
- Provide solid support for background processes and watches
- Include practical structured file tools alongside terminal capabilities
- Support simple project-specific shortcuts

## Comparison with other MCPs

The table below gives a rough overview (ratings are subjective):

| MCP                            | Terminal | Filesystem Tools | HTTP Client | Long-running Processes | Notes |
|--------------------------------|----------|------------------|-------------|------------------------|-------|
| grok-terminal-mcp              | Good     | Good             | Yes         | Good                   | Combines terminal + filesystem + HTTP |
| desktop-commander              | Good     | Good             | No          | Good                   | Popular, occasional stability issues |
| mcp-server-terminal            | Good     | Limited          | No          | Limited                | Known for connection problems |
| Official Filesystem MCP        | No       | Good             | No          | No                     | Focused only on filesystem operations |

Many people run grok-terminal-mcp together with (or instead of) the official filesystem MCP.

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

See [STANDALONE.md](./STANDALONE.md), [QUICKSTART.md](./QUICKSTART.md), and [MIGRATION.md](./MIGRATION.md) for detailed instructions and migration help from other MCPs.

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
| **Structured file tools** | |
| `read_text_file`        | Read file content (with head/tail)                                       |
| `read_multiple_files`   | Read many files in parallel                                              |
| `write_file`            | Write/overwrite a file                                                   |
| `edit_file`             | Best-in-class multi-edit with `dryRun` unified diff preview              |
| `read_json` / `write_json` | Convenient JSON file handling                                         |
| `search_files`          | Recursive content search                                                 |
| `find_files`            | Glob-based filename/directory search                                     |
| `list_directory`        | Clean directory listing (optional sizes)                                 |
| `directory_tree`        | Recursive project tree                                                   |
| `create_directory` / `move_file` / `get_file_info` | Standard FS operations              |
| **HTTP & API**          | |
| `http_request`          | Full-featured HTTP client (any method, JSON, headers, structured response) |
| **Git**                 | |
| `git_status` / `git_diff` / `git_log` / `git_show` / `git_commit` etc. | Practical git workflow tools |
| **Project-specific** (via shortcuts in .grok-terminal.json) | |
| `run_build` / `run_check_fast` / etc. | Whatever you define in your config |
| **Bun + Blockbench dev tools (0.5.0+)** | |
| `ensure_bun` / `get_bun_info` | Bootstrap or inspect Bun (the runtime used by blockbench-mcp-plugin builds) |
| `find_blockbench` / `get_blockbench_plugins_dir` | Discover Blockbench + its plugins folder (Linux/macOS/Windows) |
| `install_blockbench_plugin` | Copy a built `dist/mcp.js` into Blockbench's user plugins dir |
| `build_and_install_blockbench_plugin` | **One-shot**: ensure Bun → build the plugin → install it (the #1 tool for fast iteration) |
| `list_blockbench_plugins` | Verify what is currently installed in Blockbench |

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

Other available tools: `read_text_file` (head/tail), `write_file`, `edit_file` (dryRun), `search_files` (content), `find_files` (glob names), `list_directory`, `directory_tree`, `create_directory`, `move_file`, `get_file_info`.

**Goal**: With these tools grok-terminal-mcp can serve as a full-featured replacement for the official Filesystem MCP in the vast majority of development scenarios (while adding far stronger terminal, git, process, and meta-MCP capabilities).

## General Development Tools

In addition to the core terminal and file tools, `grok-terminal-mcp` includes several helpers that are useful across many kinds of projects:

### Useful Helpers
- Runtime management (`ensure_runtime`, `get_runtime_info`)
- Watching and dev loops (`start_watch`, `start_dev_session`)
- Artifact installation
- General app control (`launch_app`, `is_app_running`, `find_executable`)
- Additional git helpers (`git_commit`, `git_create_branch`, `git_push`)

### Dynamic MCP Connections

You can connect to other MCP servers at runtime (without changing your Grok config every time).

**Relevant tools:**
- `mcp_connect` / `mcp_connect_stdio`
- `mcp_list`, `mcp_disconnect`
- `mcp_list_tools`, `mcp_call`

By default only localhost connections are allowed. You can enable broader access with `"allowRemoteMcpConnections": true` in your `.grok-terminal.json`.

This is useful when you have project-specific MCP servers you want the AI to interact with dynamically.

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
- The structured file tools are now comprehensive (read/write/edit + full navigation: list, tree, create, move, info, find). They were specifically built so grok-terminal-mcp can replace the official Filesystem MCP for most real-world development work.
- Test coverage is decent and growing (especially around file tools + cancellation).
- The file tools currently operate with the same permissions as the Node process (like the previous file tools). For very high-security environments you may still prefer an explicitly allow-listed Filesystem MCP.

The project prioritizes real-world usefulness over theoretical perfection. All known gaps are tracked.

## License

MIT

---

Built to make working with terminals via Grok actually productive.