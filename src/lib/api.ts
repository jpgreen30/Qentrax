import { NextResponse } from "next/server";
export type ApiErrorCode = "AUTH_REQUIRED"|"AUTH_FORBIDDEN"|"VALIDATION_ERROR"|"INTERNAL_ERROR";
export function apiError(code: ApiErrorCode, message: string, requestId: string, status: number, details: Record<string,unknown> = {}) {
  return NextResponse.json({ error: { code, message, request_id: requestId, details } }, { status, headers: { "X-Request-Id": requestId } });
}
export function apiOk<T>(data: T, requestId: string, status = 200) {
  return NextResponse.json(data, { status, headers: { "X-Request-Id": requestId } });
}
