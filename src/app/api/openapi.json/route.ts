/**
 * GET /api/openapi.json
 *
 * Serve OpenAPI 3.1.0 schema for Qentrax v2 API
 * Used by Swagger UI, code generators, and API documentation tools
 */

import { openAPISchema } from "@/lib/openapi-schema";

export async function GET() {
  return Response.json(openAPISchema, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
