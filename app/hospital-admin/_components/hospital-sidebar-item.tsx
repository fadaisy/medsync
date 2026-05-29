"use client";

import type { FeatureIconKey } from "../_lib/features";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2Icon,
  CalendarClockIcon,
  DoorOpenIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sidebar row for the hospital-admin shell. Same architecture as the
 * superadmin's AdminSidebarItem (server passes primitives, this client
 * component resolves icons + the active state from pathname). Lives
 * in the hospital-admin tree so the icon map can stay scoped to this
 * workspace's vocabulary — no shared union that two unrelated shells
 * have to keep in sync.
 */

const ICONS: Record<FeatureIconKey, typeof LayoutDashboardIcon> = {
  overview: LayoutDashboardIcon,
  staff: UsersIcon,
  departments: Building2Icon,
  scheduling: CalendarClockIcon,
  intake: DoorOpenIcon,
  admins: ShieldCheckIcon,
  audit: ScrollTextIcon,
  profile: FileTextIcon,
};

interface Props {
  href: string;
  label: string;
  iconKey: FeatureIconKey;
  /** Optional badge count (shown only when > 0). */
  badgeCount?: number;
}

export function HospitalSidebarItem({ href, label, iconKey, badgeCount }: Props) {
  const pathname = usePathname();
  // Index route ("/hospital-admin") matches exactly; nested routes
  // match prefix-with-slash so /staff doesn't accidentally light up
  // /staff-something later.
  const isActive =
    href === "/hospital-admin"
      ? pathname === "/hospital-admin"
      : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = ICONS[iconKey];

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-teal-500/40",
        isActive
          ? "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          isActive
            ? "text-teal-600 dark:text-teal-400"
            : "text-muted-foreground/80 group-hover:text-foreground",
        )}
        aria-hidden
      />
      <span className="flex-1 truncate font-medium">{label}</span>

      {badgeCount && badgeCount > 0 ? (
        <span
          aria-label={`${badgeCount} pending`}
          className={cn(
            "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
            isActive
              ? "bg-teal-600 text-white"
              : "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200",
          )}
        >
          {badgeCount}
        </span>
      ) : null}
    </Link>
  );
}
