"use client";

import type { AdminNavGroup } from "@/lib/hospital-admin/admin-nav";
import Link from "next/link";

import { Icon, k } from "@/components/clinics-schedule/shared";

/**
 * The admin menu's groups after Clinics & schedule's views (ADR 0515), in the desk rail's own classes. Drawn by the
 * Clinics & schedule rail and by the admin frame, so the menu is the same everywhere.
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
