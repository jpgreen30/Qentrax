import type { SupabaseClient } from "@supabase/supabase-js";

export type ReturnRequestInput = {
  transaction_id: string;
  delivery_id?: string;
  reason_code: string;
  reason_text?: string;
  requested_by_org_id: string;
};

export type ReturnRequestResult = {
  return_request_id: string;
  transaction_id: string;
  status: "pending" | "approved" | "rejected";
  refund_cents: number;
  reversals: Array<{
    entry_type: string;
    amount_cents: number;
  }>;
};

export type ApproveReturnInput = {
  return_request_id: string;
  refund_cents?: number;
  approved_by_org_id: string;
};

export async function requestReturn(
  supabase: SupabaseClient,
  input: ReturnRequestInput,
): Promise<ReturnRequestResult | null> {
  // Load transaction to get financial details
  const { data: transaction, error: txnError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", input.transaction_id)
    .single();

  if (txnError || !transaction) {
    throw new Error(`Transaction not found: ${input.transaction_id}`);
  }

  // Validate transaction can be returned
  if (!["charged", "settled"].includes(transaction.status)) {
    throw new Error(
      `Transaction status ${transaction.status} cannot be returned`,
    );
  }

  // Create return request
  const { data: returnRequest, error: returnError } = await supabase
    .from("return_requests")
    .insert({
      organization_id: transaction.publisher_org_id, // Return scoped to publisher org
      transaction_id: input.transaction_id,
      delivery_id: input.delivery_id,
      reason_code: input.reason_code,
      reason_text: input.reason_text,
      requested_by_org_id: input.requested_by_org_id,
      refund_cents: transaction.advertiser_price_cents,
      status: "pending",
    })
    .select()
    .single();

  if (returnError) {
    throw new Error(`Failed to create return request: ${returnError.message}`);
  }

  return {
    return_request_id: returnRequest.id,
    transaction_id: input.transaction_id,
    status: returnRequest.status,
    refund_cents: returnRequest.refund_cents,
    reversals: [],
  };
}

export async function approveReturn(
  supabase: SupabaseClient,
  input: ApproveReturnInput,
): Promise<ReturnRequestResult> {
  // Load return request
  const { data: returnRequest, error: returnError } = await supabase
    .from("return_requests")
    .select("*")
    .eq("id", input.return_request_id)
    .single();

  if (returnError || !returnRequest) {
    throw new Error(`Return request not found: ${input.return_request_id}`);
  }

  // Load transaction
  const { data: transaction, error: txnError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", returnRequest.transaction_id)
    .single();

  if (txnError || !transaction) {
    throw new Error(`Transaction not found: ${returnRequest.transaction_id}`);
  }

  const refundAmount = input.refund_cents || returnRequest.refund_cents;

  // Create reversal ledger entries
  const reversals = [];

  // 1. Refund advertiser (if delivery failed)
  if (
    returnRequest.reason_code === "DELIVERY_FAILED" ||
    returnRequest.reason_code === "ADVERTISER_REJECTED"
  ) {
    const { error: advertiserRefundError } = await supabase
      .from("reversal_entries")
      .insert({
        organization_id: transaction.advertiser_org_id,
        return_request_id: input.return_request_id,
        transaction_id: returnRequest.transaction_id,
        entry_type: "ADVERTISER_REFUND",
        amount_cents: refundAmount,
        description: `Refund for return: ${returnRequest.reason_code}`,
        status: "completed",
        completed_at: new Date().toISOString(),
      });

    if (advertiserRefundError) {
      throw new Error(`Failed to create advertiser refund: ${advertiserRefundError.message}`);
    }

    reversals.push({
      entry_type: "ADVERTISER_REFUND",
      amount_cents: refundAmount,
    });
  }

  // 2. Chargeback from publisher (if they submitted bad lead)
  if (
    returnRequest.reason_code === "INVALID_DATA" ||
    returnRequest.reason_code === "QUALITY_ISSUE"
  ) {
    const chargebackAmount = Math.floor(refundAmount * 0.15); // 15% chargeback fee
    const { error: chargebackError } = await supabase
      .from("reversal_entries")
      .insert({
        organization_id: transaction.publisher_org_id,
        return_request_id: input.return_request_id,
        transaction_id: returnRequest.transaction_id,
        entry_type: "PUBLISHER_CHARGEBACK",
        amount_cents: chargebackAmount,
        description: `Chargeback for return: ${returnRequest.reason_code}`,
        status: "completed",
        completed_at: new Date().toISOString(),
      });

    if (chargebackError) {
      throw new Error(`Failed to create publisher chargeback: ${chargebackError.message}`);
    }

    reversals.push({
      entry_type: "PUBLISHER_CHARGEBACK",
      amount_cents: chargebackAmount,
    });
  }

  // 3. Platform margin loss
  const platformMarginLoss = transaction.platform_margin_cents;
  const { error: platformLossError } = await supabase
    .from("reversal_entries")
    .insert({
      organization_id: transaction.publisher_org_id,
      return_request_id: input.return_request_id,
      transaction_id: returnRequest.transaction_id,
      entry_type: "PLATFORM_LOSS",
      amount_cents: platformMarginLoss,
      description: "Platform margin loss from return",
      status: "completed",
      completed_at: new Date().toISOString(),
    });

  if (platformLossError) {
    throw new Error(`Failed to create platform loss entry: ${platformLossError.message}`);
  }

  reversals.push({
    entry_type: "PLATFORM_LOSS",
    amount_cents: platformMarginLoss,
  });

  // Update return request status
  const { error: updateError } = await supabase
    .from("return_requests")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", input.return_request_id);

  if (updateError) {
    throw new Error(`Failed to approve return: ${updateError.message}`);
  }

  // Update transaction status to returned
  const { error: txnUpdateError } = await supabase
    .from("transactions")
    .update({
      status: "returned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", returnRequest.transaction_id);

  if (txnUpdateError) {
    throw new Error(`Failed to update transaction status: ${txnUpdateError.message}`);
  }

  return {
    return_request_id: input.return_request_id,
    transaction_id: returnRequest.transaction_id,
    status: "approved",
    refund_cents: refundAmount,
    reversals,
  };
}

export async function rejectReturn(
  supabase: SupabaseClient,
  returnRequestId: string,
  rejectionReason: string,
): Promise<void> {
  const { error } = await supabase
    .from("return_requests")
    .update({
      status: "rejected",
      rejected_reason: rejectionReason,
    })
    .eq("id", returnRequestId);

  if (error) {
    throw new Error(`Failed to reject return: ${error.message}`);
  }
}

export async function getPendingReturns(
  supabase: SupabaseClient,
  organizationId: string,
  limit: number = 100,
): Promise<Array<{
  id: string;
  transaction_id: string;
  reason_code: string;
  reason_text?: string;
  refund_cents: number;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from("return_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to get pending returns:", error);
    return [];
  }

  return data || [];
}
