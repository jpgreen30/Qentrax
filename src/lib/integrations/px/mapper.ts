import type { PxPingRequest, PxPostRequest, QentraxOpportunityPayload } from "./types";

export type PxVerticalMapRow = {
  px_vertical: string;
  resource_type: "lead" | "call";
  ping_path: string;
  post_path: string;
  field_map_json: Record<string, string>;
};

/** Map a Qentrax opportunity into a PX API 2.0 ping body (no PII). */
export function toPxPingBody(
  opportunity: QentraxOpportunityPayload,
  map: PxVerticalMapRow,
  apiToken: string,
): { path: string; body: PxPingRequest } {
  const body: PxPingRequest = {
    ApiToken: apiToken,
    Vertical: map.px_vertical,
    OriginalURL: opportunity.originalUrl ?? "https://qentrax.io",
    Source: opportunity.source ?? "qentrax",
    SessionLength: String(opportunity.sessionLengthSec ?? 60),
    VerifyAddress: false,
  };

  if (opportunity.zip) body.ZipCode = opportunity.zip;
  if (opportunity.state) body.State = opportunity.state;
  if (opportunity.tcpaText) body.TCPAText = opportunity.tcpaText;
  if (opportunity.jornayaLeadId) body.JornayaLeadId = opportunity.jornayaLeadId;
  if (opportunity.trustedFormUrl) body.TrustedFormURL = opportunity.trustedFormUrl;
  if (opportunity.userAgent) body.UserAgent = opportunity.userAgent;

  // Apply optional field aliases from map + free-form attributes (non-PII only on ping)
  const attrs = opportunity.attributes ?? {};
  for (const [src, dest] of Object.entries(map.field_map_json ?? {})) {
    const val = (opportunity as Record<string, unknown>)[src] ?? attrs[src];
    if (val != null && val !== "") body[dest] = val;
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (["firstName", "lastName", "email", "phone", "address1", "city"].includes(k)) continue;
    if (body[k] == null) body[k] = v;
  }

  return { path: map.ping_path, body };
}

/** Map full contact data onto a PX post body using TransactionId from ping. */
export function toPxPostBody(
  opportunity: QentraxOpportunityPayload,
  map: PxVerticalMapRow,
  apiToken: string,
  transactionId: string,
): { path: string; body: PxPostRequest } {
  const { body: pingBody } = toPxPingBody(opportunity, map, apiToken);
  const body: PxPostRequest = {
    ...pingBody,
    TransactionId: transactionId,
    FirstName: opportunity.firstName,
    LastName: opportunity.lastName,
    Email: opportunity.email,
    PhoneNumber: opportunity.phone,
    Address1: opportunity.address1,
    City: opportunity.city,
  };
  return { path: map.post_path, body };
}

/** Static fallback maps when DB row is unavailable (mirrors seeded px_vertical_maps). */
export const PX_VERTICAL_FALLBACK: Record<string, PxVerticalMapRow> = {
  auto: {
    px_vertical: "auto",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode", state: "State" },
  },
  health: {
    px_vertical: "health",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode" },
  },
  home: {
    px_vertical: "home",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode" },
  },
  life: {
    px_vertical: "life",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode" },
  },
  mortgage: {
    px_vertical: "mortgage",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode" },
  },
  solar: {
    px_vertical: "solar",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode" },
  },
  "credit-repair": {
    px_vertical: "credit-repair",
    resource_type: "call",
    ping_path: "/api/call/ping",
    post_path: "/api/call/post",
    field_map_json: { zip: "ZipCode", state: "State" },
  },
  legal: {
    px_vertical: "legal",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode" },
  },
};
