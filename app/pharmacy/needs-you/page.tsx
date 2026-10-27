import type { NeedsYouItem, NeedsYouKind } from "@/lib/pharmacy/workspace-v2/needs-you";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ClipboardCheckIcon,
  FileWarningIcon,
  HistoryIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SheetIcon,
  TruckIcon,
} from "lucide-react";

import { EmptyState } from "@/app/lab/_components/v2/kit";
import { FilterChips, SecondaryLink, SpaceHeader } from "@/app/lab/_components/v2/space";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_NEEDS_YOU as N } from "@/content/pharmacy-workspace-v2-needs-you";
import { filterNeedsYou, groupNeedsYou } from "@/lib/pharmacy/workspace-v2/needs-you";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { InboxRow, WorkGroup } from "../_components/v2/pieces";
import { needsYouFor } from "../_lib/needs-you";
import { pharmacyV2 } from "../_lib/v2";

export const metadata: Metadata = { title: "Needs you · Pharmacy" };
export const dynamic = "force-dynamic";

const ICON: Record<NeedsYouKind, LucideIcon> = {
  controlled: ScaleIcon,
  lookBack: HistoryIcon,
  downtime: SheetIcon,
  delivery: TruckIcon,
  requisition: PackageOpenIcon,
  confirm: PackageCheckIcon,
  reaction: FileWarningIcon,
  reconciliation: ClipboardCheckIcon,
  pack: ShieldCheckIcon,
};

const at = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});

function textOf(i: NeedsYouItem) {
  const t = N.text[i.kind];
  if (i.kind === "reaction" && i.attention) return N.text.reactionPastDue;
  if (typeof t === "string") return t;
  return i.n === 1 ? t.one : fill(t.many, { n: i.n });
}

/**
 * Needs you (GATE A §7, D-PW-06, board NeedsYou): one inbox over the existing sources, each shown only to someone
 * holding the permission that acts on it. Every row has one action, a link to the place where it is done.
 */
export default async function NeedsYouPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const v2 = await pharmacyV2();
  if (!v2.live) notFound();
  const [needs, sp] = await Promise.all([needsYouFor(v2), searchParams]);
  const kinds = [...new Set(needs.map((i) => i.kind))];
  const show = sp.show && kinds.includes(sp.show as NeedsYouKind) ? sp.show : "all";
  const groups = groupNeedsYou(filterNeedsYou(needs, show));
  const chips = [
    { key: "all", label: N.all, href: "/pharmacy/needs-you", count: needs.length },
    ...kinds.map((k) => ({
      key: k,
      label: N.kinds[k],
      href: `/pharmacy/needs-you?show=${k}`,
      count: needs.filter((i) => i.kind === k).length,
    })),
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <SpaceHeader
        chips={<FilterChips chips={chips} current={show} label={N.chipsLabel} />}
        note={N.note}
      />
      {needs.length === 0 ? (
        <EmptyState title={N.empty.title} why={N.empty.why} />
      ) : (
        groups.map((g) => (
          <WorkGroup
            key={g.group}
            title={N.groups[g.group]}
            explainer={g.group === "setup" ? N.groupNotes.setup : undefined}
            count={g.items.length}
          >
            {g.items.map((i) => (
              <InboxRow
                key={i.id}
                icon={ICON[i.kind]}
                text={textOf(i)}
                sub={i.detail}
                at={i.since ? fill(N.since, { at: at.format(new Date(i.since)) }) : undefined}
                attention={i.attention}
                action={<SecondaryLink href={i.href}>{N.actions[i.kind]}</SecondaryLink>}
              />
            ))}
          </WorkGroup>
        ))
      )}
    </div>
  );
}

