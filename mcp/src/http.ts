/**
 * Remote MCP transport — Streamable HTTP (MCP recommended for remote servers).
 * Endpoint: POST/GET /mcp
 *
 * Auth: ChatGPT should send Authorization: Bearer <QENTRAX_MCP_TOKEN>
 * (configured as custom header when connecting the remote MCP).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createQentraxMcpServer, SERVER_INSTRUCTIONS } from "./server.js";
import { authenticateMcpRequest } from "./lib/auth.js";

const PORT = Number(process.env.MCP_PORT ?? process.env.PORT ?? 3100);
const HOST = process.env.MCP_HOST ?? "0.0.0.0";

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization, x-qentrax-token",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization, x-qentrax-token, mcp-session-id",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    });
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "qentrax-mcp",
      phase: 1,
      tools: ["find_demand", "get_requirements", "check_opportunity", "get_performance"],
    });
    return;
  }

  if (url.pathname !== "/mcp") {
    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "Use POST /mcp" } });
    return;
  }

  // Authenticate before MCP protocol handling
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v) && v[0]) headers.set(k, v[0]);
  }
  const auth = authenticateMcpRequest(headers);
  if (!auth.ok) {
    sendJson(res, 401, { error: { code: auth.code, message: auth.message } });
    return;
  }

  // Stateless streamable HTTP: new transport + server per request (compatible with serverless)
  const server = createQentraxMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    const body = req.method === "POST" ? await readBody(req) : undefined;
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: e instanceof Error ? e.message : "MCP handler error",
        },
      });
    }
  }
}

const httpServer = createServer((req, res) => {
  handler(req, res).catch((e) => {
    console.error("[qentrax-mcp]", e);
    if (!res.headersSent) {
      sendJson(res, 500, { error: { code: "INTERNAL_ERROR", message: "Unhandled" } });
    }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[qentrax-mcp] Phase 1 listening on http://${HOST}:${PORT}/mcp`);
  console.log(`[qentrax-mcp] Health: http://${HOST}:${PORT}/health`);
  console.log(`[qentrax-mcp] Instructions length: ${SERVER_INSTRUCTIONS.length}`);
});
