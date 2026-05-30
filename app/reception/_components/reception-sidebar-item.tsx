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
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors",
        isActive
          ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-3.5 shrink-0", isActive ? "text-teal-600 dark:text-teal-400" : "")}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
