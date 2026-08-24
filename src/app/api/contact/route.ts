import { NextResponse } from "next/server";

const RESEND_ENDPOINT = "https://api.resend.com/emails/batch";
const TO_EMAIL = "network@qentrax.io";

function clean(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char] ?? char));
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Email service is not configured." }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const name = clean(payload.name, 120);
  const email = clean(payload.email, 254);
  const company = clean(payload.company, 160);
  const role = clean(payload.role, 80);
  const message = clean(payload.message, 5000);

  if (!name || !email || !message || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Name, valid email, and message are required." }, { status: 400 });
  }

  const from = process.env.RESEND_FROM_EMAIL || "Qentrax Network <network@qentrax.io>";
  const subject = `Qentrax inquiry — ${company || name}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#071014;line-height:1.6"><h2>New Qentrax network inquiry</h2><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Company:</strong> ${escapeHtml(company || "—")}</p><p><strong>Role / interest:</strong> ${escapeHtml(role || "—")}</p><hr/><p>${escapeHtml(message).replace(/\n/g,"<br/>")}</p></div>`;

  const confirmationHtml = `<div style="font-family:Arial,sans-serif;color:#071014;line-height:1.6"><h2>We received your Qentrax inquiry</h2><p>Hi ${escapeHtml(name)},</p><p>Thank you for contacting the Qentrax network. Your message has been received, and our team will follow up at this email address.</p><p>— Qentrax Network</p></div>`;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      { from, to: [TO_EMAIL], reply_to: email, subject, html },
      {
        from,
        to: [email],
        reply_to: TO_EMAIL,
        subject: "We received your Qentrax inquiry",
        html: confirmationHtml,
      },
    ]),
  });

  if (!response.ok) {
    console.error("Resend contact delivery failed", response.status, await response.text());
    return NextResponse.json({ ok: false, error: "Unable to send your message right now." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
