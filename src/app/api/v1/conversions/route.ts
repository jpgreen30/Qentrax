import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  recordConversionEvent,
  bulkRecordConversions,
  type ConversionStatus,
} from "@/lib/services/conversion-tracking";

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const organizationId = request.nextUrl.searchParams.get("organization_id");
  const deliveryId = request.nextUrl.searchParams.get("delivery_id");
  const status = request.nextUrl.searchParams.get("status");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

  if (!organizationId) {
    return Response.json(
      { success: false, message: "organization_id parameter required" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("conversion_events")
    .select("*")
    .eq("organization_id", organizationId)
    .range(offset, offset + limit - 1);

  if (deliveryId) {
    query = query.eq("delivery_id", deliveryId);
  }

  if (status) {
    query = query.eq("conversion_status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    data: data || [],
    count: count || 0,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  const body = await request.json();
  const {
    organization_id,
    delivery_id,
    transaction_id,
    conversion_status,
    bulk,
    conversions,
    conversion_value,
    event_type,
    external_conversion_id,
  } = body;

  if (!organization_id) {
    return Response.json(
      { success: false, message: "organization_id required" },
      { status: 400 }
    );
  }

  try {
    if (bulk && Array.isArray(conversions)) {
      const results = await bulkRecordConversions(supabase, organization_id, conversions);
      return Response.json({ success: true, data: results }, { status: 201 });
    }

    if (!delivery_id || !transaction_id || !conversion_status) {
      return Response.json(
        {
          success: false,
          message: "delivery_id, transaction_id, and conversion_status required",
        },
        { status: 400 }
      );
    }

    const result = await recordConversionEvent(
      supabase,
      organization_id,
      delivery_id,
      transaction_id,
      conversion_status as ConversionStatus,
      {
        conversionValue: conversion_value,
        eventType: event_type,
        externalConversionId: external_conversion_id,
      }
    );

    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
