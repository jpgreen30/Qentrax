# Qentrax MCP — Phase 1.5 (OAuth)

## Architecture

```
ChatGPT (Developer mode / OAuth)
        ↓  Authorization Code + PKCE (S256)
Qentrax MCP (https://mcp.qentrax.io)   ← canonical public host
  /.well-known/oauth-protected-resource   (RFC 9728)
  /.well-known/oauth-authorization-server (RFC 8414)
  /oauth/authorize  /oauth/token  /oauth/register
        ↓  access token (JWT, aud=https://mcp.qentrax.io/mcp)
  POST /mcp  → tools
        ↓  user id bridge
Qentrax Application API + Supabase Auth memberships
```

**Identity model:** ChatGPT OAuth login → Qentrax Supabase user → `organization_members` → organization/role.

`QENTRAX_MCP_ORG_ID` is **not** required for OAuth users. Organization access is derived from memberships.

Phase 1 tools remain read/preflight only — no lead submit.

**Critical separation:** `MCP_PUBLIC_URL` is the sole source of the MCP resource and OAuth issuer. Supabase is used only for credential verification and membership reads; it must never become the resource or issuer.

## Tools

| Tool | Side effects | Annotations | Auth |
|---|---|---|---|
| `find_demand` | None | readOnlyHint=true, openWorldHint=false, destructiveHint=false | OAuth access token |
| `get_requirements` | None | same | OAuth access token |
| `check_opportunity` | None (preflight) | same | OAuth access token |
| `get_performance` | None | same | OAuth access token + membership resolution |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/.well-known/oauth-protected-resource` | RFC 9728 PRM |
| `GET` | `/.well-known/oauth-authorization-server` | RFC 8414 AS metadata |
| `GET` | `/.well-known/openid-configuration` | OIDC discovery (same AS) |
| `GET /oauth/authorize` | Login form + authorize (PKCE) |
| `POST /oauth/authorize` | Email/password via Supabase Auth → auth code |
| `POST /oauth/token` | `authorization_code` + `refresh_token` |
| `POST /oauth/register` | Dynamic client registration (RFC 7591) |
| `GET /oauth/userinfo` | `sub`, `email` |
| `POST /mcp` | MCP Streamable HTTP (Bearer access token required) |

### Discovery (production)

- Resource: `https://mcp.qentrax.io/mcp`
- PRM: `https://mcp.qentrax.io/.well-known/oauth-protected-resource`
- AS: `https://mcp.qentrax.io/.well-known/oauth-authorization-server`
- Authorize: `https://mcp.qentrax.io/oauth/authorize`
- Token: `https://mcp.qentrax.io/oauth/token`
- Register: `https://mcp.qentrax.io/oauth/register`

### Scopes

`openid`, `email`, `profile`, `offline_access`,  
`qentrax:demand:read`, `qentrax:requirements:read`,  
`qentrax:opportunity:preflight`, `qentrax:performance:read`

### Tokens

- **Access token:** HS256 JWT, `typ=access`, `aud=https://mcp.qentrax.io/mcp`, TTL default 3600s
- **Refresh token:** HS256 JWT, `typ=refresh`, TTL default 30 days; `/oauth/token` grant `refresh_token` rotates tokens
- **PKCE:** S256 required

### get_performance org resolution

1. List active `organization_members` for the signed-in user  
2. If `organization_id` is passed → must be a membership (else 403)  
3. If omitted and exactly one membership (or one publisher) → use it  
4. If multiple → `ORG_AMBIGUOUS` (model must pass a membership id, never invent)

## ChatGPT connection (OAuth)

1. ChatGPT → **Settings → Apps / Developer mode** (enable)  
2. **Create app / connector**  
   - MCP Server URL: `https://mcp.qentrax.io/mcp`  
   - Authentication: **OAuth**  
3. ChatGPT fetches `/.well-known/oauth-protected-resource` then AS metadata  
4. Complete authorization (Qentrax email/password on the authorize page)  
5. **Scan tools** → expect four tools with read-only annotations  
6. Use evaluation prompts from Phase 1 docs / OPENAI_SUBMISSION.md

## Render environment variables

```
MCP_PUBLIC_URL=https://mcp.qentrax.io
MCP_JWT_SECRET=<long random ≥16>
QENTRAX_MCP_BRIDGE_SECRET=<long random ≥16>
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable>
# or SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=<service role>   # optional; catalog reads via app API
QENTRAX_API_BASE_URL=https://www.qentrax.io
PORT=<set by Render>
```

## Vercel (Qentrax app) environment variables

```
QENTRAX_MCP_BRIDGE_SECRET=<same as Render>
```

(The bridge secret lets the MCP service identify the OAuth user to the capability routes for membership checks without using the service-role key as the user identity.)

## Manual Supabase configuration

- Ensure email/password Auth is enabled.
- `organization_members` table must have rows linking users to orgs with `status = 'active'`.
- No special OAuth client registration in Supabase is required; the MCP service is its own authorization server and uses Supabase only for credential verification + membership reads.

## DNS / custom domain (manual)

See owner runbook: add CNAME `mcp.qentrax.io` → Render service hostname, then attach custom domain in Render dashboard and set `MCP_PUBLIC_URL=https://mcp.qentrax.io`.
