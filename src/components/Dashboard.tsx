import Link from "next/link";

type Role = "advertiser" | "publisher";

const chartSvg = {
  advertiser: (
    <svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="Performance trend">
      <defs>
        <linearGradient id="g-advertiser" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#caff4b" stopOpacity=".25" />
          <stop offset="1" stopColor="#caff4b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30 L700 230 L0 230Z" fill="url(#g-advertiser)" />
      <path className="line" d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30" />
      <g className="dots">
        <circle cx="145" cy="145" r="4" />
        <circle cx="290" cy="100" r="4" />
        <circle cx="440" cy="72" r="4" />
        <circle cx="590" cy="55" r="4" />
        <circle cx="700" cy="30" r="4" />
      </g>
    </svg>
  ),
  publisher: (
    <svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="Performance trend">
      <defs>
        <linearGradient id="g-publisher" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#caff4b" stopOpacity=".25" />
          <stop offset="1" stopColor="#caff4b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30 L700 230 L0 230Z" fill="url(#g-publisher)" />
      <path className="line" d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30" />
      <g className="dots">
        <circle cx="145" cy="145" r="4" />
        <circle cx="290" cy="100" r="4" />
        <circle cx="440" cy="72" r="4" />
        <circle cx="590" cy="55" r="4" />
        <circle cx="700" cy="30" r="4" />
      </g>
    </svg>
  ),
};

const configs = {
  advertiser: {
    portal: "ADVERTISER PORTAL",
    eyebrow: "DEMAND COMMAND",
    title: "Good morning, Atlas Growth.",
    sub: "Your campaigns cleared 286 qualified opportunities in the last 24 hours.",
    action: "＋ NEW CAMPAIGN",
    nav: [
      ["⌂", "Overview"],
      ["◎", "Campaigns"],
      ["◇", "Opportunities"],
      ["⇄", "Integrations"],
      ["$", "Billing"],
      ["▦", "Reports"],
    ],
    stats: [
      ["AVAILABLE BALANCE", "◫", "$18,420", "FUNDED"],
      ["SPEND / 30D", "↗", "$42,680", "+12.4%"],
      ["ACCEPTED LEADS", "◎", "1,846", "92.8%"],
      ["AVG. CPL", "⌁", "$23.12", "-8.3%"],
    ],
    chartLabel: "CAMPAIGN PERFORMANCE",
    chartTitle: "Spend and accepted opportunities",
    healthLabel: "CAMPAIGN HEALTH",
    healthScore: "94",
    user: ["AG", "Atlas Growth", "ACCOUNT OWNER"],
    rows: [
      ["QL-90184", "AUTO", "Q 96", "ACCEPTED", "$38.40"],
      ["QL-90183", "SOLAR", "Q 91", "DELIVERED", "$62.10"],
      ["QL-90171", "LIFE", "Q 94", "ACCEPTED", "$55.00"],
      ["QL-90160", "HOME", "Q 88", "PENDING", "$29.75"],
    ],
    quick: [
      ["＋", "Build a campaign", "Set targeting, bids and delivery"],
      ["$", "Fund account", "Add to your media balance"],
      ["⇄", "Connect CRM", "Map your delivery endpoint"],
    ],
  },
  publisher: {
    portal: "PUBLISHER PORTAL",
    eyebrow: "SUPPLY COMMAND",
    title: "Good morning, Northstar Media.",
    sub: "Your sources generated 1,284 accepted opportunities this month.",
    action: "＋ ADD SOURCE",
    nav: [
      ["⌂", "Overview"],
      ["◎", "Sources"],
      ["◇", "Opportunities"],
      ["⇄", "Integrations"],
      ["$", "Earnings"],
      ["▦", "Reports"],
    ],
    stats: [
      ["EST. EARNINGS", "◫", "$31,840", "THIS MONTH"],
      ["PENDING PAYOUT", "↗", "$18,720", "NET 30"],
      ["ACCEPTANCE RATE", "◎", "91.4%", "+3.1%"],
      ["AVG. RPL", "⌁", "$24.80", "+6.8%"],
    ],
    chartLabel: "EARNINGS PERFORMANCE",
    chartTitle: "Revenue and accepted volume",
    healthLabel: "SOURCE HEALTH",
    healthScore: "91",
    user: ["NM", "Northstar Media", "ACCOUNT OWNER"],
    rows: [
      ["QL-90184", "AUTO", "Q 96", "ACCEPTED", "$38.40"],
      ["QL-90177", "MORTGAGE", "Q 90", "SOLD", "$72.00"],
      ["QL-90165", "LEGAL", "Q 92", "ACCEPTED", "$118.50"],
      ["QL-90154", "HOME", "Q 88", "REVIEW", "$41.20"],
    ],
    quick: [
      ["＋", "Add a traffic source", "Begin source review"],
      ["⇄", "Connect integration", "Send a test opportunity"],
      ["$", "Payout settings", "Manage tax and banking"],
    ],
  },
};

export default function Dashboard({ role }: { role: Role }) {
  const c = configs[role];
  return (
    <main className={`dash ${role}`}>
      <aside className="dashSide">
        <Link className="dashBrand" href="/">
          <i>Q</i>
          <span>
            QENTRAX<small>{c.portal}</small>
          </span>
        </Link>
        <nav>
          {c.nav.map(([icon, label], i) => (
            <button key={label} className={i === 0 ? "active" : ""}>
              <i>{icon}</i>
              {label}
            </button>
          ))}
        </nav>
        <div className="dashSupport">
          <span>NEED HELP?</span>
          <p>Talk to the Qentrax network team.</p>
          <a href="mailto:network@qentrax.io">CONTACT SUPPORT ↗</a>
        </div>
        <div className="dashUser">
          <i>{c.user[0]}</i>
          <span>
            {c.user[1]}
            <small>{c.user[2]}</small>
          </span>
          <b>⋮</b>
        </div>
      </aside>
      <section className="dashMain">
        <header className="dashTop">
          <div>
            <span>
              <i /> {c.eyebrow}
            </span>
            <h1>{c.title}</h1>
            <p>{c.sub}</p>
          </div>
          <div>
            <button className="dashIcon">⌕</button>
            <button className="dashIcon">
              ♢<b>3</b>
            </button>
            <button className="dashAction">{c.action}</button>
          </div>
        </header>
        <div className="dashStats">
          {c.stats.map(([label, icon, value, meta]) => (
            <article key={label}>
              <header>
                <span>{label}</span>
                <i>{icon}</i>
              </header>
              <strong>{value}</strong>
              <small>{meta}</small>
            </article>
          ))}
        </div>
        <div className="dashGrid">
          <article className="performance">
            <header>
              <div>
                <span>{c.chartLabel}</span>
                <h2>{c.chartTitle}</h2>
              </div>
              <div className="range">
                <button>7D</button>
                <button className="on">30D</button>
                <button>90D</button>
              </div>
            </header>
            <div className="chart">
              <div className="ylabels">
                <span>$80K</span>
                <span>$60K</span>
                <span>$40K</span>
                <span>$20K</span>
                <span>$0</span>
              </div>
              {chartSvg[role]}
              <div className="xlabels">
                <span>W1</span>
                <span>W2</span>
                <span>W3</span>
                <span>W4</span>
                <span>NOW</span>
              </div>
            </div>
          </article>
          <article className="health">
            <header>
              <span>{c.healthLabel}</span>
              <b>LIVE</b>
            </header>
            <div className="healthRing">
              <strong>{c.healthScore}</strong>
              <small>HEALTH SCORE</small>
            </div>
            {[
              ["QUALITY", 94],
              ["DELIVERY", 98],
              ["COMPLIANCE", 100],
              ["FEEDBACK", 87],
            ].map(([label, val]) => (
              <p key={label as string}>
                <span>{label}</span>
                <i>
                  <b style={{ width: `${val}%` }} />
                </i>
                <strong>{val}</strong>
              </p>
            ))}
          </article>
        </div>
        <div className="dashLower">
          <article className="liveTable">
            <header>
              <div>
                <span>LIVE OPPORTUNITIES</span>
                <h2>Recent network activity</h2>
              </div>
              <button>VIEW ALL ↗</button>
            </header>
            <div className="tableHead">
              <span>ID</span>
              <span>VERTICAL</span>
              <span>SCORE</span>
              <span>STATUS</span>
              <span>VALUE</span>
            </div>
            {c.rows.map((r) => (
              <div className="tableRow" key={r[0]}>
                {r.map((v, i) => (
                  <span className={i === 3 ? "status" : ""} key={i}>
                    {v}
                  </span>
                ))}
              </div>
            ))}
          </article>
          <article className="quick">
            <header>
              <span>QUICK ACTIONS</span>
              <button>•••</button>
            </header>
            {c.quick.map(([icon, title, sub]) => (
              <button className="quickRow" key={title}>
                <i>{icon}</i>
                <span>
                  <b>{title}</b>
                  <small>{sub}</small>
                </span>
                <em>→</em>
              </button>
            ))}
          </article>
        </div>
      </section>
    </main>
  );
}
