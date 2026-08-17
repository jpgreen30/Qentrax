# Reviewer seed procedure (OpenAI directory)

**Account:** `reviewer@qentrax.io`  
**Do not commit passwords.** Store credentials only in the OpenAI submission form / secure vault.

## Purpose
Provide deterministic, non-production sample data so reviewers can exercise all four Phase 1 MCP tools without real consumer PII or live marketplace side effects.

## Required fixtures (idempotent)

1. **User**
   - Email: `reviewer@qentrax.io`
   - Auth: email/password enabled in Supabase
   - Map `auth.users.id` → `public.users.auth_subject` / `public.users.id`

2. **Organization**
   - One publisher organization, e.g. name `Qentrax Reviewer Publisher`
   - Distinct from real production orgs (prefix or flag)
   - `organization_members`: reviewer user, role `publisher` or `owner`, `status = 'active'`

3. **Demand (for `find_demand`)**
   - At least one active campaign/demand row for vertical `solar` in state `AZ` (and optionally `auto_insurance` / `CA`)
   - Bid levels present so the tool returns `demand_found`

4. **Requirements (for `get_requirements`)**
   - Catalog entries for representative verticals: `solar`, `auto_insurance`
   - Required / optional fields + consent rules so the tool returns structured requirements

5. **Preflight (for `check_opportunity`)**
   - Schema/consent rules that yield an **eligible** result for a non-PII attribute set, e.g.  
     `{ vertical: "solar", state: "AZ", attributes: { zip: "85001" } }`
   - No contact PII required

6. **Performance (for `get_performance`)**
   - Organization-scoped history including:
     - accepted / billable transaction(s)
     - rejected transaction(s) with reason codes
     - submissions counts over a recent window (e.g. current month)
   - No real consumer emails/phones in fixtures

## Suggested SQL sketch (adjust to actual schema)

Run against a non-production project or clearly marked seed rows. Keep scripts out of public CI if they contain secrets.

```sql
-- Pseudocode only — adapt to live schema and RLS
-- 1) Ensure user + membership exist for reviewer@qentrax.io
-- 2) Insert or upsert seed campaigns for solar/AZ
-- 3) Insert requirements catalog rows
-- 4) Insert sample opportunities / deliveries / metrics for the reviewer org
```

## Verification prompts

After seeding and connecting MCP with the reviewer account:

1. “I generate solar leads in Arizona. Do you have buyers?” → `find_demand`
2. “What fields do I need for auto insurance leads?” → `get_requirements`
3. “Preflight this solar opportunity for zip 85001 but don't submit it.” → `check_opportunity`
4. “How have my leads performed this month?” → `get_performance`

## Notes

- Seed data must remain distinguishable from production marketplace activity.
- Do not store the reviewer password in GitHub or this file.
- Re-run the seed procedure before each major review submission so results stay deterministic.
