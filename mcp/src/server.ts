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
  formatDemand,
  formatRequirements,
  formatPreflight,
  formatPerformance,
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

export function createQentraxMcpServer(): McpServer {
  const server = new McpServer(
    { name: "qentrax", version: "0.1.5" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.tool(
    "find_demand",
    `Find currently available Qentrax buyer demand matching publisher inventory. Use when a user asks whether there are buyers for a vertical/geo (e.g. roofing in Texas, solar in Arizona). Requires NO consumer PII. Does not submit leads or contact buyers. Returns active campaigns with approximate bid levels.`,
    {
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
    READ_ONLY_ANNOTATIONS,
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
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: formatError(result.code, result.message) }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: formatDemand(result.data) }] };
    },
  );

  server.tool(
    "get_requirements",
    `Return Qentrax field and consent requirements for a vertical/product. Use when a user asks what data is needed to submit a type of lead (e.g. California auto insurance). Read-only; does not validate or submit any consumer record.`,
    {
      vertical: z
        .string()
        .describe("Qentrax vertical code, e.g. auto_insurance, solar, home_services"),
      product: z.string().optional().describe("Optional product code"),
    },
    READ_ONLY_ANNOTATIONS,
    async (args) => {
      const result = await getRequirementsApi(
        { vertical: args.vertical, product: args.product },
        callCtx(),
      );
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: formatError(result.code, result.message) }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: formatRequirements(result.data) }] };
    },
  );

  server.tool(
    "check_opportunity",
    `Non-destructive Qentrax preflight: check whether an opportunity would meet schema/consent rules and whether demand exists. Does NOT submit, distribute, or sell the lead. Prefer non-PII attributes (state, zip, vertical intent). Do not send email/phone/name unless the user explicitly asks for a full post-phase check.`,
    {
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
    READ_ONLY_ANNOTATIONS,
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
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: formatError(result.code, result.message) }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: formatPreflight(result.data) }] };
    },
  );

  server.tool(
    "get_performance",
    `Return performance metrics for the signed-in Qentrax user's organization (publisher or advertiser). Organization is derived from the user's memberships — never invent an organization id. If the user has multiple memberships, pass organization_id only from memberships the user belongs to.`,
    {
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
    READ_ONLY_ANNOTATIONS,
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
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: formatError(result.code, result.message) }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: formatPerformance(result.data) }] };
    },
  );

  return server;
}
