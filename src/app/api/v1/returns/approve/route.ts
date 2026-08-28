import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";
import { approveReturn, rejectReturn } from "@/lib/services/returns";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.return_request_id) {
      return apiError("Missing return_request_id", 400);
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    if (body.action === "approve") {
      const result = await approveReturn(supabase, {
        return_request_id: body.return_request_id,
        refund_cents: body.refund_cents,
        approved_by_org_id: body.approved_by_org_id || "platform",
      });

      return apiOk({ return_request: result });
    } else if (body.action === "reject") {
      await rejectReturn(
        supabase,
        body.return_request_id,
        body.rejection_reason || "No reason provided",
      );

      return apiOk({ message: "Return request rejected" });
    } else {
      return apiError("Invalid action. Must be 'approve' or 'reject'", 400);
    }
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Failed to process return",
    );
  }
}
