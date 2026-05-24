# Changelog

All notable changes to grok-terminal-mcp will be documented in this file.

## [0.5.0] - 2026-05-25

### Added — Bun + Blockbench MCP Plugin Development Superpowers
The primary motivation for this release: give the AI (Grok + any MCP client) **complete autonomy** to develop, build, and install the companion [blockbench-mcp-plugin](https://github.com/McMarius11/blockbench-mcp-plugin) without manual intervention, even when Bun is not pre-installed on the machine.

- **Bun management** (new dedicated module):
  - `ensure_bun` — checks all standard locations + `BUN_INSTALL`; if missing, runs the *official* `bun.sh` installer in a fully controlled way (inside the MCP process, never exposed as raw user command). Respects timeouts.
  - `get_bun_info` — reports exact binary path, version, and detection source.
  - `getBunCommand()` helper used internally by other tools so `bun run ...` always works reliably.
- **Blockbench discovery & installation tools**:
  - `find_blockbench` — locates the Blockbench executable (AppImage, flatpak, native, macOS/Windows paths) and the canonical user plugins directory cross-platform.
  - `get_blockbench_plugins_dir` — returns (and auto-creates) the plugins folder.
  - `install_blockbench_plugin` — robust copy of `dist/mcp.js` (+ icon/about.md) into the plugins dir.
  - `build_and_install_blockbench_plugin` — **the killer one-shot**: ensures Bun → `bun run build` in your blockbench-mcp checkout → automatic install of the fresh artifact. Perfect after any source edit.
  - `list_blockbench_plugins` — quick verification of what landed in the plugins folder.
- Updated `detectPackageManager` to recognize the modern `bun.lock` (in addition to the legacy `bun.lockb`).
- Expanded default + example `allowedCommands` with `bun`, `curl`, `unzip`, `cp`, `mv`, `chmod` (safe for the new controlled workflows).
- Added ready-to-use projectShortcuts in the example config: `bb:build`, `bb:dev`, `bb:dev:watch`.
- Full documentation updates (README + this changelog).

These tools complement the domain-specific `blockbench-mcp-plugin` (silent ops, hot-reload via `install_plugin_from_path`, mesh/UV/workflow tools). Use both MCP servers together for maximum agentic power.

### Changed
- Version bumped to 0.5.0.
- Minor hardening of allowed commands for real-world dev (still fully user-configurable via `.grok-terminal.json`).

## [0.4.0] - 2026-05-24

### Added
- **General-purpose helpers** (work in any project, no config required):
  - `git_status`
  - `git_diff`
  - `list_scripts`
  - `run_script` (auto-detects npm/yarn/pnpm/bun)
  - `deps_outdated`
  - `project_info`
- **Structured file tools** (inspired by the official Filesystem MCP, to reduce need for separate MCPs):
  - `read_text_file` (with head/tail support)
  - `write_file`
  - `edit_file` (with `dryRun` + unified diff preview)
  - `search_files`
- Centralized `registerTool` helper for cleaner tool registration (reduces scattered `as any` casts)
- Improved tool call cancellation support (signal forwarding across most tools, including new file tools)
- Real working `reload_config` implementation
- `cancelled` flag in responses
- `.grok-terminal.example.json` for easy onboarding
- Significantly improved test coverage (now 29 tests, including file tools + cancellation)

### Changed
- Better output truncation with head+tail + clear `truncated` + `totalBytes` information
- Much improved error messages and tips
- Tool is positioned as a general-purpose terminal MCP (not tied to any specific project)

## [0.2.0] - 2026-05-24

### Added
- Full configuration system with `.grok-terminal.json` support
- Project shortcuts (e.g. `build`, `check:fast`, `verify:all`)
- `get_config` tool to inspect current settings
- `reload_config` tool (reload without restarting the MCP)
- Much better command logging (shows resolved shortcuts)
- Real `.grok-terminal.json` support with good defaults for any project
- Example config file (`.grok-terminal.example.json`)

### Changed
- Security model is now properly config-driven instead of overly permissive
- Improved documentation for both project use and standalone usage
- Stricter default allowed commands for better out-of-the-box security

### Fixed
- Better error messages when commands are blocked

## [0.1.0] - 2026-05-24

### Added
- Initial release
- Core tools: `run_command`, `start_process`, `list_processes`, `read_process_output`, `kill_process`
- Stable stdio MCP handshake optimized for Grok
- Basic directory jail + simple command filtering
- Background/long-running process support with output pagination
- `test-handshake.js` for debugging
- First documentation and Quickstart guide

Initial public standalone release.
