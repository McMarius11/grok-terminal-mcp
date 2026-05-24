// mcpManager.ts
// Manages dynamic connections to other MCP servers (HTTP + stdio).
// Connections are not persisted across restarts.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type ConnectionType = "http" | "stdio";

export interface ConnectedServer {
  id: string;
  name: string;
  type: ConnectionType;
  urlOrCommand: string;
  connectedAt: Date;
}

interface InternalConnection {
  client: Client;
  transport: Transport;
  info: ConnectedServer;
}

const connections = new Map<string, InternalConnection>();

function isLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

export async function connectHttp(params: {
  id: string;
  name: string;
  url: string;
  allowRemote?: boolean;
}): Promise<ConnectedServer> {
  const { id, name, url, allowRemote = false } = params;

  if (!allowRemote && !isLocalhost(url)) {
    throw new Error(
      `Remote MCP connections are disabled by default. ` +
      `Set allowRemote: true if you really want to connect to ${url}`
    );
  }

  const client = new Client({
    name: "grok-terminal-mcp-client",
    version: "0.5.0",
  });

  let transport: Transport;

  // Try Streamable HTTP first (modern)
  try {
    transport = new StreamableHTTPClientTransport(new URL(url));
    await client.connect(transport);
  } catch (err) {
    // Fallback to SSE (older transport)
    try {
      transport = new SSEClientTransport(new URL(url));
      await client.connect(transport);
    } catch (sseErr) {
      throw new Error(`Failed to connect to ${url}: ${err} / ${sseErr}`);
    }
  }

  const info: ConnectedServer = {
    id,
    name,
    type: "http",
    urlOrCommand: url,
    connectedAt: new Date(),
  };

  connections.set(id, { client, transport, info });
  return info;
}

export async function connectStdio(params: {
  id: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
}): Promise<ConnectedServer> {
  const { id, name, command, args = [], cwd } = params;

  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
  });

  const client = new Client({
    name: "grok-terminal-mcp-client",
    version: "0.5.0",
  });

  await client.connect(transport);

  const info: ConnectedServer = {
    id,
    name,
    type: "stdio",
    urlOrCommand: `${command} ${args.join(" ")}`.trim(),
    connectedAt: new Date(),
  };

  connections.set(id, { client, transport, info });
  return info;
}

export function listConnections(): ConnectedServer[] {
  return Array.from(connections.values()).map((c) => c.info);
}

export function getConnection(id: string): InternalConnection | undefined {
  return connections.get(id);
}

export async function disconnect(id: string): Promise<boolean> {
  const conn = connections.get(id);
  if (!conn) return false;

  try {
    await conn.client.close();
  } catch {
    // ignore close errors
  }

  connections.delete(id);
  return true;
}

export async function listTools(id: string) {
  const conn = connections.get(id);
  if (!conn) throw new Error(`No MCP server connected with id "${id}"`);

  const result = await conn.client.listTools();
  return result.tools;
}

export async function callTool(id: string, toolName: string, args: Record<string, any> = {}) {
  const conn = connections.get(id);
  if (!conn) throw new Error(`No MCP server connected with id "${id}"`);

  return await conn.client.callTool({
    name: toolName,
    arguments: args,
  });
}
