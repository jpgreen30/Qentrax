import { requestMagicLink } from "./actions";

const MESSAGES: Record<string, string> = {
  sent: "Check your inbox for the secure sign-in link. Open it on this device and click once — the link is single-use.",
  invalid_email: "Enter a valid email address.",
  delivery_failed:
    "We could not send the sign-in email. Wait a minute and try again.",
  rate_limited:
    "Too many requests. Wait about a minute, then request a new link.",
  link_expired:
    "That sign-in link was already used or expired. Request a new one below.",
  confirmation_failed:
    "Sign-in could not be completed. Request a new link below. If this keeps happening, update the Magic Link email template to use token_hash (see docs/OWNER_ACTIONS.md).",
};

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const state = await searchParams;
  const noticeKey = state.sent ? "sent" : state.error;
  const notice = noticeKey ? MESSAGES[noticeKey] : null;
  const isError = Boolean(state.error);

  return (
    <main>
      <section className="workspace narrow">
        <p className="eyebrow">SECURE ACCESS</p>
        <h1>Sign in to Qentrax</h1>
        <p className="lede">
          Use a secure email magic link to access your organization workspace.
        </p>
        <form action={requestMagicLink}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </label>
          <button className="button" type="submit">
            Continue securely
          </button>
        </form>
        {notice && (
          <p className="notice" role={isError ? "alert" : "status"}>
            {notice}
          </p>
        )}
      </section>
    </main>
  );
}
