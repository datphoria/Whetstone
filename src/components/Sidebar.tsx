"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "./BrandLockup";

const links = [
  { href: "/dps", label: "DPS Calculator", icon: "crosshair" },
  { href: "/best-setup", label: "Best Setup", icon: "spark" },
  { href: "/best-setup#bank-import", label: "Import Bank", icon: "archive" },
  { href: "/upgrades", label: "Upgrade Advisor", icon: "rise" },
  { href: "/graph", label: "DPS Graph", icon: "chart" },
  { href: "/items", label: "Items", icon: "diamond" },
  { href: "/monsters", label: "Monsters", icon: "target" },
  { href: "/settings", label: "Settings", icon: "sliders" },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    crosshair: <><circle cx="12" cy="12" r="6" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></>,
    spark: <path d="m12 3 2.1 5.4L20 10.5l-4.6 3.7.2 5.8-3.6-3.2L8.4 20l.2-5.8L4 10.5l5.9-2.1L12 3Z" />,
    archive: <><path d="M4 7h16v13H4zM3 4h18v3H3z" /><path d="M9 11h6" /></>,
    rise: <><path d="M5 18 11 12l4 3 5-7" /><path d="M15 8h5v5" /></>,
    chart: <><path d="M4 20V6m0 14h17" /><path d="m7 16 4-5 4 3 5-7" /></>,
    diamond: <path d="m12 3 8 7-8 11-8-11 8-7Zm-8 7h16M8 3l4 7 4-7m-4 7v11" />,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
    sliders: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="site-sidebar" aria-label="Primary navigation">
      <Link href="/" className="sidebar-brand" aria-label="Whetstone home">
        <BrandLockup compact />
      </Link>
      <nav className="sidebar-nav">
        <p className="sidebar-label">Workbench</p>
        {links.map((l) => {
          const path = l.href.split("#")[0];
          const active = pathname === path && !l.href.includes("#");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`sidebar-link ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <NavIcon name={l.icon} />
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-status">
        <span className="status-dot" aria-hidden="true" />
        <span>Game data ready</span>
      </div>
    </aside>
  );
}
