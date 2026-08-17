# Qentrax — OpenAI Plugin / App Directory submission draft

**Positioning (narrow):**  
A conversational marketplace interface that helps lead publishers discover demand, understand requirements, preflight opportunities without submission, and review marketplace performance.

Do not claim Phase 2 features (submit, sell, bid execution, payouts) as available.

---

## Listing

| Field | Value |
|-------|--------|
| App / plugin name | **Qentrax** |
| One-line | Discover demand, preflight opportunities, and review performance in ChatGPT. |
| Short description | Qentrax helps lead publishers find active buyer demand, check vertical requirements, run non-destructive preflight checks, and review organization performance—without submitting or selling leads in this Phase 1 interface. |
| Long description | Qentrax is a B2B consumer-opportunity marketplace. This ChatGPT integration exposes four read/preflight tools for publishers and advertisers already on the network: (1) find active buyer demand by vertical and geography, (2) retrieve field and consent requirements, (3) preflight an opportunity for schema/consent/demand fit without submitting it, and (4) review authorized organization performance metrics. Phase 1 does not submit leads, distribute records, execute bids, or process payouts. Users authenticate with their Qentrax account via OAuth. |
| Production website | https://www.qentrax.io |
| Production MCP URL | https://mcp.qentrax.io/mcp |
| App / directory icon | https://www.qentrax.io/icon.png |
| Privacy URL | https://www.qentrax.io/privacy |
| Terms URL | https://www.qentrax.io/terms |
| Support URL | https://www.qentrax.io/support |
| Support email | support@qentrax.io |

---

## Starter prompts

1. I generate solar leads in Arizona. Do you have buyers?
2. What fields do I need for auto insurance leads?
3. Preflight this solar opportunity for zip 85001 but don't submit it.
4. How have my leads performed this month?
5. Show requirements for home services in Texas.

---

## Positive test cases (5) — **PASS** (reviewer1@qentrax.io)

| # | User prompt | Expected tool | Result |
|---|-------------|---------------|--------|
| 1 | I generate solar leads in Arizona. Do you have buyers? | `find_demand` | **PASS** — 1 active Solar/AZ opportunity, $25 advertiser base bid |
| 2 | What fields do I need for those Arizona solar leads? | `get_requirements` | **PASS** |
| 3 | Preflight solar zip 85001, homeowner yes, TCPA consent yes — do not submit. | `check_opportunity` | **PASS** — ELIGIBLE, Q-Score 55/100, 1 potential demand match; no lead submitted |
| 4 | How have my leads performed this month? | `get_performance` | **PASS** — 3 submitted, 2 billable, 1 rejected, 0 pending, 66.7% acceptance, $38.25 revenue, $19.13 avg payout |
| 5 | Are there buyers for roofing in Texas? | `find_demand` | **PASS** (tool selected; demand response for vertical/geo) |

### Reviewer Solar/AZ preflight detail (verified)

- ZIP 85001, homeowner=yes, TCPA consent=yes
- Status: **ELIGIBLE**
- Q-Score: **55/100**
- Potential demand matches: **1**
- No lead submitted, sold, or distributed

### Reviewer performance fixture (verified)

| Metric | Value |
|--------|-------|
| Submitted | 3 |
| Billable | 2 |
| Rejected | 1 |
| Pending | 0 |
| Acceptance rate | 66.7% |
| Revenue | $38.25 |
| Average payout | $19.13 |

---

## Negative / security test cases — **PASS** (reviewer1@qentrax.io)

| # | Scenario | Result |
|---|----------|--------|
| 1 | Sell this lead / submit to highest bidder | **PASS** — no submit; Phase 1 refuses destructive action |
| 2 | Show another publisher's revenue | **PASS** — tenant isolation; no cross-publisher data |
| 3 | Use arbitrary organization UUID for performance | **PASS** — model-supplied org does not override membership auth |
| 4 | Show all consumer emails stored by Qentrax | **PASS** — no marketplace-wide PII exposure |
| 5 | How do solar panels work? | **PASS** — no Qentrax tools required |

Also verified: **OAuth / reviewer login — PASS**, **Reviewer tenant isolation — PASS**.

---

## Reviewer walkthrough

1. Connect MCP URL `https://mcp.qentrax.io/mcp` with OAuth.
2. Sign in as **`reviewer1@qentrax.io`** (password provided **only** in the OpenAI submission portal — never stored in GitHub).
3. Scan tools → expect exactly four tools with read-only annotations (`readOnlyHint`, non-destructive).
4. Run the five positive prompts above; confirm Solar/AZ demand, requirements, ELIGIBLE preflight (ZIP 85001), and performance fixture.
5. Run the five negative prompts; confirm no submission and no cross-tenant leakage.

See `docs/REVIEWER_SEED.md` for seed data requirements.

**Do not commit the reviewer password.**

---

## Country availability (proposed)

United States (primary). Expand only where legal terms and operations support.

---

## Release notes (initial)

Initial Phase 1 MCP submission: demand discovery, requirements, non-destructive preflight, and organization performance tools. OAuth 2.1 + PKCE on `https://mcp.qentrax.io`. App directory icon at `https://www.qentrax.io/icon.png`. No lead submission or financial actions in this phase.

---

## Tool annotations (declared)

All four tools: `readOnlyHint: true`, `openWorldHint: false`, `destructiveHint: false`.
