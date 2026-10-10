"use client";

import type { WorkspaceNavEntry } from "@/components/medsync/workspace-nav";
import type { LabNavId } from "@/lib/lab/nav";
import { BanIcon, CheckCheckIcon, ListIcon } from "lucide-react";

import {
  WorkspaceCrumb,
  WorkspacePhoneNav,
  WorkspaceSidebarNav,
} from "@/components/medsync/workspace-nav";

/**
 * The lab sidebar items and the narrow-screen link row (Lab Phase 0 §5.2), drawn by the shared
 * workspace nav (ADR 0229). Items come from the registry in lib/lab/nav.ts.
 */

const ICON = { worklist: ListIcon, released: CheckCheckIcon, rejected: BanIcon } as const;

export interface LabNavEntry {
  id: LabNavId;
  label: string;
  href: string;
  exact: boolean;
  count: number;
  countLabel: string;
}

const entries = (items: readonly LabNavEntry[]): WorkspaceNavEntry[] =>
  items.map((i) => ({ ...i, icon: ICON[i.id], also: i.exact ? [`${i.href}/results`] : [] }));

export function LabSidebarNav({ items }: { items: readonly LabNavEntry[] }) {
  return <WorkspaceSidebarNav items={entries(items)} />;
}

/** Below the sidebar breakpoint: the same three items as a row of links under the top bar. */
export function LabPhoneNav({ items }: { items: readonly LabNavEntry[] }) {
  return <WorkspacePhoneNav label="Laboratory" items={entries(items)} />;
}

/** "Laboratory / Worklist": where you are, for the top bar. */
export function LabCrumb({
  items,
}: {
  items: readonly Pick<LabNavEntry, "label" | "href" | "exact">[];
}) {
  return (
    <WorkspaceCrumb
      place="Laboratory"
      items={items.map((i) => ({ ...i, also: i.exact ? [`${i.href}/results`] : [] }))}
    />
  );
}
