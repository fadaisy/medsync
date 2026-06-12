"use client";

import type { ReceptionIconKey } from "../_lib/features";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardListIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SearchIcon,
  UserPlusIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS: Record<ReceptionIconKey, LucideIcon> = {
  overview: LayoutDashboardIcon,
  expected: ClipboardListIcon,
  intake: UserPlusIcon,
  find: SearchIcon,
  flow: ListChecksIcon,
};

interface Props {
  href: string;
  label: string;
  iconKey: ReceptionIconKey;
  exact?: boolean;
}

export function ReceptionSidebarItem({ href, label, iconKey, exact }: Props) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = ICONS[iconKey];

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group tap flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
        isActive
          ? "bg-teal-50 font-medium text-teal-800 ring-1 ring-teal-600/10 ring-inset dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-400/15"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 transition-colors duration-150",
          isActive
            ? "text-teal-600 dark:text-teal-400"
            : "text-muted-foreground/80 group-hover:text-foreground",
        )}
      />
      <span className="truncate">{label}</span>
      {isActive ? (
        <span aria-hidden className="scale-in ml-auto size-1 rounded-full bg-teal-500/80" />
      ) : null}
    </Link>
  );
}
