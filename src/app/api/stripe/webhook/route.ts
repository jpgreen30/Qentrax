import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { syncConnectAccount } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function markEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
  status: "processed" | "ignored" | "error",
  message?: string,
) {
  await supabase.from("stripe_events").upsert({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    payload: event.data.object as unknown as Record<string, unknown>,
    processed_at: new Date().toISOString(),
    process_status: status,
    process_message: message ?? null,
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const { data: existing } = await supabase
    .from("stripe_events")
    .select("id, process_status")
    .eq("id", event.id)
    .maybeSingle();
  if (existing?.process_status === "processed") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await supabase.from("stripe_events").upsert({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    payload: event.data.object as unknown as Record<string, unknown>,
    process_status: "received",
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "payment") {
          await markEvent(supabase, event, "ignored", "not payment mode");
          break;
        }
        const orgId =
          session.metadata?.qentrax_org_id ||
          session.client_reference_id ||
          null;
        const amount = session.amount_total ?? 0;
        if (!orgId || amount <= 0) {
          await markEvent(supabase, event, "ignored", "missing org or amount");
          break;
        }

        const pi =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        const { error } = await supabase.rpc("record_stripe_funding", {
          p_organization_id: orgId,
          p_amount_cents: amount,
          p_idempotency_key: `stripe_cs_${session.id}`,
          p_description: `Stripe Checkout funding · ${session.id}`,
          p_stripe_payment_intent_id: pi,
          p_stripe_checkout_session_id: session.id,
        });

        if (error) {
          await markEvent(supabase, event, "error", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const { emitNotification, formatCents } = await import("@/lib/notifications");
        await emitNotification(supabase, {
          organizationId: orgId,
          type: "billing.funded",
          title: "Balance funded",
          body: `${formatCents(amount)} credited from Stripe Checkout.`,
          href: `/workspace/advertiser/billing?org=${orgId}`,
          dedupeKey: `billing-funded:cs:${session.id}`,
        });
        await markEvent(supabase, event, "processed");
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orgId = pi.metadata?.qentrax_org_id;
        if (!orgId || pi.metadata?.purpose !== "advertiser_funding") {
          await markEvent(supabase, event, "ignored", "no funding metadata");
          break;
        }
        const amount = pi.amount_received || pi.amount;
        const { error } = await supabase.rpc("record_stripe_funding", {
          p_organization_id: orgId,
          p_amount_cents: amount,
          p_idempotency_key: `stripe_pi_${pi.id}`,
          p_description: `Stripe PaymentIntent funding · ${pi.id}`,
          p_stripe_payment_intent_id: pi.id,
          p_stripe_checkout_session_id: null,
        });
        if (error) {
          await markEvent(supabase, event, "error", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const { emitNotification, formatCents } = await import("@/lib/notifications");
        await emitNotification(supabase, {
          organizationId: orgId,
          type: "billing.funded",
          title: "Balance funded",
          body: `${formatCents(amount)} credited from Stripe.`,
          href: `/workspace/advertiser/billing?org=${orgId}`,
          dedupeKey: `billing-funded:pi:${pi.id}`,
        });
        await markEvent(supabase, event, "processed");
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await syncConnectAccount(supabase, account);
        await markEvent(supabase, event, "processed");
        break;
      }

      default:
        await markEvent(supabase, event, "ignored", `unhandled type ${event.type}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "handler error";
    await markEvent(supabase, event, "error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, received: true });
}
