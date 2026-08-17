import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Qentrax",
  description: "How Qentrax handles account, organization, and marketplace data.",
};

export default function PrivacyPage() {
  return (
    <main className="shell" style={{ maxWidth: 720, padding: "80px 24px 120px", margin: "0 auto" }}>
      <nav style={{ marginBottom: 40 }}>
        <Link href="/" style={{ font: "10px var(--mono)", letterSpacing: ".1em", textTransform: "uppercase", color: "#9ba8aa", textDecoration: "none" }}>
          ← QENTRAX
        </Link>
      </nav>
      <label style={{ font: "10px var(--mono)", letterSpacing: ".12em", color: "var(--acid)" }}>LEGAL</label>
      <h1 style={{ fontSize: 32, margin: "8px 0 12px" }}>Privacy Policy</h1>
      <p style={{ color: "#8a9a9e", fontSize: 13, marginBottom: 32 }}>Last updated: August 17, 2026</p>

      <section style={{ lineHeight: 1.7, color: "#c5d0d2", fontSize: 14 }}>
        <p>
          This Privacy Policy describes how Qentrax, Inc. (“Qentrax,” “we,” “us”) handles information in connection with
          the Qentrax website (qentrax.io), the Qentrax application, and the Qentrax Model Context Protocol (MCP) service
          used with ChatGPT and other compatible clients.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>1. Information we process</h2>
        <p>Depending on how you use Qentrax, we may process:</p>
        <ul>
          <li>
            <strong>Account and authentication data</strong> — email address, password (hashed by our auth provider),
            OAuth subject identifier, and sign-in events when you create or connect a Qentrax account (including via the
            MCP OAuth flow used by ChatGPT).
          </li>
          <li>
            <strong>Organization and membership data</strong> — organization name/type, role, and membership status for
            publishers and advertisers on the network.
          </li>
          <li>
            <strong>MCP and tool request data</strong> — vertical, geography, product filters, preflight attributes you
            supply, and performance query parameters when you use the ChatGPT / MCP tools. Phase 1 MCP tools do not
            require consumer contact PII for demand discovery or requirements lookup.
          </li>
          <li>
            <strong>Opportunity / preflight data</strong> — non-PII or limited attributes (e.g., state, zip, intent
            signals, consent flags) you choose to send for eligibility checks. Contact fields (name, email, phone) are
            not required for Phase 1 preflight and should be minimized.
          </li>
          <li>
            <strong>Performance and transaction metrics</strong> — aggregated or organization-scoped metrics such as
            submission counts, acceptance rates, and revenue figures visible to authorized members of that organization.
          </li>
          <li>
            <strong>Technical data</strong> — IP address, user agent, request identifiers, and logs needed to operate,
            secure, and debug the service.
          </li>
        </ul>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>2. How we use information</h2>
        <ul>
          <li>Authenticate users and authorize organization access.</li>
          <li>Provide demand discovery, requirements, preflight, and performance tools.</li>
          <li>Operate, secure, and improve the marketplace infrastructure.</li>
          <li>Comply with law and respond to lawful requests.</li>
          <li>Communicate with you about the service (e.g., support, security notices).</li>
        </ul>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>3. Consumer PII and minimization</h2>
        <p>
          Phase 1 MCP tools are designed for marketplace discovery and preflight. They do not submit, distribute, or sell
          consumer leads. We encourage users to avoid sending consumer contact PII (name, email, phone, full address)
          unless a later product capability explicitly requires it. Organization performance views do not expose another
          tenant’s consumer-level records.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>4. Service providers / infrastructure</h2>
        <p>We use infrastructure and service providers to operate Qentrax, including:</p>
        <ul>
          <li>Hosting and edge (e.g., Vercel for the application site, Render for the MCP service).</li>
          <li>Database and authentication (Supabase).</li>
          <li>Payment processing for marketplace billing (Stripe), when used.</li>
        </ul>
        <p>
          These providers process data on our behalf under contractual obligations. We do not sell personal information.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>5. Retention and deletion</h2>
        <p>
          We retain account, organization, and operational records for as long as needed to provide the service and meet
          legal obligations. You may request account disconnection or deletion by contacting support (see below).
          {/* OWNER INPUT: specify exact retention periods and deletion SLAs when finalized. */}
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>6. OAuth and ChatGPT account linking</h2>
        <p>
          When you connect Qentrax to ChatGPT (or another MCP client), you authorize the client to call Qentrax tools on
          your behalf using an access token bound to your Qentrax account. You can disconnect by revoking access in the
          client and/or by contacting support to disable your Qentrax account access.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>7. Contact</h2>
        <p>
          Privacy and data requests:{" "}
          <a href="mailto:privacy@qentrax.io" style={{ color: "var(--acid)" }}>
            privacy@qentrax.io
          </a>
          <br />
          General support:{" "}
          <a href="mailto:support@qentrax.io" style={{ color: "var(--acid)" }}>
            support@qentrax.io
          </a>
        </p>
        <p style={{ marginTop: 24, fontSize: 12, color: "#6b7a7e" }}>
          {/* OWNER INPUT: confirm legal entity name, registered address, and any jurisdiction-specific notices (CCPA/GDPR) before public launch. */}
          This policy may be updated from time to time. Material changes will be posted on this page.
        </p>
      </section>

      <footer style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid #ffffff14", fontSize: 11, color: "#536166" }}>
        <Link href="/terms">Terms of Service</Link>
        {" · "}
        <Link href="/support">Support</Link>
        {" · "}
        <Link href="/">Home</Link>
        <p style={{ marginTop: 12 }}>© 2026 QENTRAX, INC. · Powered by Qentrax MCP</p>
      </footer>
    </main>
  );
}
