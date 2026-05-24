# Migration Guide

This guide helps you switch from other popular terminal or filesystem MCPs to `grok-terminal-mcp`.

## From desktop-commander

`desktop-commander` is popular but can be unstable with Grok (frequent disconnects, broken pipes).

### What you gain
- Much more stable connection
- Better long-running process support (`start_process` + `read_process_output`)
- Structured `edit_file` with `dryRun` (git-style diff preview)
- Built-in HTTP client (`http_request`)
- More reliable background process handling

### Migration steps

1. Disable or remove the `desktop-commander` entry in your `~/.grok/config.toml`.
2. Add `grok-terminal-mcp` (see [QUICKSTART.md](./QUICKSTART.md)).
3. Copy over any custom allowed commands you had.

Most commands you used with `desktop-commander` (`run_command`, starting processes, etc.) work similarly or better.

---

## From mcp-server-terminal (older versions)

Many people had stability issues with older terminal MCPs (handshake failures, crashes on startup).

`grok-terminal-mcp` was specifically built to solve these problems using the official SDK correctly.

### Migration steps

1. Remove the old `mcp-server-terminal` entry.
2. Add `grok-terminal-mcp`.
3. Create a `.grok-terminal.json` in your project (highly recommended).

You will likely notice significantly better reliability, especially with long-running dev servers.

---

## From the official @modelcontextprotocol/server-filesystem

This is the most common combination people run: one terminal MCP + the official filesystem MCP.

With `grok-terminal-mcp` you can often **drop the official filesystem MCP** entirely.

### Tools that replace the official filesystem MCP

| Official Filesystem Tool       | grok-terminal-mcp equivalent                  | Notes |
|--------------------------------|-----------------------------------------------|-------|
| `read_text_file`               | `read_text_file`                              | Supports head/tail |
| `read_multiple_files`          | `read_multiple_files`                         | Better error handling per file |
| `write_file`                   | `write_file`                                  | Same |
| `edit_file`                    | `edit_file` (with `dryRun`)                   | Usually better (unified diff preview) |
| `list_directory`               | `list_directory`                              | Available |
| `directory_tree`               | `directory_tree`                              | Available |
| `create_directory`             | `create_directory`                            | Available |
| `move_file`                    | `move_file`                                   | Available |
| `get_file_info`                | `get_file_info`                               | Available |
| `search_files` (glob)          | `find_files`                                  | Name/path based search |
| `search_files` (content)       | `search_files`                                | Content search with excludes |

### Recommendation

Try running only `grok-terminal-mcp` for a few days. Most users find they no longer need the separate filesystem MCP.

You can always re-enable it later if you miss something specific.

---

## From multiple MCPs (common setup)

A very common setup is:
- One terminal MCP (desktop-commander or similar)
- Official filesystem MCP
- Sometimes additional ones (e.g. for GitHub, etc.)

### Suggested target setup

**Minimal strong setup:**
- `grok-terminal-mcp` (terminal + filesystem + HTTP + Git helpers)
- Your domain-specific MCPs (e.g. GitHub, Linear, Playwright, etc.)

This usually reduces the total number of MCPs while increasing capability.

---

## Tips for a smooth migration

- Start with a project-specific `.grok-terminal.json` instead of modifying the global config immediately.
- Use `get_config` after starting to verify your allow-list.
- The `edit_file` tool with `dryRun: true` is one of the biggest quality-of-life improvements most people notice.

If you run into any specific friction during migration, feel free to open an issue. Feedback helps improve the tool.

---

**Still missing something after switching?**  
Open an issue or describe your use case — many "missing" features can be added relatively quickly if they are genuinely useful.