# Quickstart — grok-terminal-mcp

Get the terminal MCP connected and useful in under 5 minutes.

## 1. Add to Grok

Add an entry to your `~/.grok/config.toml`:

```toml
[mcp_servers.grok-terminal]
command = "node"
args = ["/absolute/path/to/your-project/tools/grok-terminal-mcp/dist/server.js"]
```

**Development version** (using tsx):

```toml
[mcp_servers.grok-terminal]
command = "npx"
args = ["tsx", "/absolute/path/to/your-project/tools/grok-terminal-mcp/src/server.ts"]
```

Restart Grok completely after adding the entry.

## 2. Verify It Works

Ask Grok something like:

> "What terminal tools do you have available?"

You should see tools such as `run_command`, `start_process`, `get_config`, `run_build`, etc.

## 3. First Useful Commands

Try these in order:

1. **Basic test**
   > "Run `echo Hello from grok-terminal-mcp` using the terminal tool"

2. **Project check (fast)**
   > "Run the fast project check using the terminal tool"

3. **Build**
   > "Run the project build using the terminal tool"

4. **Background process (powerful feature)**
   > "Start a long-running process in the background and give me the session ID"

## 4. Configuration

Create (or edit) `.grok-terminal.json` in your project root to define:
- Allowed commands
- Blocked dangerous patterns
- Project-specific shortcuts (highly recommended)

See `.grok-terminal.example.json` for a good starting point.

## 5. Useful Tools

Besides the core tools, the following convenience tools are available (especially useful when you have many project-specific scripts):

- `run_build`
- `run_check_fast`
- `run_verify_all`
- `quick_check`

You can also ask Grok to show the current configuration at any time using the `get_config` tool.

## Security Note

This MCP is designed for trusted local development. It will only execute commands that are explicitly allowed in your `.grok-terminal.json`. All executed commands are logged.

## Next Steps

- Read the full [README.md](./README.md)
- Read [STANDALONE.md](./STANDALONE.md) if you want to use this in other projects
- Customize `.grok-terminal.json` for your workflow