"use client";

import type { PrescriberRow } from "./prescribers";
import type { MedicinesCan } from "@/lib/pharmacy/medicines/read";
import type { RosterView } from "@/lib/pharmacy/roster/view";

import { useToast } from "@/components/pharmacy/medicines/shared";
import { LeaveSection } from "./leave";
import { LoadTable } from "./load";
import { OnDutyNow } from "./on-duty";
import { PeopleList } from "./people";
import { Prescribers } from "./prescribers";
import { Reminders } from "./reminders";
import { RosterCard } from "./roster-card";
import { RosterRuleBadges } from "./rule-badges";
import { SwapRequests } from "./swaps";
import { useRosterLive } from "./use-roster-live";

/** Set-up › People and roster (PEOPLE-ROSTER.md §0): the page order, top to bottom. */
export function RosterTab({
  view,
  prescribers,
  can,
}: {
  view: RosterView;
  prescribers: PrescriberRow[];
  /** Who may propose and sign rule changes (the Medicines permissions). */
  can: MedicinesCan;
}) {
  const [toastNode, toast] = useToast();
  useRosterLive(view.ready);
  const p = { view, toast };
  return (
    <div className="flex flex-col gap-4">
      <OnDutyNow {...p} />
      <RosterCard {...p} badges={<RosterRuleBadges {...p} can={can} />} />
      <SwapRequests {...p} />
      <LeaveSection {...p} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <LoadTable {...p} />
        <Reminders {...p} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PeopleList {...p} />
        <Prescribers prescribers={prescribers} />
      </div>
      {toastNode}
    </div>
  );
}

export interface SectionProps {
  view: RosterView;
  toast: (m: string) => void;
}
