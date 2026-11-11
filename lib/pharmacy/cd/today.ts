import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { TodayItem } from "@/lib/pharmacy/derive/today-types";

import { CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { caseFlags, dur } from "@/lib/pharmacy/cases/derive";
import { loadCases } from "@/lib/pharmacy/cases/read";
import { cdFlags, FLAG_ORDER } from "@/lib/pharmacy/cd/derive";
import { loadCd } from "@/lib/pharmacy/cd/read";
import { hm, when } from "@/lib/pharmacy/cd/sql";
import { isInCharge } from "@/lib/pharmacy/cd/store";
import { hoFlags, hoMine } from "@/lib/pharmacy/handover/derive";
import { loadHandovers } from "@/lib/pharmacy/handover/read";

const appDb = async () => (await import("@/db")).db as unknown as EmrDb;
const C = "/pharmacy/controls";
const durWords = (ms: number) => {
  const d = dur(ms);
  return fill(CTL.common[d.unit === "min" ? "minutes" : d.unit === "h" ? "hours" : "days"], {
    n: d.n,
  });
};

/**
 * Today (rework PRD §6.1), kinds `handover`, `case`, `cd` and `paper`. Handovers: one's own station's due, missed and
 * not-matching items and handovers waiting for one to accept (every station for the in-charge). Cases: who needs to
 * act (`caseFlags`). Controlled drugs: one item for what is to fix, and one for the in-charge's paper witnesses.
 */
export async function controlsTodayItems(
  input: { hospitalId: string; userId: string; station: string | null; now?: Date },
  database?: EmrDb,
): Promise<TodayItem[]> {
  const db = database ?? (await appDb());
  const now = input.now ?? new Date();
  const [cd, ho, cases, inCharge] = await Promise.all([
    loadCd(db, input.hospitalId),
    loadHandovers(db, input.hospitalId),
    loadCases(db, input.hospitalId),
    isInCharge(db, input.userId, input.hospitalId),
  ]);
  const placeName = new Map([...cd.places, ...ho.places].map((p) => [p.id, p.name]));
  const items: TodayItem[] = [];

  for (const h of ho.handovers)
    if (!h.acceptedAt && h.toUserId === input.userId)
      items.push({
        kind: "handover",
        key: `handover:accept:${h.id}`,
        title: fill(CTL.handover.acceptToday, { from: h.from }),
        meta: fill(CTL.today.acceptMeta, { place: placeName.get(h.placeId) ?? "" }),
        action: CTL.today.accept,
        href: `${C}/handover`,
      });
  for (const f of hoMine(hoFlags({ ...ho, now: now.getTime() }), inCharge, input.station)) {
    const place = placeName.get(f.placeId) ?? "";
    if (f.k === "due") {
      const late = now.getTime() - f.slot;
      items.push({
        kind: "handover",
        key: `handover:due:${f.id}`,
        title: fill(CTL.handover.flagDue, {
          place,
          when:
            late > 0
              ? fill(CTL.handover.flagDueLate, { n: Math.round(late / 60_000) })
              : fill(CTL.handover.flagDueAt, { time: hm(f.slot) }),
        }),
        meta: CTL.handover.flagDueMeta,
        action: CTL.today.start,
        href: `${C}/handover`,
        late: late > 0,
      });
    } else if (f.k === "miss")
      items.push({
        kind: "handover",
        key: `handover:miss:${f.id}`,
        title: fill(CTL.handover.flagMiss, { place, when: when(f.slot) }),
        meta: CTL.handover.toActNote,
        action: CTL.handover.actExplain,
        href: `${C}/handover`,
        late: true,
      });
    else
      items.push({
        kind: "handover",
        key: `handover:diff:${f.id}`,
        title: fill(CTL.handover.flagDiff, {
          med: f.line.medicineName,
          place,
          counted: f.line.counted,
          expected: f.line.expected,
        }),
        meta: fill(CTL.handover.flagDiffMeta, {
          when: when(f.handover.at),
          from: f.handover.from,
          to: f.handover.to,
          cd: f.line.controlled ? CTL.handover.flagDiffCd : "",
        }),
        action: f.line.controlled ? CTL.handover.actCd : CTL.handover.actResolve,
        href: f.line.controlled ? `${C}/cd?tab=flags` : `${C}/handover`,
      });
  }

  for (const { c, why } of caseFlags(cases, input.userId, inCharge, now))
    items.push({
      kind: "case",
      key: `case:${c.id}`,
      title: fill(CTL.caseFlag.title, { med: c.medicineName, place: c.placeName }),
      meta:
        why === "not_assigned"
          ? CTL.caseFlag.notAssigned
          : why === "signoff"
            ? CTL.caseFlag.signoff
            : why === "overdue"
              ? fill(CTL.caseFlag.overdue, {
                  t: durWords(now.getTime() - c.dueAt.getTime()),
                  owner: c.owner ?? CTL.cases.notAssigned,
                })
              : fill(CTL.caseFlag.yours, { t: durWords(c.dueAt.getTime() - now.getTime()) }),
      action: CTL.caseFlag.open,
      href: `${C}/cases?case=${c.id}`,
      late: why === "overdue",
    });

  const flags = cdFlags({ ...cd, now });
  const toFix = flags.filter((f) => f.k !== "paper");
  if (toFix.length) {
    const by = FLAG_ORDER.filter((k) => k !== "paper")
      .map((k) => [k, toFix.filter((f) => f.k === k).length] as const)
      .filter(([, n]) => n > 0);
    items.push({
      kind: "cd",
      key: "cd:to-fix",
      title: fill(CTL.today.cd, { n: toFix.length }),
      meta: by.map(([k, n]) => `${n} ${CTL.flags.summary[k][n === 1 ? 0 : 1]}`).join(" · "),
      action: CTL.today.check,
      href: `${C}/cd?tab=flags`,
      late: toFix.some((f) => f.k === "disc"),
    });
  }
  const paper = flags.filter((f) => f.k === "paper").length;
  if (paper && inCharge)
    items.push({
      kind: "paper",
      key: "paper:cd",
      title: paper === 1 ? CTL.today.paperOne : fill(CTL.today.paper, { n: paper }),
      meta: CTL.today.paperMeta,
      action: CTL.today.review,
      href: `${C}/cd?tab=paper`,
    });
  return items;
}
