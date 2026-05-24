# Changelog

All notable changes to grok-terminal-mcp will be documented in this file.

## [0.2.0] - 2026-05-24

### Added
- Full configuration system with `.grok-terminal.json` support
- Project shortcuts (e.g. `build`, `check:fast`, `verify:all`)
- `get_config` tool to inspect current settings
- `reload_config` tool (reload without restarting the MCP)
- Much better command logging (shows resolved shortcuts)
- Real `.grok-terminal.json` in PanOS-Analyzer project root with good defaults
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

Initial version extracted from development work on the PanOS-Analyzer project.
