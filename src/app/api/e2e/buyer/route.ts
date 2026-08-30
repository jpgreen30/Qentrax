import { NextResponse } from "next/server";

/**
 * Local buyer webhook sink for end-to-end delivery verification.
 *
 * SECURITY: This endpoint is ONLY for testing and must be gated behind
 * QENTRAX_ALLOW_LOOPBACK_DELIVERY. It accepts delivery payloads without
 * full validation, which would be unsafe in production. This gate ensures
 * it's only available in CI/e2e environments.
 *
 * The delivery pipeline needs a real HTTP endpoint that returns 2xx so the
 * browser harness can prove campaign delivery, transaction finalization and
 * downstream reporting without stubbing the buyer side.
 */
export async function POST(request: Request) {
  // PRODUCTION SAFETY CHECK: This endpoint must only be available in test environments
  if (process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY !== "1") {
    return NextResponse.json(
      { ok: false, error: "endpoint_disabled" },
      { status: 404 },
    );
  }

  let payload: Record<string, unknown> | null = null;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const required = [
    "transaction_id",
    "opportunity_id",
    "campaign_id",
    "vertical",
    "consumer",
    "attributes",
    "delivered_at",
  ];
  const missing = required.filter((key) => !(key in (payload ?? {})));
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "missing_fields", missing },
      { status: 422 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      received_at: new Date().toISOString(),
    },
    { status: 202 },
  );
}
