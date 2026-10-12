"use client";

import type { WorkspaceNavEntry } from "@/components/medsync/workspace-nav";
import type { PharmacyNavId } from "@/lib/pharmacy/nav";
import {
  ActivityIcon,
  ArchiveIcon,
  CheckCheckIcon,
  ClockIcon,
  FileDownIcon,
  ListIcon,
  LockKeyholeIcon,
} from "lucide-react";

import {
  WorkspaceCrumb,
  WorkspacePhoneNav,
  WorkspaceSidebarNav,
} from "@/components/medsync/workspace-nav";
import { PHARMACY } from "@/content/pharmacy";

/**
 * The pharmacy's sidebar items and its narrow-screen link row (§5.2), drawn by the shared
 * workspace nav. A prescription lights Queue (canvas 0.2).
 */
const ICON = {
  queue: ListIcon,
  open: ClockIcon,
  supplied: CheckCheckIcon,
  stock: ArchiveIcon,
  controlled: LockKeyholeIcon,
  downtime: FileDownIcon,
  emergency: ActivityIcon,
} as const;

export interface PharmacyNavEntry {
  id: PharmacyNavId;
  label: string;
  href: string;
  exact: boolean;
  count: number;
  countLabel: string;
}

const entries = (items: readonly PharmacyNavEntry[]): WorkspaceNavEntry[] =>
  items.map((i) => ({
    ...i,
    icon: ICON[i.id],
    also: i.id === "queue" ? ["/pharmacy/prescriptions"] : [],
    sidebarAlso: true,
  }));

export function PharmacySidebarNav({ items }: { items: readonly PharmacyNavEntry[] }) {
  return <WorkspaceSidebarNav items={entries(items)} />;
}

export function PharmacyPhoneNav({ items }: { items: readonly PharmacyNavEntry[] }) {
  return <WorkspacePhoneNav label={PHARMACY.nav.label} items={entries(items)} />;
}

export function PharmacyCrumb({ items }: { items: readonly PharmacyNavEntry[] }) {
  return <WorkspaceCrumb place={PHARMACY.place} items={entries(items)} />;
}
