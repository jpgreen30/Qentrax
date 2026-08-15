import { apiOk } from "@/lib/api";
import { requestId } from "@/lib/request-id";
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  return apiOk({ status: "ok", service: "qentrax-web", request_id: id, timestamp: new Date().toISOString() }, id);
}
