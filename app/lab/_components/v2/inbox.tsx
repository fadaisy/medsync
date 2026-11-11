import type { NeedsYouItem } from "@/lib/lab/needs-you";
import Link from "next/link";
import {
  ClipboardSignatureIcon,
  FlaskConicalIcon,
  GitCompareArrowsIcon,
  PackageIcon,
  PauseCircleIcon,
  TruckIcon,
} from "lucide-react";

import { RestrictedMark } from "@/components/emr/chips";
import { CriticalPill, CriticalTile } from "@/components/emr/status-word";
import { Ident } from "@/components/tide/work/kit";
import { fill, LABWS2 } from "@/content/lab-workspace-v2";
import { waited } from "@/lib/lab/needs-you";

const N = LABWS2.needsYou;
const ICON = {
  delta: GitCompareArrowsIcon,
  qc_hold: PauseCircleIcon,
  match: FlaskConicalIcon,
  overdue: TruckIcon,
  lot: PackageIcon,
  signature: ClipboardSignatureIcon,
} as const;

/** One Needs you row (5.3): tile (red only for a critical), what it is, two identifiers, how long, one action. */
export function InboxRow({
  item: i,
  now,
  identity,
}: {
  item: NeedsYouItem;
  now: Date;
  identity: { name: string | null; mrn: string | null } | undefined;
}) {
  const K = N.kinds;
  const title =
    i.kind === "alert"
      ? fill(K.alert, { test: i.title })
      : i.kind === "delta"
        ? fill(K.delta, { test: i.title })
        : i.kind === "qc_hold"
          ? i.count === 1
            ? K.qcHoldOne
            : fill(K.qcHold, { n: i.count ?? 0 })
          : i.kind === "match"
            ? i.count === 1
              ? K.matchOne
              : fill(K.match, { n: i.count ?? 0 })
            : i.kind === "overdue"
              ? fill(K.overdue, { test: i.title })
              : i.kind === "lot"
                ? fill(K.lot, { lot: i.title })
                : fill(K.signature, { item: i.title });
  const [partner, days] = i.kind === "overdue" ? (i.detail ?? "|").split("|") : [];
  const detail =
    i.kind === "alert" && i.detail
      ? fill(K.criticalEscalated, { level: i.detail })
      : i.kind === "overdue"
        ? fill(K.overdueDays, { partner: partner ?? "", n: days ?? "" })
        : i.kind === "match"
          ? K.matchValuesHidden
          : i.detail;
  const Icon = i.kind === "alert" ? null : ICON[i.kind];
  return (
    <li className="flex flex-wrap items-center gap-3 px-1 py-3">
      {Icon ? (
        <span
          aria-hidden
          className="bg-tide-sunken text-ink-700 grid size-9 shrink-0 place-items-center rounded-xl"
        >
          <Icon className="size-[18px]" />
        </span>
      ) : (
        <CriticalTile />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-s text-foreground flex flex-wrap items-center gap-2 font-medium">
          {title}
          {i.kind === "alert" ? <CriticalPill /> : null}
          {i.restricted ? <RestrictedMark /> : null}
        </span>
        <span className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-1.5">
          {identity ? (
            <>
              <span className="text-ink-700">{identity.name}</span>
              <Ident>{identity.mrn}</Ident>
              {detail ? <span>· {detail}</span> : null}
            </>
          ) : (
            detail
          )}
        </span>
      </div>
      <span className="text-caption text-ink-700 w-16 text-right tabular-nums">
        {waited(i.since, now)}
      </span>
      <Link
        href={i.href}
        prefetch={false}
        className="bg-card text-foreground hover:bg-ink-50 focus-visible:shadow-focus inline-flex h-[30px] items-center rounded-full px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none"
      >
        {N.actions[i.kind]}
      </Link>
    </li>
  );
}
