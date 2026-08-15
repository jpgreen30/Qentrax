import Link from "next/link";
import type { ReactNode } from "react";
import WorkspaceShell, { initials as makeInitials } from "@/components/WorkspaceShell";

type Role = "advertiser" | "publisher";

export type DashRow = {
  id: string;
  vertical: string;
  score: string;
  status: string;
  value: string;
};

export type DashStat = {
  label: string;
  icon: string;
  value: string;
  meta: string;
};

export type WorkspaceDashboardProps = {
  role: Role;
  orgName: string;
  orgStatus: string;
  subtitle: string;
  stats: DashStat[];
  healthScore: string;
  rows: DashRow[];
  initials: string;
  roleLabel?: string;
  primaryAction?: ReactNode;
  secondaryPanel?: ReactNode;
  listTitle: string;
  listSubtitle: string;
  orgId: string;
};

const chartSvg = (
  <svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="Performance trend">
    <defs>
      <linearGradient id="g-live" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#caff4b" stopOpacity=".25" />
        <stop offset="1" stopColor="#caff4b" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      className="area"
      d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30 L700 230 L0 230Z"
      fill="url(#g-live)"
    />
    <path
      className="line"
      d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30"
    />
    <g className="dots">
      <circle cx="145" cy="145" r="4" />
      <circle cx="290" cy="100" r="4" />
      <circle cx="440" cy="72" r="4" />
      <circle cx="590" cy="55" r="4" />
      <circle cx="700" cy="30" r="4" />
    </g>
  </svg>
);

export default function WorkspaceDashboard(props: WorkspaceDashboardProps) {
  const {
    role,
    orgName,
    orgStatus,
    subtitle,
    stats,
    healthScore,
    rows,
    initials: init,
    primaryAction,
    secondaryPanel,
    listTitle,
    listSubtitle,
    orgId,
  } = props;

  const chartLabel = role === "advertiser" ? "CAMPAIGN PERFORMANCE" : "EARNINGS PERFORMANCE";
  const chartTitle =
    role === "advertiser" ? "Spend and accepted opportunities" : "Revenue and accepted volume";
  const healthLabel = role === "advertiser" ? "CAMPAIGN HEALTH" : "SOURCE HEALTH";
  const eyebrow = role === "advertiser" ? "DEMAND COMMAND" : "SUPPLY COMMAND";

  return (
    <WorkspaceShell
      role={role}
      orgId={orgId}
      orgName={orgName}
      orgStatus={orgStatus}
      initials={init || makeInitials(orgName)}
      active="overview"
      eyebrow={eyebrow}
      title={`Good morning, ${orgName}.`}
      subtitle={subtitle}
      primaryAction={primaryAction}
    >
      <div className="dashStats">
        {stats.map((s) => (
          <article key={s.label}>
            <header>
              <span>{s.label}</span>
              <i>{s.icon}</i>
            </header>
            <strong>{s.value}</strong>
            <small>{s.meta}</small>
          </article>
        ))}
      </div>

      <div className="dashGrid">
        <article className="performance">
          <header>
            <div>
              <span>{chartLabel}</span>
              <h2>{chartTitle}</h2>
            </div>
            <div className="range">
              <button type="button">7D</button>
              <button type="button" className="on">
                30D
              </button>
              <button type="button">90D</button>
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
            {chartSvg}
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
            <span>{healthLabel}</span>
            <b>LIVE</b>
          </header>
          <div className="healthRing">
            <strong>{healthScore}</strong>
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
              <span>{listTitle}</span>
              <h2>{listSubtitle}</h2>
            </div>
            <Link
              href={
                role === "advertiser"
                  ? `/workspace/advertiser/opportunities?org=${orgId}`
                  : `/workspace/publisher/opportunities?org=${orgId}`
              }
              className="dashGhost"
            >
              VIEW ALL ↗
            </Link>
          </header>
          <div className="tableHead">
            <span>ID</span>
            <span>VERTICAL</span>
            <span>SCORE</span>
            <span>STATUS</span>
            <span>VALUE</span>
          </div>
          {rows.length === 0 && (
            <div className="tableRow">
              <span>—</span>
              <span>—</span>
              <span>—</span>
              <span className="status">NO DATA YET</span>
              <span>—</span>
            </div>
          )}
          {rows.map((r) => (
            <div className="tableRow" key={r.id}>
              <span>{r.id}</span>
              <span>{r.vertical}</span>
              <span>{r.score}</span>
              <span className="status">{r.status}</span>
              <span>{r.value}</span>
            </div>
          ))}
        </article>
        <article className="quick">
          <header>
            <span>QUICK ACTIONS</span>
          </header>
          {secondaryPanel}
        </article>
      </div>
    </WorkspaceShell>
  );
}
