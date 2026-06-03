"use client";

import type { DoctorIconKey } from "../_lib/features";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  CalendarClockIcon,
  CheckSquareIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SirenIcon,
  StethoscopeIcon,
  UsersIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS: Record<DoctorIconKey, LucideIcon> = {
  overview: LayoutDashboardIcon,
  patients: UsersIcon,
  alerts: ActivityIcon,
  care_team: ClipboardListIcon,
  schedule: CalendarClockIcon,
  encounters: StethoscopeIcon,
  tasks: CheckSquareIcon,
  supervisees: GraduationCapIcon,
  cosign_queue: ListChecksIcon,
  triage: HeartPulseIcon,
  resus: SirenIcon,
};

interface Props {
  href: string;
  label: string;
  iconKey: DoctorIconKey;
  placeholder?: boolean;
  badgeCount?: number;
  /** Match active on exact href only (used for the index). */
  exact?: boolean;
}

export function DoctorSidebarItem({ href, label, iconKey, placeholder, badgeCount, exact }: Props) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = ICONS[iconKey];

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
        isActive
          ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        placeholder && !isActive && "opacity-70",
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-3.5 shrink-0", isActive ? "text-teal-600 dark:text-teal-400" : "")}
      />
      <span className="truncate">{label}</span>
      {placeholder ? (
        <span className="text-muted-foreground/70 ml-auto font-mono text-[9px] tracking-[0.1em] uppercase">
          soon
        </span>
      ) : null}
      {badgeCount && badgeCount > 0 ? (
        <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 font-mono text-[9px] font-semibold text-white tabular-nums">
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      ) : null}
    </Link>
  );
}
