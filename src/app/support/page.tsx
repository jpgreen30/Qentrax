import Link from "next/link";

export const metadata = {
  title: "Support | Qentrax",
  description: "Contact and help for Qentrax publishers, advertisers, and MCP users.",
};

export default function SupportPage() {
  return (
    <main className="shell" style={{ maxWidth: 720, padding: "80px 24px 120px", margin: "0 auto" }}>
      <nav style={{ marginBottom: 40 }}>
        <Link href="/" style={{ font: "10px var(--mono)", letterSpacing: ".1em", textTransform: "uppercase", color: "#9ba8aa", textDecoration: "none" }}>
          ← QENTRAX
        </Link>
      </nav>
      <label style={{ font: "10px var(--mono)", letterSpacing: ".12em", color: "var(--acid)" }}>HELP</label>
      <h1 style={{ fontSize: 32, margin: "8px 0 12px" }}>Support</h1>
      <p style={{ color: "#8a9a9e", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
        We’re here to help with account access, organization membership, MCP / ChatGPT connection, and marketplace
        questions.
      </p>

      <section style={{ lineHeight: 1.7, color: "#c5d0d2", fontSize: 14 }}>
        <h2 style={{ fontSize: 18, marginTop: 24 }}>Contact</h2>
        <ul>
          <li>
            General support:{" "}
            <a href="mailto:support@qentrax.io" style={{ color: "var(--acid)" }}>
              support@qentrax.io
            </a>
          </li>
          <li>
            Privacy / data requests:{" "}
            <a href="mailto:privacy@qentrax.io" style={{ color: "var(--acid)" }}>
              privacy@qentrax.io
            </a>
          </li>
          <li>
            Network / partnership:{" "}
            <a href="mailto:network@qentrax.io" style={{ color: "var(--acid)" }}>
              network@qentrax.io
            </a>
          </li>
        </ul>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>MCP / ChatGPT</h2>
        <p>
          If you are connecting Qentrax as a ChatGPT app or plugin, use the production MCP URL{" "}
          <code style={{ color: "var(--acid)" }}>https://mcp.qentrax.io/mcp</code> and complete the OAuth sign-in with
          your Qentrax account. Phase 1 tools are read and preflight only; they do not submit leads.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 36 }}>Account disconnection</h2>
        <p>
          To disconnect ChatGPT or revoke MCP access, remove the app in ChatGPT settings and/or email support to disable
          your Qentrax account access. For deletion requests, contact privacy@qentrax.io.
        </p>
      </section>

      <footer style={{ marginTop: 64, paddingTop: 24, borderTop: "1px solid #ffffff14", fontSize: 11, color: "#536166" }}>
        <Link href="/privacy">Privacy Policy</Link>
        {" · "}
        <Link href="/terms">Terms of Service</Link>
        {" · "}
        <Link href="/">Home</Link>
        <p style={{ marginTop: 12 }}>© 2026 QENTRAX, INC. · Powered by Qentrax MCP</p>
      </footer>
    </main>
  );
}
