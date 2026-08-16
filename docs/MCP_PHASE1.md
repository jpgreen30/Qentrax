# Qentrax MCP — Phase 1 (Private Prototype)

## Architecture

```
ChatGPT (Developer mode / remote MCP)
        ↓  Authorization: Bearer <QENTRAX_MCP_TOKEN>
Qentrax MCP server  (mcp/)   ← thin adapter only
        ↓  same token to app APIs
Qentrax Application API
  /api/v1/demand
  /api/v1/requirements
  /api/v1/opportunities/preflight
  /api/v1/performance
        ↓
Qentrax services (findDemand, getRequirements, checkOpportunity, getPerformance)
        ↓
Supabase (RLS + org binding)
```

**Phase 1 does not submit or distribute consumer leads.**

## Tools

| Tool | Side effects | PII | Auth |
|---|---|---|---|
| `find_demand` | None | None | MCP token |
| `get_requirements` | None | None | MCP token |
| `check_opportunity` | None (preflight only) | Prefer non-PII | MCP token |
| `get_performance` | Read-only | No new consumer PII | MCP token → **bound org only** |

### find_demand

- **Inputs:** `vertical` (required), `state?`, `product?`, `traffic_source?`, `limit?`
- **Output:** demand count + concise campaign/bid summary (USD), or `NO_DEMAND`
- **Does not:** POST to buyers, create transactions, expose credentials

### get_requirements

- **Inputs:** `vertical`, `product?`
- **Output:** required/optional fields, consent, geography from `vertical_field_schemas`

### check_opportunity

- **Inputs:** `vertical`, `state?`, `attributes?`, `consent?`, `require_post?`
- **Output:** eligible/status, missing_fields, q_score, potential_demand_count
- **Does not:** insert opportunity, run auction, deliver, create economics

### get_performance

- **Inputs:** `from?`, `to?`, `vertical?`, `source_id?`
- **Org:** always `QENTRAX_MCP_ORG_ID` — model cannot pass another tenant
- **Output:** submissions, billable, acceptance_rate, revenue_usd, rejection_reasons

## Authentication (prototype)

| Variable | Purpose |
|---|---|
| `QENTRAX_MCP_TOKEN` | Shared secret (≥16 chars). Sent as `Authorization: Bearer …` |
| `QENTRAX_MCP_ORG_ID` | Organization UUID bound to this token |
| `QENTRAX_MCP_ROLE` | `publisher` or `advertiser` |
| `QENTRAX_API_BASE_URL` | Base URL of the Qentrax Next app |

**Before directory submission:** replace shared token with OAuth account linking  
`external subject → public.users → organization_members → permissions`.  
Do not make ChatGPT identity the authorization model.

Service-role is used only after token validation for catalog reads; performance always filters by bound org in application code.

## Endpoints

| Service | URL |
|---|---|
| MCP protocol | `http://<host>:3100/mcp` (local) or `https://<deployed-mcp>/mcp` |
| Health | `http://<host>:3100/health` |
| App APIs | `QENTRAX_API_BASE_URL/api/v1/*` |

Transport: **Streamable HTTP** with JSON response mode (stateless), compatible with remote MCP clients including ChatGPT Developer mode.

## Local development

```bash
# Terminal 1 — Qentrax app
cd qentrax-latest
# set NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, QENTRAX_MCP_TOKEN, QENTRAX_MCP_ORG_ID
npm run dev

# Terminal 2 — MCP server
cd mcp
cp .env.example .env   # fill values; same QENTRAX_MCP_TOKEN as app
npm install
npm run dev
```

## Remote deployment

1. Deploy Qentrax Next.js app (Vercel) with env vars including `QENTRAX_MCP_TOKEN` and `QENTRAX_MCP_ORG_ID`.
2. Deploy `mcp/` as a separate Node service (Fly, Railway, Render, or long-running Node on Vercel serverless-friendly host) with:
   - `QENTRAX_MCP_TOKEN` (same)
   - `QENTRAX_MCP_ORG_ID`
   - `QENTRAX_API_BASE_URL=https://your-qentrax-app.vercel.app`
3. Public URL must terminate TLS: `https://mcp.example.com/mcp`

## ChatGPT private testing (Developer mode)

Per current OpenAI Help / Developer mode docs:

1. ChatGPT **Business / Enterprise / Edu** (or plan where Developer mode is enabled).
2. Open **Settings → Apps / Developer mode** (enable Developer mode).
3. **Create a custom MCP connector / app**:
   - Server URL: `https://<your-mcp-host>/mcp`
   - Authentication: custom header or Bearer token = `QENTRAX_MCP_TOKEN`
   - Label: `qentrax`
4. **Scan tools** — expect four tools listed.
5. In a new chat, enable the connector and try evaluation prompts below.

If OAuth is required by the UI and shared Bearer is not offered, use OpenAI’s documented custom header field for the token, or temporarily put the token in the server URL query only for private tests (not recommended for anything beyond a short sandbox).

### Evaluation prompts

| Prompt | Expected tool |
|---|---|
| “I generate solar leads in Arizona. Do you have buyers?” | `find_demand` |
| “What fields do you require for auto insurance?” | `get_requirements` |
| “Can you check whether this lead meets Qentrax's requirements?” (with non-PII attrs) | `check_opportunity` |
| “How have my home-services leads performed this month?” | `get_performance` |
| “Explain how solar panels work.” | **No Qentrax tool** |
| “Sell this lead to the highest bidder.” | **No submit** — model should say Phase 1 cannot submit |

## Privacy / data handling

- MCP accepts **structured tool arguments only** — not full chat history.
- `find_demand` / `get_requirements` / `get_performance` need no consumer contact PII.
- `check_opportunity` prefers non-PII attributes; preflight strips contact when `require_post` is false.
- Outputs omit provider credentials, tokens, and raw DB errors.

## Known limitations (directory gaps)

1. Shared-token auth, not OAuth account linking  
2. No `submit_opportunity` / `get_bid` (intentional Phase 1)  
3. Single org bound per token (no multi-tenant MCP user switch)  
4. Service-role catalog path after token check — replace with user JWT  
5. No rate limiting beyond platform defaults  
6. No MCP Apps UI resources  
7. Not submitted to any public directory  

## Security checklist

- [x] Unauthenticated MCP requests rejected  
- [x] Performance org not model-supplied under MCP token  
- [x] No submit/distribute tools registered  
- [x] Token not committed (env only)  
- [ ] Production OAuth linking  
- [ ] Per-user org resolution from membership tables  
- [ ] Abuse rate limits  
