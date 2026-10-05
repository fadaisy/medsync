"use client";

import type { Domain } from "@/lib/design/domains";
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  ClockIcon,
  FlaskConicalIcon,
  PhoneIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react";

import { SidebarNavItem } from "@/components/medsync/sidebar-nav";

const ICONS = {
  today: CalendarDaysIcon,
  patients: UsersIcon,
  recall: PhoneIcon,
  reviews: CalendarCheckIcon,
  dashboard: ChartColumnIcon,
  leading: ActivityIcon,
  review: FlaskConicalIcon,
  overdue: ClockIcon,
  quality: ShieldCheckIcon,
  exchange: ArrowLeftRightIcon,
  admin: SlidersHorizontalIcon,
} as const;
export type NavIcon = keyof typeof ICONS;

export function NcdNavItem(p: {
  href: string;
  label: string;
  icon: NavIcon;
  domain?: Domain;
  count?: number;
  exact?: boolean;
}) {
  return (
    <SidebarNavItem
      href={p.href}
      label={p.label}
      icon={ICONS[p.icon]}
      domain={p.domain}
      count={p.count}
      exact={p.exact}
    />
  );
}
