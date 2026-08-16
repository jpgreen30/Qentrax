/**
 * Opportunity preflight — NON-DESTRUCTIVE.
 * Validates schema/consent/Q-Score and estimates demand count.
 * Does NOT: insert opportunity, run auction, deliver, or create economics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  flattenIntakePayload,
  loadFieldSchemas,
  validateAgainstSchemas,
} from "@/lib/validate-vertical-fields";
import { computeQScore } from "@/lib/qscore";
import { findDemand } from "@/lib/services/demand";
import { stripContactPii } from "@/lib/pii";

export type PreflightInput = {
  vertical: string;
  product?: string | null;
  attributes?: Record<string, unknown>;
  consumer?: Record<string, unknown>;
  consent?: Record<string, unknown>;
  /** When true, still validate post-phase fields if provided; default ping-focused */
  require_post?: boolean;
  state?: string | null;
};

export type PreflightResult = {
  ok: true;
  eligible: boolean;
  status: "eligible" | "ineligible" | "missing_fields";
  missing_fields: string[];
  warnings: string[];
  reason_codes: string[];
  q_score: { score: number; version: string; reason_codes: string[] };
  potential_demand_count: number;
  /** Non-PII attributes that would be used for matching */
  ping_attributes: Record<string, unknown>;
} | {
  ok: false;
  error: { code: string; message: string };
};

export async function checkOpportunity(
  supabase: SupabaseClient,
  input: PreflightInput,
): Promise<PreflightResult> {
  const vertical = (input.vertical ?? "").trim().toLowerCase();
  if (!vertical) {
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "vertical is required." },
    };
  }

  const { data: vert } = await supabase
    .from("verticals")
    .select("id, code, active")
    .eq("code", vertical)
    .maybeSingle();

  if (!vert?.active) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_VERTICAL",
        message: `Unknown or inactive vertical '${vertical}'.`,
      },
    };
  }

  const schemas = await loadFieldSchemas(supabase, vertical, input.product ?? null);
  const bag = flattenIntakePayload({
    attributes: input.attributes,
    consumer: input.consumer,
    consent: input.consent,
  });

  // Prefer explicit state override for demand estimate
  if (input.state && !bag.state) bag.state = input.state;

  const validated = validateAgainstSchemas(vertical, schemas, bag, {
    requirePost: input.require_post === true,
  });

  const missing_fields = validated.issues
    .filter((i) => i.code === "MISSING")
    .map((i) => i.field);
  const warnings: string[] = [];
  const reason_codes: string[] = [];

  if (!validated.ok) {
    reason_codes.push("SCHEMA_INVALID");
  }
  if (!validated.hasConsent && input.require_post) {
    reason_codes.push("CONSENT_MISSING");
  }

  const q_score = computeQScore({
    schemaValid: validated.ok,
    hasConsent: validated.hasConsent,
    emailPresent: Boolean(bag.email || bag.Email),
    phonePresent: Boolean(bag.phone || bag.Phone || bag.phone_number),
    addressPresent: Boolean(bag.address1 || bag.Address1),
    geoPresent: Boolean(bag.state || bag.zip || bag.State || bag.Zip),
    sourcePresent: Boolean(bag.source),
    tcpaTextPresent: Boolean(bag.tcpa_text || bag.tcpaText),
    jornayaOrTrustedForm: Boolean(
      bag.jornaya_lead_id || bag.trusted_form_url || bag.jornayaLeadId,
    ),
  });

  // Demand estimate — non-PII only
  const state =
    typeof bag.state === "string"
      ? bag.state
      : typeof bag.State === "string"
        ? bag.State
        : input.state ?? null;

  const demand = await findDemand(supabase, {
    vertical,
    state: state ? String(state) : null,
    product: input.product,
    limit: 50,
  });

  const potential_demand_count = demand.ok ? demand.count : 0;
  if (demand.ok && demand.count === 0) {
    reason_codes.push("NO_DEMAND");
    warnings.push("No active demand matched vertical/geo filters.");
  }

  const eligible =
    validated.ok &&
    (input.require_post ? validated.hasConsent : true) &&
    potential_demand_count > 0;

  let status: "eligible" | "ineligible" | "missing_fields" = "eligible";
  if (missing_fields.length) status = "missing_fields";
  else if (!eligible) status = "ineligible";

  return {
    ok: true,
    eligible,
    status,
    missing_fields,
    warnings,
    reason_codes: [...new Set([...reason_codes, ...q_score.reason_codes])],
    q_score: {
      score: q_score.score,
      version: q_score.version,
      reason_codes: q_score.reason_codes,
    },
    potential_demand_count,
    ping_attributes: stripContactPii(validated.pingAttributes ?? {}),
  };
}
