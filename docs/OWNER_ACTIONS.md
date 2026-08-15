# Owner actions

Do not paste credentials into chat or commit them. Configure deployment secrets in Vercel and local values in `.env.local`.

| Action | Configuration | Blocks | Verification |
|---|---|---|---|
| Configure Supabase Auth site URL + redirects | Auth → URL Configuration | Magic-link landing | Site URL `https://qentrax.vercel.app`; Redirect URLs include `https://qentrax.vercel.app/auth/confirm` and localhost equivalents |
| **Update Magic Link email template (required for SSR)** | Auth → Email Templates → Magic Link | Session on `/workspace` | Template link must be token_hash style (see below) |
| Same for Confirm signup template | Auth → Email Templates → Confirm signup | First-time users | Same token_hash pattern with `type=email` |
| Vercel env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL=https://qentrax.vercel.app` | OTP redirect target | Health + sign-in on production |
| Approve agreements with counsel | Legal documents | Phase 1 agreement acceptance | Approved versions in fixtures |
| Stripe account/webhook | Stripe secrets in deployment env | Phase 2 funding | Signed test event posts one balanced journal |

## Magic Link template (copy-paste)

Supabase Dashboard → **Authentication → Email Templates → Magic Link**.

Replace the body link with:

```html
<h2>Sign in to Qentrax</h2>
<p>Use this one-time link. It expires shortly and can only be used once.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in to Qentrax</a></p>
```

Also update **Confirm signup** the same way (first account creation uses that template):

```html
<h2>Confirm your email</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm and sign in</a></p>
```

**Do not** use only `{{ .ConfirmationURL }}` for the app link if you need server-side sessions. That URL hits Supabase `/verify` first, consumes the token, then redirects without a usable `token_hash` for our `/auth/confirm` route.

### Gmail / Outlook link scanners

Some mail clients prefetch links and burn single-use tokens. If the first click still fails after the template fix:

1. Open the email on the same device/browser you will use for the app.
2. Click the link only once.
3. Or switch the template to show `{{ .Token }}` (6-digit code) and enter it on a future OTP form.

## After template save

1. Wait ~1 minute (rate limit).
2. Request a **new** magic link from https://qentrax.vercel.app/sign-in
3. Click the **newest** email only once.
4. You should land on `/workspace` signed in.
