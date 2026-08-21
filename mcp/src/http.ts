/**
 * Qentrax MCP — Phase 1.5
 * Streamable HTTP MCP endpoint + OAuth 2.1 discovery/authorize/token.
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createQentraxMcpServer, SERVER_INSTRUCTIONS } from "./server.js";
import { authenticateMcpRequest, extractBearerToken } from "./lib/auth.js";
import { publicBaseUrl } from "./lib/config.js";
import { handleOAuthRoute } from "./oauth/handlers.js";
import { wwwAuthenticate } from "./oauth/metadata.js";
import { requestContext } from "./lib/request-context.js";

const PORT = Number(process.env.MCP_PORT ?? process.env.PORT ?? 3100);
const HOST = process.env.MCP_HOST ?? "0.0.0.0";

/**
 * OpenAI Apps domain verification token.
 * Served verbatim at /.well-known/openai-apps-challenge so the OpenAI app
 * submission form can verify ownership of the MCP hostname.
 * Override via env when OpenAI issues a new token.
 */
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ??
  "wCFs8KxD-tn8yZcQ36bvaqMmyaDUeD0H02U3blYtaX0";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  const h: Record<string, string> = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "content-type, authorization, x-qentrax-token, mcp-session-id",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    ...headers,
  };
  if (typeof body === "string") {
    if (!h["content-type"]) h["content-type"] = "text/plain; charset=utf-8";
    res.writeHead(status, h);
    res.end(body);
  } else {
    h["content-type"] = h["content-type"] ?? "application/json";
    res.writeHead(status, h);
    res.end(JSON.stringify(body));
  }
}

async function handler(req: IncomingMessage, res: ServerResponse) {
  const host = req.headers.host ?? null;
  const base = publicBaseUrl(host);
  const url = new URL(req.url ?? "/", `http://${host ?? "localhost"}`);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "content-type, authorization, x-qentrax-token, mcp-session-id",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    });
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    send(res, 200, {
      ok: true,
      service: "qentrax-mcp",
      phase: "1.5-oauth",
      tools: [
        "find_demand",
        "get_requirements",
        "check_opportunity",
        "get_performance",
      ],
      oauth: {
        protected_resource: `${base}/.well-known/oauth-protected-resource`,
        authorization_server: `${base}/.well-known/oauth-authorization-server`,
      },
    });
    return;
  }

  // OpenAI Apps domain verification. Unauthenticated, read-only, plain text.
  // HEAD is answered as well as GET so verifiers that probe with HEAD see 200.
  if (
    url.pathname === "/.well-known/openai-apps-challenge" &&
    (method === "GET" || method === "HEAD")
  ) {
    send(res, 200, method === "HEAD" ? "" : OPENAI_APPS_CHALLENGE_TOKEN, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    return;
  }

  const rawBody =
    method === "POST" || method === "PUT" ? await readBody(req) : undefined;
  const oauth = await handleOAuthRoute(
    method,
    url.pathname,
    url,
    rawBody,
    host,
  );
  if (oauth) {
    if (oauth.redirect) {
      res.writeHead(oauth.status, {
        location: oauth.redirect,
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end();
      return;
    }
    send(res, oauth.status, oauth.body ?? "", oauth.headers);
    return;
  }

  if (url.pathname === "/oauth/userinfo" && method === "GET") {
    const auth = await authenticateMcpRequest(
      new Headers({ authorization: req.headers.authorization ?? "" }),
      host,
    );
    if (!auth.ok) {
      send(
        res,
        401,
        { error: "invalid_token" },
        {
          "www-authenticate": wwwAuthenticate(base),
          "content-type": "application/json",
        },
      );
      return;
    }
    send(res, 200, {
      sub: auth.context.userId,
      email: auth.context.email,
      email_verified: true,
    });
    return;
  }

  if (url.pathname !== "/mcp") {
    send(res, 404, { error: { code: "NOT_FOUND", message: "Use POST /mcp" } });
    return;
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v) && v[0]) headers.set(k, v[0]);
  }
  const auth = await authenticateMcpRequest(headers, host);
  if (!auth.ok) {
    send(
      res,
      401,
      { error: { code: auth.code, message: auth.message } },
      {
        "www-authenticate": wwwAuthenticate(
          base,
          "qentrax:demand:read offline_access",
        ),
        "content-type": "application/json",
      },
    );
    return;
  }

  const accessToken = extractBearerToken(headers) ?? undefined;
  const server = createQentraxMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    let parsedBody: unknown;
    if (rawBody) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = undefined;
      }
    }
    await requestContext.run({ auth: auth.context, accessToken }, async () => {
      await transport.handleRequest(req, res, parsedBody);
    });
  } catch (e) {
    if (!res.headersSent) {
      send(res, 500, {
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
      send(res, 500, {
        error: { code: "INTERNAL_ERROR", message: "Unhandled" },
      });
    }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(
    `[qentrax-mcp] Phase 1.5 OAuth listening on http://${HOST}:${PORT}`,
  );
  console.log(`[qentrax-mcp] MCP: /mcp`);
  console.log(`[qentrax-mcp] PRM: /.well-known/oauth-protected-resource`);
  console.log(`[qentrax-mcp] AS:  /.well-known/oauth-authorization-server`);
  console.log(`[qentrax-mcp] challenge: /.well-known/openai-apps-challenge`);
  console.log(
    `[qentrax-mcp] instructions: ${SERVER_INSTRUCTIONS.length} chars`,
  );
});
