import { createClient } from "@supabase/supabase-js";
import { apiOk, apiError } from "@/lib/api-utils";
import { approveReturn, rejectReturn } from "@/lib/services/returns";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.return_request_id) {
      return apiError("Missing return_request_id", 400);
    }

    // Require authentication via Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return apiError("Missing or invalid Authorization header", 401);
    }

    const token = authHeader.slice(7);
    const supabaseAuthClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Verify the token and get the user
    const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser(token);
    if (userError || !userData.user) {
      return apiError("Invalid or expired token", 401);
    }

    // Get user's organization context
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Verify user belongs to an organization that can manage this return
    const { data: userOrgs, error: orgsError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userData.user.id)
      .eq("status", "active");

    if (orgsError || !userOrgs || userOrgs.length === 0) {
      return apiError("User does not belong to any organization", 403);
    }

    const orgIds = userOrgs.map((o) => o.organization_id);

    // Verify the return request belongs to one of the user's organizations
    const { data: returnRequest, error: returnError } = await supabase
      .from("return_requests")
      .select("id, organization_id")
      .eq("id", body.return_request_id)
      .in("organization_id", orgIds)
      .single();

    if (returnError || !returnRequest) {
      return apiError("Return request not found or access denied", 404);
    }

    if (body.action === "approve") {
      const result = await approveReturn(supabase, {
        return_request_id: body.return_request_id,
        refund_cents: body.refund_cents,
        approved_by_org_id: returnRequest.organization_id,
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
