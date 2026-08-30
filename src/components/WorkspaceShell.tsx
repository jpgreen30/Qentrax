import Link from "next/link";
import type { ReactNode } from "react";

export type WorkspaceRole = "advertiser" | "publisher" | "admin";

const NAV: Record<
  WorkspaceRole,
  { icon: string; label: string; path: string }[]
> = {
  advertiser: [
    { icon: "⌂", label: "Overview", path: "" },
    { icon: "◎", label: "Campaigns", path: "/campaigns" },
    { icon: "◇", label: "Opportunities", path: "/opportunities" },
    { icon: "$", label: "Billing", path: "/billing" },
    { icon: "▦", label: "Reports", path: "/reports" },
    { icon: "◎", label: "Team", path: "/team" },
  ],
  publisher: [
    { icon: "⌂", label: "Overview", path: "" },
    { icon: "◎", label: "Sources", path: "/sources" },
    { icon: "◇", label: "Opportunities", path: "/opportunities" },
    { icon: "$", label: "Earnings", path: "/earnings" },
    { icon: "▦", label: "Reports", path: "/reports" },
    { icon: "◎", label: "Team", path: "/team" },
  ],
  admin: [
    { icon: "⌂", label: "Approvals", path: "" },
    { icon: "▦", label: "Network", path: "/network" },
    { icon: "◈", label: "Verticals", path: "/verticals" },
    { icon: "◎", label: "Organizations", path: "/organizations" },
    { icon: "$", label: "Finance", path: "/finance" },
    { icon: "⌁", label: "Audit", path: "/audit" },
  ],
};

export type WorkspaceShellProps = {
  role: WorkspaceRole;
  orgId?: string;
  orgName: string;
  orgStatus?: string;
  initials: string;
  active: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  children: ReactNode;
};

function hrefFor(role: WorkspaceRole, orgId: string | undefined, path: string) {
  if (role === "admin") return `/workspace/admin${path}`;
  const base = `/workspace/${role}`;
  const q = orgId ? `?org=${orgId}` : "";
  return `${base}${path}${q}`;
}

export default function WorkspaceShell(props: WorkspaceShellProps) {
  const {
    role,
    orgId,
    orgName,
    orgStatus = "active",
    initials,
    active,
    eyebrow,
    title,
    subtitle,
    primaryAction,
    children,
  } = props;

  const portal =
    role === "advertiser"
      ? "ADVERTISER PORTAL"
      : role === "publisher"
        ? "PUBLISHER PORTAL"
        : "PLATFORM ADMIN";

  const items = NAV[role];

  return (
    <main className={`dash ${role}`}>
      <aside className="dashSide">
        <Link className="dashBrand" href="/">
          <i>Q</i>
          <span>
            QENTRAX<small>{portal}</small>
          </span>
        </Link>
        <nav>
          {items.map((item) => {
            const key = item.path === "" ? "overview" : item.path.replace("/", "");
            const isActive = active === key;
            return (
              <Link
                key={item.label}
                href={hrefFor(role, orgId, item.path)}
                className={isActive ? "active" : ""}
              >
                <i>{item.icon}</i>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="dashSupport">
          <span>NEED HELP?</span>
          <p>Talk to the Qentrax network team.</p>
          <a href="mailto:network@qentrax.io">CONTACT SUPPORT ↗</a>
          <p style={{ marginTop: 12 }}>
            <Link href="/workspace">← All workspaces</Link>
          </p>
        </div>
        <div className="dashUser">
          <i>{initials}</i>
          <span>
            {orgName}
            <small>
              {role.toUpperCase()} · {orgStatus}
            </small>
          </span>
          <b>⋮</b>
        </div>
      </aside>
      <section className="dashMain">
        <header className="dashTop">
          <div>
            <span>
              <i /> {eyebrow}
            </span>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div>{primaryAction}</div>
        </header>
        {children}
      </section>
    </main>
  );
}

export function money(cents: number | null | undefined) {
  const dollars = ((cents ?? 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return "$" + dollars;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "QX"
  );
}
