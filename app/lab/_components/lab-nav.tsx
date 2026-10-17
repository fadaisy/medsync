"use client";

import type { WorkspaceNavEntry } from "@/components/medsync/workspace-nav";
import type { LabNavId } from "@/lib/lab/nav";
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  AwardIcon,
  BanIcon,
  BookOpenIcon,
  Building2Icon,
  ChartColumnIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  CpuIcon,
  DatabaseIcon,
  DiffIcon,
  FileClockIcon,
  FileSearchIcon,
  FileSpreadsheetIcon,
  FingerprintIcon,
  GaugeIcon,
  GitMergeIcon,
  ListChecksIcon,
  ListIcon,
  PackageIcon,
  RulerIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SirenIcon,
  SlidersHorizontalIcon,
  TestTubesIcon,
  TruckIcon,
  UserRoundCheckIcon,
  WrenchIcon,
} from "lucide-react";

import {
  WorkspaceCrumb,
  WorkspacePhoneNav,
  WorkspaceSidebarNav,
} from "@/components/medsync/workspace-nav";

/**
 * The lab sidebar items and the narrow-screen link row (Lab Phase 0 §5.2), drawn by the shared
 * workspace nav (ADR 0229). Items come from the registry in lib/lab/nav.ts.
 */

const ICON = {
  worklist: ListIcon,
  criticals: SirenIcon,
  released: CheckCheckIcon,
  rejected: BanIcon,
  setup_catalogue: TestTubesIcon,
  setup_ranges: RulerIcon,
  setup_limits: GaugeIcon,
  setup_delta: DiffIcon,
  setup_patient_release: UserRoundCheckIcon,
  setup_demo: DatabaseIcon,
  downtime: FileClockIcon,
  setup_criticals: SettingsIcon,
  setup_profiles: CpuIcon,
  setup_drafts: FileSearchIcon,
  setup_settings: SlidersHorizontalIcon,
  to_refer: SendIcon,
  setup_menu: ListChecksIcon,
  stock: PackageIcon,
  equipment: WrenchIcon,
  quality: ShieldCheckIcon,
  qc: ActivityIcon,
  nonconformities: ClipboardListIcon,
  eqa: AwardIcon,
  bedside_quality: FingerprintIcon,
  register: BookOpenIcon,
  hmis: FileSpreadsheetIcon,
  reports: ChartColumnIcon,
  referrals: TruckIcon,
  partners: Building2Icon,
  connections: ArrowLeftRightIcon,
  matches: GitMergeIcon,
  analysers: CpuIcon,
} as const;

export interface LabNavEntry {
  id: LabNavId;
  label: string;
  href: string;
  exact: boolean;
  count: number | null;
  countLabel: string;
  group?: string;
}

const entries = (items: readonly LabNavEntry[]): WorkspaceNavEntry[] =>
  items.map((i) => ({ ...i, icon: ICON[i.id], also: i.exact ? [`${i.href}/results`] : [] }));

export function LabSidebarNav({ items }: { items: readonly LabNavEntry[] }) {
  return <WorkspaceSidebarNav items={entries(items)} />;
}

/** Below the sidebar breakpoint: the same items as a row of links under the top bar. */
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
