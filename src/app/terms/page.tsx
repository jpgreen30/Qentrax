import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Qentrax",
  description: "Terms governing use of the Qentrax marketplace and MCP tools.",
};

export default function TermsPage() {
  return (
    <main className="shell" style={{ maxWidth: 720, padding: "80px 24px 120px", margin: "0 auto" }}>
      <nav style={{ marginBottom: 40 }}>
        <Link href="/" style={{ font: "10px var(--mono)", letterSpacing: ".1em", textTransform: "uppercase", color: "#9ba8aa", textDecoration: "none" }}>
          ← QENTRAX
        </Link>
      </nav>
      <label style={{ font: "10px var(--mono)", letterSpacing: ".12em", color: "var(--acid)" }}>LEGAL</label>
      <h1 style={{ fontSize: 32, margin: "8px 0 12px" }}>Terms of Service</h1>
      <p style={{ color: "#8a9a9e", fontSize: 13, marginBottom: 32 }}>Last updated: August 17, 2026</p>

      <section style={{ lineHeight: 1.7, color: "#c5d0d2", fontSize: 14 }}>
        <p>
          These Terms of Service (“Terms”) govern access to and use of the Qentrax website, application, and Model
          Context Protocol (MCP) service (together, the “Service”) operated by Qentrax, Inc.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>1. The Service</h2>
        <p>
          Qentrax is a B2B marketplace connecting publishers of consumer demand with advertisers. The Phase 1 MCP
          interface available through ChatGPT and compatible clients provides read and preflight tools only:
        </p>
        <ul>
          <li>Discover active buyer demand by vertical and geography</li>
          <li>View field and consent requirements for a vertical</li>
          <li>Run a non-destructive preflight check (no submission or distribution)</li>
          <li>Review authorized organization performance metrics</li>
        </ul>
        <p>
          The Phase 1 MCP does <strong>not</strong> submit opportunities, sell leads, execute bids, process payouts, or
          create financial transactions. Any such capabilities, if added later, will be described in updated terms and
          product documentation.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>2. Accounts and authorization</h2>
        <p>
          You must provide accurate account information and keep credentials secure. Organization memberships control
          what data you can access. You may not attempt to access another organization’s data or override tenant
          boundaries via prompts or tool arguments.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for unlawful purposes or in violation of applicable marketing and privacy laws</li>
          <li>Submit or attempt to force submission of consumer leads through Phase 1 MCP tools</li>
          <li>Probe, overload, or abuse OAuth or API endpoints</li>
          <li>Misrepresent your identity, organization, or the nature of demand you offer</li>
        </ul>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>4. Data and intellectual property</h2>
        <p>
          You retain rights to data you lawfully provide. Qentrax retains rights to the Service, software, trademarks,
          and aggregated/de-identified network insights. You grant Qentrax a limited license to process your data to
          operate the Service.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>5. Disclaimers</h2>
        <p>
          Demand listings, bid indications, Q-Scores, and preflight results are informational and do not guarantee
          acceptance, volume, payout, or lead quality. The Service is provided “as is” to the maximum extent permitted
          by law.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>6. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Qentrax’s aggregate liability arising out of these Terms or the
          Service shall not exceed the greater of one hundred U.S. dollars (USD $100) or the amounts you paid to
          Qentrax for the Service in the twelve months preceding the claim.
          {/* OWNER INPUT: confirm liability cap and governing law with counsel. */}
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>7. Termination</h2>
        <p>
          We may suspend or terminate access for violation of these Terms or risk to the network. You may stop using the
          Service and request account closure via support.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>8. Contact</h2>
        <p>
          Questions about these Terms:{" "}
          <a href="mailto:support@qentrax.io" style={{ color: "var(--acid)" }}>
            support@qentrax.io
          </a>
        </p>
        <p style={{ marginTop: 24, fontSize: 12, color: "#6b7a7e" }}>
          {/* OWNER INPUT: governing law, venue, arbitration, and entity address. */}
          We may update these Terms by posting a revised version on this page.
        </p>
      </section>

      <footer style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid #ffffff14", fontSize: 11, color: "#536166" }}>
        <Link href="/privacy">Privacy Policy</Link>
        {" · "}
        <Link href="/support">Support</Link>
        {" · "}
        <Link href="/">Home</Link>
        <p style={{ marginTop: 12 }}>© 2026 QENTRAX, INC. · Powered by Qentrax MCP</p>
      </footer>
    </main>
  );
}
