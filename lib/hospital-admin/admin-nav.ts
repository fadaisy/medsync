/**
 * The hospital-admin menu after Clinics & schedule's own views (ADR 0520). One list for both places it is drawn:
 * the admin frame around every other admin page, and the Clinics & schedule rail, so the menu reads the same
 * wherever the admin is. Client-safe: no server imports.
 */
import { ADMIN_NAV } from "@/content/hospital-admin/admin-nav";

export interface AdminNavItem {
  key: string;
  label: string;
  href: string;
  /** A desk icon name (`Icon` in components/reception/ui.tsx). */
  icon: string;
  /** A count shown beside the label, already in words; empty for none. */
  badge?: string;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export interface AdminNavCounts {
  /** Staff affiliations waiting for review. */
  staffPending?: number;
  /** Departments & services: things unavailable right now. */
  unavailable?: number;
}

const fill = (t: string, n: number) => t.replace("{n}", String(n));

/**
 * The groups. Intake stays off the menu on the Tether domain, where arrivals are the front desk's (ADR 0500); on
 * MedSync's domain it stays until the desk covers every arrival type (ADR 0520).
 */
export function adminNavGroups(opts: {
  tether: boolean;
  counts?: AdminNavCounts;
}): AdminNavGroup[] {
  const c = opts.counts ?? {};
  const I = ADMIN_NAV.items;
  const hospital: AdminNavItem[] = [
    {
      key: "departments",
      label: I.departments,
      href: "/hospital-admin/departments",
      icon: "eye",
      badge: c.unavailable ? fill(ADMIN_NAV.unavailable, c.unavailable) : "",
    },
    {
      key: "wards",
      label: I.wards,
      href: "/hospital-admin/departments/wards",
      icon: "arrivals",
    },
    { key: "lab", label: I.lab, href: "/hospital-admin/lab", icon: "search" },
    {
      key: "emergency",
      label: I.emergency,
      href: "/hospital-admin/departments/emergency",
      icon: "phone",
    },
    {
      key: "staff",
      label: I.staff,
      href: "/hospital-admin/staff",
      icon: "keys",
      badge: c.staffPending ? fill(ADMIN_NAV.toReview, c.staffPending) : "",
    },
    { key: "profile", label: I.profile, href: "/hospital-admin/profile", icon: "card" },
  ];
  if (!opts.tether)
    hospital.push({
      key: "intake",
      label: I.intake,
      href: "/hospital-admin/intake",
      icon: "arrivals",
    });
  return [
    { label: ADMIN_NAV.groups.hospital, items: hospital },
    {
      label: ADMIN_NAV.groups.followUp,
      items: [
        { key: "requests", label: I.requests, href: "/hospital-admin/requests", icon: "ticket" },
        { key: "reports", label: I.reports, href: "/hospital-admin/reports", icon: "print" },
        { key: "activity", label: I.activity, href: "/hospital-admin/activity", icon: "clock" },
      ],
    },
  ];
}

/** Today, the admin's home (ADR 0521): drawn first, above Clinics & schedule's views, in both places. */
export const ADMIN_HOME: AdminNavItem = {
  key: "today",
  label: ADMIN_NAV.items.today,
  href: "/hospital-admin/today",
  icon: "sun",
};

/** The item a path belongs to: the longest href that is the path or a parent of it. */
export function activeKey(path: string, groups: readonly AdminNavGroup[]): string | null {
  let best: AdminNavItem | null = null;
  for (const g of groups)
    for (const it of g.items)
      if (
        (path === it.href || path.startsWith(`${it.href}/`)) &&
        it.href.length > (best?.href.length ?? 0)
      )
        best = it;
  return best?.key ?? null;
}
