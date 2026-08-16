import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_FORBIDDEN"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "UNSUPPORTED_VERTICAL"
  | "NO_DEMAND"
  | "NO_BID"
  | "SOURCE_DISABLED"
  | "CONSENT_REQUIRED"
  | "MISSING_REQUIRED_FIELD"
  | "ORG_AMBIGUOUS"
  | "INTERNAL_ERROR";

/** Legacy-compatible error envelope (preserves existing clients). */
export function apiError(
  code: ApiErrorCode | string,
  message: string,
  requestId: string,
  status: number,
  details: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, request_id: requestId, details },
      request_id: requestId,
    },
    { status, headers: { "X-Request-Id": requestId } },
  );
}

/**
 * Legacy-compatible success: body is the data payload (existing clients).
 * Also includes ok/request_id for forward compatibility.
 */
export function apiOk<T>(data: T, requestId: string, status = 200) {
  // Spread data at top level for backward compatibility when data is an object.
  // New clients should prefer ok + request_id; existing clients still see their fields.
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return NextResponse.json(
      { ok: true, request_id: requestId, ...(data as Record<string, unknown>) },
      { status, headers: { "X-Request-Id": requestId } },
    );
  }
  return NextResponse.json(
    { ok: true, request_id: requestId, data },
    { status, headers: { "X-Request-Id": requestId } },
  );
}
