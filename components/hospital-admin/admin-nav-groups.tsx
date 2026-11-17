"use client";

import type { AdminNavGroup } from "@/lib/hospital-admin/admin-nav";
import Link from "next/link";

import { Icon, k } from "@/components/clinics-schedule/shared";
import { ADMIN_HOME } from "@/lib/hospital-admin/admin-nav";
import { navTour } from "@/lib/hospital-admin/guide/keys";

/**
 * The admin menu's groups after Clinics & schedule's views (ADR 0520), in the desk rail's own classes. Drawn by the
 * Clinics & schedule rail and by the admin frame, so the menu is the same everywhere. Each item carries its guide
 * key, `nav-<slug of label>` (ADR 0522).
 */
export function AdminNavGroups({
  groups,
  active = null,
}: {
  groups: readonly AdminNavGroup[];
  active?: string | null;
}) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.label} style={{ display: "contents" }}>
          <div className={k("secH", "full")} aria-hidden="true">
            {g.label}
          </div>
          <nav className={k("nav", "more")} aria-label={g.label}>
            {g.items.map((it) => {
              const on = active === it.key;
              return (
                <Link
                  key={it.key}
                  href={it.href}
                  className={k("nv", on && "on")}
                  title={it.label}
                  aria-current={on ? "page" : undefined}
                  data-tour={navTour(it.label, g.label)}
                >
                  <Icon n={it.icon} size={19} />
                  <span className={k("lbl")}>{it.label}</span>
                  {it.badge ? <em>{it.badge}</em> : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </>
  );
}

/** Today, above Clinics & schedule's views (ADR 0521), drawn by the admin frame and the Clinics & schedule rail. */
export function AdminHomeNav({ active = false }: { active?: boolean }) {
  return (
    <nav className={k("nav")} aria-label={ADMIN_HOME.label}>
      <Link
        href={ADMIN_HOME.href}
        className={k("nv", active && "on")}
        title={ADMIN_HOME.label}
        aria-current={active ? "page" : undefined}
        data-tour={navTour(ADMIN_HOME.label)}
      >
        <Icon n={ADMIN_HOME.icon} size={19} />
        <span className={k("lbl")}>{ADMIN_HOME.label}</span>
      </Link>
    </nav>
  );
}
