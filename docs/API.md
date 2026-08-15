# Qentrax API v1

All JSON APIs use `/api/v1`, UTC timestamps, integer minor currency units, stable reason codes and `X-Request-Id`. Mutating financial and marketplace endpoints will require `Idempotency-Key`.

## Health

`GET /api/v1/health` returns service state, timestamp and `request_id`; the same value is emitted in the `X-Request-Id` response header. An inbound safe request ID is preserved.

Standard errors have shape `{ "error": { "code", "message", "request_id", "details" } }`.
