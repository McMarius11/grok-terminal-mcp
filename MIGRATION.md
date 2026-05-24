# Migration Guide

This document helps users migrate from older versions of `grok-terminal-mcp`.

## From Legacy (pure JS) to v0.3+ (SDK + TypeScript)

If you were using the old pure JavaScript version located in `legacy/`:

### Changes
- The main entry point moved from `server.js` to `dist/server.js` (after build) or `src/server.ts` (development).
- The project is now written in TypeScript.
- The CLI now supports proper flags (`--config`, `--debug`, `--root`).

### Recommended Migration Steps

1. **Update your MCP configuration**

   Old:
   ```toml
   args = [".../legacy/server.js"]
   ```

   New (recommended):
   ```toml
   args = [".../dist/server.js"]
   ```

   Or during development:
   ```toml
   command = "npx"
   args = ["tsx", ".../src/server.ts"]
   ```

2. **Your `.grok-terminal.json` remains fully compatible.** No changes needed.

3. **If you were using custom scripts** to start the old version, update them to point to the new entry points.

4. **Tests and development**
   - Use `npm run dev` instead of directly running `server.js`.
   - Run tests with `npm test`.

### Rollback

If you need to temporarily go back to the legacy version, you can point your config back to `legacy/server.js`. However, the legacy version will no longer receive updates.

## Future Migrations

When this tool is extracted into its own repository, a dedicated migration guide will be published with the new package.