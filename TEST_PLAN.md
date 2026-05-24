# Test Plan – grok-terminal-mcp

This document defines what needs to be tested to turn `grok-terminal-mcp` into a reliable, trustworthy, and GitHub-ready tool.

## Current State (as of May 2026)

- Basic unit tests exist for:
  - `config.ts` (loading, merging, shortcut resolution)
  - `executor.ts` (basic execution + blocking)
  - `processManager.ts` (start, list, read, kill)
- No integration tests for the actual MCP server
- No CLI tests
- No end-to-end tests from an MCP client perspective
- Test coverage is still low on security-critical paths

## Goals

1. Reach a level of confidence where we can publish the tool without embarrassment.
2. Protect the core security guarantees (nothing dangerous can be executed by default).
3. Make the tool robust enough that long-running processes and error cases are handled gracefully.
4. Enable safe future development (regression protection).

## Priority Levels

| Priority | Meaning | Target Audience |
|---------|---------|-----------------|
| **P0**  | Must have before any public release | Security + core reliability |
| **P1**  | Should have for a professional tool | Good developer experience + robustness |
| **P2**  | Nice to have | Long-term quality and maintainability |

---

## P0 – Critical (Before Public Release)

These tests are non-negotiable for a public version.

### 1. Security & Command Filtering (Highest Priority)
- Blocked patterns are reliably detected (even with arguments, different casings, etc.)
- Allowed commands work as expected
- Shortcuts cannot be used to bypass the allow/block list
- Directory jail is respected (commands cannot escape the configured root)
- Edge cases with special characters in commands

### 2. Shortcut Resolution
- Shortcuts are correctly resolved before security checks
- Malicious or broken shortcuts in config are handled safely
- Conflicting or recursive shortcuts are detected or safely ignored

### 3. Process Lifecycle
- Long-running processes can be started, monitored, and killed reliably
- Output is correctly captured even for processes that produce a lot of data
- Killing a process cleans up resources properly
- Reading output from a killed process still works

### 4. Error Handling (User-facing)
- Timeouts return clear, actionable error messages
- Permission / blocked command errors are obvious to the LLM
- Crashed child processes are handled gracefully

---

## P1 – Important (For Professional Quality)

### 5. CLI Interface
- All CLI flags work correctly (`--config`, `--debug`, `--root`, `--help`, `--version`)
- Conflicting or invalid flags produce helpful errors
- The CLI respects environment variables for logging

### 6. Configuration System
- Explicit config path via CLI works
- Missing or invalid config files are handled gracefully
- Default values are applied correctly when no config is present

### 7. Integration Tests (MCP Protocol Level)
- The server can start and respond to `initialize`
- Tools can be listed and called successfully
- Long-running tool calls can be started and their output read later via `read_process_output`

---

## P2 – Nice to Have

- Structured logging tests (different log levels)
- Performance / buffer boundary tests (very large outputs)
- Cancellation support tests (when we implement tool call cancellation)
- End-to-end tests using a real MCP client library (e.g. `@modelcontextprotocol/sdk/client`)
- Tests for edge cases on different operating systems (Windows vs Linux)

---

## Recommended Implementation Order

1. **P0 Security + Shortcut tests** (foundation of trust)
2. **P0 Process Lifecycle tests** (core feature)
3. **P1 CLI tests** (huge DX improvement)
4. **P1 Integration tests** (prove the server actually works as an MCP)
5. P2 items as time allows

---

## Non-Functional Goals

- All P0 tests should run in under 30 seconds on a normal machine.
- Tests must be deterministic (no flakiness from timing).
- Test failures must give clear, actionable output.

---

## Notes for the Future

Once this tool is extracted into its own repository, we should aim for:
- Minimum 70% code coverage on critical paths (executor, config, security)
- At least one integration test that starts the real server
- Automated test runs on every PR (already partially covered by the CI workflow)

---

**Status**: This plan is the current reference for what "Phase 1 really finished" means in the context of making the tool public.