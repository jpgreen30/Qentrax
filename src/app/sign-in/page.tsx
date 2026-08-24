import Link from "next/link";
import { requestMagicLink } from "./actions";

const MESSAGES: Record<string, string> = {
  sent: "Check your inbox for the secure sign-in link. Open it on this device and click once — the link is single-use.",
  invalid_email: "Enter a valid email address.",
  delivery_failed: "We could not send the sign-in email. Wait a minute and try again.",
  rate_limited: "Too many requests. Wait about a minute, then request a new link.",
  link_expired: "That sign-in link was already used or expired. Request a new one below.",
  confirmation_failed: "Sign-in could not be completed. Request a new secure link below.",
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
    <main className="signin-page">
      <header className="signin-header">
        <Link className="brand" href="/" aria-label="Qentrax home">
          <i>Q</i>QENTRAX
        </Link>
        <Link href="/terms">TERMS OF USE</Link>
      </header>

      <section className="signin-layout">
        <div className="signin-intro">
          <p className="signin-kicker"><b /> SECURE NETWORK ACCESS</p>
          <h1>Enter the demand<br/><em>exchange.</em></h1>
          <p className="signin-lede">
            One connection to verify, enrich, bid, route and deliver high-intent
            consumer opportunities.
          </p>

          <div className="signin-status" aria-label="Network status">
            <span><small>NETWORK</small><strong><b /> OPERATIONAL</strong></span>
            <span><small>ACCESS</small><strong>MAGIC LINK</strong></span>
            <span><small>SECURITY</small><strong>Q-SHIELD™</strong></span>
          </div>

          <div className="signin-orbit" aria-hidden="true">
            <i /><i /><i />
            <strong>Q<small>ROUTING</small></strong>
            <b /><b /><b />
          </div>
        </div>

        <div className="signin-access">
          <div className="signin-card">
            <code>ACCESS / 01</code>
            <p className="signin-label">QENTRAX NETWORK</p>
            <h2>Welcome back.</h2>
            <p className="signin-copy">
              Enter your work email and we’ll send a secure, single-use link to
              your organization workspace.
            </p>

            <form action={requestMagicLink}>
              <label htmlFor="signin-email">WORK EMAIL</label>
              <input
                id="signin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
              <button type="submit">
                SEND SECURE LINK <span>↗</span>
              </button>
            </form>

            {notice && (
              <p className={`signin-notice ${isError ? "error" : "success"}`} role={isError ? "alert" : "status"}>
                <b>{isError ? "!" : "✓"}</b>{notice}
              </p>
            )}

            <div className="signin-divider"><span>NEW TO QENTRAX?</span></div>
            <div className="signin-roles">
              <Link href="/advertiser">JOIN AS ADVERTISER <span>↗</span></Link>
              <Link href="/publisher">JOIN AS PUBLISHER <span>↗</span></Link>
            </div>

            <p className="signin-legal">
              By continuing, you agree to the Qentrax <Link href="/terms">Terms of Use</Link>
              {" "}and acknowledge our <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </section>

      <footer className="signin-footer">
        <span>© 2026 QENTRAX, INC.</span>
        <span>ENCRYPTED TRANSPORT · CONTROLLED ACCESS · EVENT TRACEABILITY</span>
        <a href="mailto:network@qentrax.io">NETWORK@QENTRAX.IO</a>
      </footer>
    </main>
  );
}
