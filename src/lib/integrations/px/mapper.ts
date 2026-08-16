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

  const attrs = opportunity.attributes ?? {};
  for (const [src, dest] of Object.entries(map.field_map_json ?? {})) {
    const val = (opportunity as Record<string, unknown>)[src] ?? attrs[src];
    if (val != null && val !== "") body[dest] = val;
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (["firstName", "lastName", "email", "phone", "address1", "city", "first_name", "last_name"].includes(k))
      continue;
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

/**
 * Static maps keyed by Qentrax vertical code.
 * resolvePxVerticalMap never silently picks an unrelated vertical.
 */
export const PX_VERTICAL_FALLBACK: Record<string, PxVerticalMapRow> = {
  auto_insurance: {
    px_vertical: "auto",
    resource_type: "lead",
    ping_path: "/api/lead/ping",
    post_path: "/api/lead/post",
    field_map_json: { zip: "ZipCode", state: "State" },
  },
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
  life_insurance: {
    px_vertical: "life",
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

/**
 * Deterministic map resolution.
 * Returns null when no mapping exists — never falls back to an unrelated vertical.
 */
export function resolvePxVerticalMap(
  verticalCode: string,
  _productCode?: string | null,
  dbRows?: Array<
    PxVerticalMapRow & { qentrax_vertical_code?: string; qentrax_product_code?: string | null }
  >,
): PxVerticalMapRow | null {
  const code = (verticalCode ?? "").trim();
  if (!code) return null;

  if (dbRows?.length) {
    if (_productCode) {
      const productMatch = dbRows.find(
        (r) =>
          r.qentrax_vertical_code === code &&
          r.qentrax_product_code === _productCode,
      );
      if (productMatch) return productMatch;
    }
    const verticalOnly = dbRows.find(
      (r) =>
        r.qentrax_vertical_code === code &&
        (r.qentrax_product_code == null || r.qentrax_product_code === ""),
    );
    if (verticalOnly) return verticalOnly;
    // If all rows are product-scoped and no product match, do not pick arbitrarily
    const anyVertical = dbRows.filter((r) => r.qentrax_vertical_code === code);
    if (anyVertical.length === 1) return anyVertical[0];
    if (anyVertical.length > 1 && !_productCode) return anyVertical[0];
    return null;
  }

  return PX_VERTICAL_FALLBACK[code] ?? null;
}
