import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";

function generateAuthCode(): string {
  return randomBytes(32).toString("hex");
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const scope = searchParams.get("scope");
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");

  if (!clientId || !redirectUri || !state) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing required parameters" },
      { status: 400 }
    );
  }

  const escapedClientId = escapeHtml(clientId);
  const escapedRedirectUri = escapeHtml(redirectUri);
  const escapedScope = escapeHtml(scope);
  const escapedState = escapeHtml(state);
  const escapedCodeChallenge = escapeHtml(codeChallenge);
  const escapedCodeChallengeMethod = escapeHtml(codeChallengeMethod);

  const scopesList = scope
    ? scope
        .split(" ")
        .map((s) => escapeHtml(s))
        .join("<br>")
    : "No specific scopes";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Qentrax OAuth Authorization</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { background: white; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); padding: 40px; width: 100%; max-width: 400px; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #1a1a1a; }
    p { color: #666; margin-bottom: 24px; font-size: 14px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
    button { width: 100%; padding: 12px; background: #667eea; color: white; border: none; border-radius: 4px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
    button:hover { background: #5568d3; }
    .scopes { background: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 12px; color: #666; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Qentrax Authorization</h1>
    <p>Sign in to authorize ${escapedClientId}</p>
    <div class="scopes">
      <strong>Requested permissions:</strong><br>
      ${scopesList}
    </div>
    <form method="POST">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required>
      </div>
      <input type="hidden" name="client_id" value="${escapedClientId}">
      <input type="hidden" name="redirect_uri" value="${escapedRedirectUri}">
      <input type="hidden" name="scope" value="${escapedScope}">
      <input type="hidden" name="state" value="${escapedState}">
      <input type="hidden" name="code_challenge" value="${escapedCodeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${escapedCodeChallengeMethod}">
      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );

  try {
    const formData = await request.formData();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const clientId = formData.get("client_id") as string;
    const redirectUri = formData.get("redirect_uri") as string;
    const scope = formData.get("scope") as string;
    const state = formData.get("state") as string;
    const codeChallenge = formData.get("code_challenge") as string;
    const codeChallengeMethod = formData.get("code_challenge_method") as string;

    if (!email || !password || !clientId || !redirectUri || !state) {
      return Response.json(
        { error: "invalid_request", error_description: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify email/password against Supabase Auth
    const { data: user, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !user?.user) {
      return Response.json(
        { error: "invalid_grant", error_description: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Generate authorization code
    const authCode = generateAuthCode();

    // Store auth code with PKCE challenge (valid for 10 minutes)
    await supabase.from("oauth_auth_codes").insert([
      {
        code: authCode,
        client_id: clientId,
        user_id: user.user.id,
        redirect_uri: redirectUri,
        scope: scope || "",
        code_challenge: codeChallenge || null,
        code_challenge_method: codeChallengeMethod || null,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    ]);

    // Redirect with auth code
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.append("code", authCode);
    redirectUrl.searchParams.append("state", state);

    return Response.redirect(redirectUrl.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authorization failed";
    return Response.json(
      { error: "server_error", error_description: message },
      { status: 500 }
    );
  }
}
