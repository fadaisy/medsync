"use client";

import type { NavIcon } from "../_lib/places";
import type { Domain } from "@/lib/design/domains";

import { SidebarNavItem } from "@/components/medsync/sidebar-nav";
import { ICONS } from "../_lib/places";

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
