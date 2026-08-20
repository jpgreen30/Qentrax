/**
 * Qentrax MCP server — Phase 1.5 (OAuth)
 * Thin adapter only. Business logic lives in Qentrax application APIs.
 *
 * Auth identity is taken exclusively from the verified OAuth request context
 * (AsyncLocalStorage). Tool/model arguments never supply userId.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  findDemandApi,
  getRequirementsApi,
  checkOpportunityApi,
  getPerformanceApi,
} from "./lib/qentrax-api.js";
import {
  demandPayload,
  requirementsPayload,
  preflightPayload,
  performancePayload,
  formatError,
} from "./lib/format.js";
import { getRequestContext } from "./lib/request-context.js";

export const SERVER_INSTRUCTIONS = `Qentrax is a B2B consumer-opportunity marketplace. Publishers generate consumer interest (leads); advertisers buy demand.

This MCP exposes READ / PREFLIGHT tools only:
- find_demand: discover active buyer demand by vertical and geography
- get_requirements: list required/optional fields and consent rules for a vertical
- check_opportunity: non-destructive preflight (schema, Q-Score, demand estimate)
- get_performance: authorized publisher/advertiser performance metrics for the signed-in user

Users authenticate with their Qentrax account via OAuth. Organization access comes from memberships.

Phase 1 does NOT submit, distribute, or sell consumer leads.
Phase 1 does NOT run provider POST or create financial transactions.
Do not invent verification that Qentrax did not perform.
If a user asks to sell or submit a lead, explain that submission is not available in this Phase 1 MCP.`;

/** Phase 1 tools are read-only / non-destructive and operate on a closed marketplace domain. */
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
} as const;

/**
 * Auth context for upstream Qentrax API calls.
 * Sourced only from the verified OAuth principal bound to this request via ALS.
 * Never reads userId from tool/model arguments.
 */
function callCtx(): { accessToken?: string; userId: string } {
  const ctx = getRequestContext();
  const userId = ctx?.auth?.userId;
  if (!userId) {
    throw new Error("Missing authenticated OAuth context for MCP tool call");
  }
  return {
    accessToken: ctx?.accessToken,
    userId,
  };
}

/** Upstream JSON is untyped; payload builders normalize it before it is returned. */
function asRecord(data: unknown): Record<string, unknown> {
  return (data ?? {}) as Record<string, unknown>;
}

function errorResult(code: string, message: string) {
  return {
    content: [{ type: "text" as const, text: formatError(code, message) }],
    isError: true,
  };
}

/** Text block mirrors structuredContent so non-structured clients see the same data. */
function okResult<T>(payload: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

const demandOutputSchema = {
  status: z.string().describe("demand_found or no_demand"),
  count: z.number().nullable().describe("Number of matching active buyer campaigns"),
  reason_code: z.string().nullable().describe("Reason code when no demand matched"),
  message: z.string().nullable().describe("Human-readable note when no demand matched"),
  query: z.unknown().describe("Echo of the interpreted query"),
  opportunities: z
    .array(
      z.object({
        vertical: z.string().nullable(),
        product: z.string().nullable(),
        bid_usd: z.number().nullable().describe("Advertiser base bid in USD, not a guaranteed payout"),
        bid_type: z.string().nullable(),
        states: z.unknown().describe("States the campaign accepts"),
        network: z.string().nullable(),
        campaign: z.string().nullable(),
      }),
    )
    .describe("Up to 15 matching campaigns"),
  note: z.string().nullable(),
};

const requirementsOutputSchema = {
  vertical: z.string().nullable(),
  product: z.string().nullable(),
  required: z
    .array(
      z.object({
        field: z.string().nullable(),
        label: z.string().nullable(),
        phase: z.string().nullable().describe("Submission phase the field belongs to"),
        type: z.string().nullable(),
        pii: z.boolean().nullable().describe("Whether the field carries consumer PII"),
      }),
    )
    .describe("Fields required for this vertical/product"),
  optional: z
    .array(
      z.object({
        field: z.string().nullable(),
        label: z.string().nullable(),
        phase: z.string().nullable(),
        type: z.string().nullable(),
        pii: z.boolean().nullable(),
      }),
    )
    .describe("Up to 20 optional fields"),
  consent: z.unknown().describe("Consent rules, e.g. TCPA requirements"),
  geography: z.unknown().describe("Geographic restrictions"),
};

const preflightOutputSchema = {
  eligible: z.boolean().nullable().describe("Whether the opportunity would pass validation"),
  status: z.string().nullable(),
  missing_fields: z.array(z.unknown()).nullable(),
  warnings: z.array(z.unknown()).nullable(),
  reason_codes: z.array(z.unknown()).nullable(),
  q_score: z.number().nullable().describe("Qentrax quality score"),
  potential_demand_count: z.number().nullable(),
  note: z.string().describe("Restates that nothing was submitted or distributed"),
};

const performanceOutputSchema = {
  submissions: z.number().nullable(),
  billable: z.number().nullable(),
  rejected: z.number().nullable(),
  pending: z.number().nullable(),
  acceptance_rate: z.number().nullable(),
  revenue_usd: z.number().nullable(),
  avg_payout_usd: z.number().nullable(),
  by_status: z.unknown(),
  rejection_reasons: z.unknown(),
};

export function createQentraxMcpServer(): McpServer {
  const server = new McpServer(
    { name: "qentrax", version: "0.1.6" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "find_demand",
    {
      title: "Find buyer demand",
      description: `Find currently available Qentrax buyer demand matching publisher inventory. Use when a user asks whether there are buyers for a vertical/geo (e.g. roofing in Texas, solar in Arizona). Requires NO consumer PII. Does not submit leads or contact buyers. Returns active campaigns with approximate bid levels.`,
      inputSchema: {
        vertical: z
          .string()
          .describe(
            "Qentrax vertical code, e.g. auto_insurance, solar, home_services, mortgage, legal",
          ),
        state: z.string().optional().describe("US state code, e.g. TX, CA, AZ"),
        product: z.string().optional().describe("Optional product code within the vertical"),
        traffic_source: z
          .string()
          .optional()
          .describe("Optional traffic source label, e.g. facebook, google, web"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 25)"),
      },
      outputSchema: demandOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const result = await findDemandApi(
        {
          vertical: args.vertical,
          state: args.state,
          product: args.product,
          traffic_source: args.traffic_source,
          limit: args.limit,
        },
        callCtx(),
      );
      if (!result.ok) return errorResult(result.code, result.message);
      return okResult(demandPayload(asRecord(result.data)));
    },
  );

  server.registerTool(
    "get_requirements",
    {
      title: "Get vertical requirements",
      description: `Return Qentrax field and consent requirements for a vertical/product. Use when a user asks what data is needed to submit a type of lead (e.g. California auto insurance). Read-only; does not validate or submit any consumer record.`,
      inputSchema: {
        vertical: z
          .string()
          .describe("Qentrax vertical code, e.g. auto_insurance, solar, home_services"),
        product: z.string().optional().describe("Optional product code"),
      },
      outputSchema: requirementsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const result = await getRequirementsApi(
        { vertical: args.vertical, product: args.product },
        callCtx(),
      );
      if (!result.ok) return errorResult(result.code, result.message);
      return okResult(requirementsPayload(asRecord(result.data)));
    },
  );

  server.registerTool(
    "check_opportunity",
    {
      title: "Preflight an opportunity",
      description: `Non-destructive Qentrax preflight: check whether an opportunity would meet schema/consent rules and whether demand exists. Does NOT submit, distribute, or sell the lead. Prefer non-PII attributes (state, zip, vertical intent). Do not send email/phone/name unless the user explicitly asks for a full post-phase check.`,
      inputSchema: {
        vertical: z.string().describe("Qentrax vertical code"),
        state: z.string().optional().describe("US state code"),
        product: z.string().optional().describe("Optional product code"),
        attributes: z
          .record(z.unknown())
          .optional()
          .describe(
            "Non-PII or light attributes: zip, currently_insured, vehicle_count, etc. Avoid email/phone/name.",
          ),
        consent: z
          .record(z.unknown())
          .optional()
          .describe("Optional consent signals: tcpa_consent, tcpa_text"),
        require_post: z
          .boolean()
          .optional()
          .describe("If true, validate post-phase contact fields when provided"),
      },
      outputSchema: preflightOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const result = await checkOpportunityApi(
        {
          vertical: args.vertical,
          state: args.state,
          product: args.product,
          attributes: args.attributes,
          consent: args.consent,
          require_post: args.require_post,
        },
        callCtx(),
      );
      if (!result.ok) return errorResult(result.code, result.message);
      return okResult(preflightPayload(asRecord(result.data)));
    },
  );

  server.registerTool(
    "get_performance",
    {
      title: "Get performance metrics",
      description: `Return performance metrics for the signed-in Qentrax user's organization (publisher or advertiser). Organization is derived from the user's memberships — never invent an organization id. If the user has multiple memberships, pass organization_id only from memberships the user belongs to.`,
      inputSchema: {
        from: z
          .string()
          .optional()
          .describe("ISO start datetime, e.g. 2026-08-01T00:00:00Z"),
        to: z.string().optional().describe("ISO end datetime"),
        vertical: z.string().optional().describe("Optional vertical filter"),
        source_id: z.string().optional().describe("Optional publisher source id filter"),
        organization_id: z
          .string()
          .optional()
          .describe(
            "Optional organization UUID — only if the user is a member; omit when the user has a single org",
          ),
      },
      outputSchema: performanceOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const result = await getPerformanceApi(
        {
          from: args.from,
          to: args.to,
          vertical: args.vertical,
          source_id: args.source_id,
          organization_id: args.organization_id,
        },
        callCtx(),
      );
      if (!result.ok) return errorResult(result.code, result.message);
      return okResult(performancePayload(asRecord(result.data)));
    },
  );

  return server;
}
