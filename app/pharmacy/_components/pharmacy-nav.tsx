"use client";

import type { WorkspaceNavEntry } from "@/components/medsync/workspace-nav";
import type { PharmacyNavId } from "@/lib/pharmacy/nav";
import {
  ActivityIcon,
  ArchiveIcon,
  BookCheckIcon,
  CalendarCheckIcon,
  CheckCheckIcon,
  ClockIcon,
  FileDownIcon,
  HourglassIcon,
  ListIcon,
  LockKeyholeIcon,
  MapPinIcon,
  MessagesSquareIcon,
  ShoppingCartIcon,
  SignatureIcon,
  SirenIcon,
  TruckIcon,
  WarehouseIcon,
} from "lucide-react";

import {
  WorkspaceCrumb,
  WorkspacePhoneNav,
  WorkspaceSidebarNav,
} from "@/components/medsync/workspace-nav";
import { PHARMACY } from "@/content/pharmacy";
import { CLINICAL_UI } from "@/content/pharmacy-clinical";
import { STORES_NAV } from "@/content/pharmacy-stores";
import { CLINICAL_NAV_IDS, STORE_NAV_IDS } from "@/lib/pharmacy/nav";

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
  deliveries: TruckIcon,
  issues: WarehouseIcon,
  wards: ArchiveIcon,
  carts: SirenIcon,
  expiry: HourglassIcon,
  monthEnd: CalendarCheckIcon,
  orders: ShoppingCartIcon,
  places: MapPinIcon,
  packs: SignatureIcon,
  interventions: MessagesSquareIcon,
  clinicalContent: BookCheckIcon,
} as const;

export interface PharmacyNavEntry {
  id: PharmacyNavId;
  label: string;
  href: string;
  exact: boolean;
  /** null: nothing to count (Stock, Controlled drugs). */
  count: number | null;
  countLabel: string;
}

const entries = (items: readonly PharmacyNavEntry[]): WorkspaceNavEntry[] =>
  items.map((i, idx) => ({
    ...i,
    icon: ICON[i.id],
    also: i.id === "queue" ? ["/pharmacy/prescriptions"] : [],
    sidebarAlso: true,
    groupStart:
      STORE_NAV_IDS.includes(i.id) && items.findIndex((x) => STORE_NAV_IDS.includes(x.id)) === idx
        ? STORES_NAV.group
        : CLINICAL_NAV_IDS.includes(i.id) &&
            items.findIndex((x) => CLINICAL_NAV_IDS.includes(x.id)) === idx
          ? CLINICAL_UI.group
          : undefined,
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
