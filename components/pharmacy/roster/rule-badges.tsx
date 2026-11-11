"use client";

import type { SectionProps } from "./roster-tab";
import type { RuleItem } from "@/components/pharmacy/medicines/rules";
import type { BadgeGroup } from "@/content/pharmacy-roster";
import type { RosterView } from "@/lib/pharmacy/roster/view";
import Link from "next/link";
import { useState } from "react";

import { proposeRegistryRuleAction } from "@/app/pharmacy/setup/roster-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { RuleLine } from "@/components/pharmacy/medicines/rules";
import { linkBtn, newKey } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { MEDICINES } from "@/content/pharmacy-medicines";
import {
  ROSTER_BADGES as B,
  breakText,
  DOW_SHORT,
  LEAVE_KIND,
  ROSTER_RULE_GROUPS,
  SHIFT,
  shortDate,
  slotText,
} from "@/content/pharmacy-roster";
import { RULE_REGISTRY } from "@/content/pharmacy-rules";
import {
  attendanceOf,
  breaksFor,
  cellOf,
  coverage,
  daysBetween,
  dow,
  effStatus,
  isPharmacyPlace,
  licState,
  needsWitness,
  weekDates,
  weekStart,
} from "@/lib/pharmacy/derive/roster";
import { ruleText } from "@/lib/pharmacy/rules/registry";
import { cn } from "@/lib/utils";

const D = MEDICINES.rulesDlg;
type Issue = { t: string; red?: boolean; now: string[] };
const capped = (xs: string[], n: number) =>
  xs.length > n ? [...xs.slice(0, n), B.andMore(xs.length - n)] : xs;

/** §11's issue chips for the week shown, Pharmacy places only (the ward view has no rosters yet). */
function issuesOf(v: RosterView): Partial<Record<BadgeGroup["id"], Issue>> {
  const places = v.places.filter(isPharmacyPlace);
  const name = new Map(places.map((p) => [p.id, p.name]));
  const byId = new Map(v.people.map((p) => [p.userId, p]));
  const who = (u: string) => byId.get(u)?.name ?? "";
  const dates = weekDates(v.weekStart);
  const cov = coverage(v.duties, places, dates, byId);
  const gaps = cov.days.reduce((a, d) => a + d.gaps, 0);
  const unw: string[] = [];
  for (const p of places)
    for (const date of dates)
      for (const shift of ["day", "night"] as const) {
        if (!p.shifts.includes(shift)) continue;
        const c = cellOf(v.duties, date, p.id, shift);
        if (
          c.length &&
          needsWitness(
            c.map((u) => byId.get(u)),
            shift,
            p,
          )
        )
          unw.push(`${p.name}, ${DOW_SHORT[dow(date)]} ${SHIFT[shift].label.toLowerCase()}`);
      }
  const breaks = v.people.flatMap((p) =>
    breaksFor(v.duties, v.weekStart, p.userId, v.params).map((b) => `${p.name}: ${breakText(b)}`),
  );
  const open = v.requests.filter((r) => {
    const s = effStatus(r, v.duties, v.now);
    return s === "colleague" || s === "incharge";
  });
  const pend = v.leaves.filter((l) => l.status === "pending");
  const ex = v.people.filter((p) => licState(p, v.now.date, v.params) === "expired");
  const due = v.people.filter((p) => licState(p, v.now.date, v.params) === "soon");
  const att: { red: boolean; t: string }[] = [];
  for (const d of v.duties) {
    const p = name.get(d.placeId);
    if (!p || d.date !== v.now.date || d.shift === "call") continue;
    const min = v.attendance.find(
      (a) => a.userId === d.userId && a.date === d.date && a.shift === d.shift,
    )?.min;
    const a = attendanceOf(
      min ?? null,
      d.date,
      d.shift,
      places.find((x) => x.id === d.placeId)!,
      v.now,
      v.params,
    );
    if (a && a.kind !== "ok")
      att.push({
        red: a.kind === "none",
        t: `${who(d.userId)}: ${a.kind === "late" ? B.late(a.at) : B.notIn} (${SHIFT[d.shift].label.toLowerCase()}, ${p})`,
      });
  }
  const late = att.filter((a) => !a.red).length;
  const slot = (s: { placeId: string; date: string; shift: "day" | "night" | "call" }) =>
    slotText({ ...s, place: name.get(s.placeId) ?? "" });
  const out: Partial<Record<BadgeGroup["id"], Issue>> = {};
  if (gaps) out.cover = { t: B.gaps(gaps), now: [B.nobody(cov.empty), B.single(cov.unwitnessed)] };
  if (unw.length) out.witness = { t: B.unwitnessed(unw.length), now: capped(unw, 4) };
  if (breaks.length) out.rest = { t: B.breaks(breaks.length), red: true, now: capped(breaks, 5) };
  if (open.length)
    out.swap = {
      t: B.open(open.length),
      now: open.map(
        (r) =>
          `${who(r.fromUser)} → ${who(r.toUser)}: ${slot(r.give)}${r.take ? ` ⇄ ${slot(r.take)}` : ""}${
            effStatus(r, v.duties, v.now) === "colleague"
              ? B.waitingFor(who(r.toUser).split(" ")[0]!)
              : B.waitingApproval
          }`,
      ),
    };
  if (pend.length)
    out.leave = {
      t: B.toApprove(pend.length),
      now: pend.map(
        (l) =>
          `${who(l.userId)}: ${LEAVE_KIND[l.kind].toLowerCase()}, ${shortDate(l.from)}${l.to !== l.from ? `–${shortDate(l.to)}` : ""}`,
      ),
    };
  if (ex.length || due.length)
    out.licence = {
      t: B.licence(ex.length, due.length),
      red: ex.length > 0,
      now: [
        ...ex.map((p) => B.licExpired(p.name, shortDate(p.licence!.expiresOn))),
        ...due.map((p) =>
          B.licDue(
            p.name,
            shortDate(p.licence!.expiresOn),
            daysBetween(v.now.date, p.licence!.expiresOn),
          ),
        ),
      ],
    };
  if (att.length)
    out.attend = {
      t: B.attend(late, att.length - late),
      red: att.length > late,
      now: att.map((a) => a.t),
    };
  if (!v.weekPublished && v.weekStart >= weekStart(v.now.date))
    out.pub = { t: B.notPublished, now: [B.draft] };
  return out;
}

/** A badge group's lines: the hospital's signed text over the default, numbers from the signed registry rule. */
function linesOf(g: BadgeGroup, v: RosterView) {
  const grp = `rb_${g.id}`;
  const signed = (k: string) => v.rules.find((r) => r.rule_group === grp && r.key === k)?.text;
  const prop = (group: string, key: string) =>
    v.proposals.find((p) => p.group === group && p.key === key) ?? null;
  const lines = g.rules.map((r, i) => {
    const reg = r.n
      ? RULE_REGISTRY.find((x) => x.key === "roster")?.rules.find((x) => x.key === r.n)
      : undefined;
    if (reg?.param) {
      const n =
        v.rules.find((x) => x.rule_group === "roster" && x.key === r.n)?.params?.n ?? reg.param.n;
      // "{n} people" keeps the bare number; "{n} ahead" takes its unit ("7 days").
      const rest = r.text.slice(r.text.indexOf("{n}") + 3);
      const shown = rest.includes(reg.param.unit)
        ? String(n)
        : ruleText({ text: "{n}", param: reg.param }, n);
      return {
        item: {
          group: "roster",
          key: r.n!,
          text: r.text.replace("{n}", shown),
          productId: null,
          proposal: prop("roster", r.n!),
        },
        numeric: String(n),
      };
    }
    const key = String(i);
    return {
      item: {
        group: grp,
        key,
        text: signed(key) ?? r.text,
        productId: null,
        proposal: prop(grp, key),
      },
    };
  });
  const extra = [
    ...v.rules
      .filter((r) => r.rule_group === grp && Number(r.key) >= g.rules.length)
      .map((r) => r.key),
    ...v.proposals
      .filter((p) => p.group === grp && Number(p.key) >= g.rules.length)
      .map((p) => p.key),
  ];
  for (const key of [...new Set(extra)].sort((a, b) => Number(a) - Number(b)))
    lines.push({
      item: {
        group: grp,
        key,
        text: signed(key) ?? D.newRule,
        productId: null,
        proposal: prop(grp, key),
      },
    });
  return { lines, next: String(Math.max(g.rules.length - 1, ...extra.map(Number)) + 1) };
}

type Can = { propose: boolean; signInCharge: boolean; signSecond: boolean } | null;

/** §3.3: `Rules`, then one pill per group with its issue chip and `n to sign`; each opens the group's dialog (§11). */
export function RosterRuleBadges({ view, toast, can }: SectionProps & { can: Can }) {
  const [openId, setOpenId] = useState<BadgeGroup["id"] | null>(null);
  if (!view.ready) return null;
  const issues = issuesOf(view);
  const group = ROSTER_RULE_GROUPS.find((g) => g.id === openId) ?? null;
  return (
    <>
      <div role="group" aria-label={B.groupAria} className="flex flex-wrap items-center gap-1.5">
        <span className="text-ink-600 mr-0.5 text-[12px] font-semibold">{B.rules}</span>
        {ROSTER_RULE_GROUPS.map((g) => {
          const is = issues[g.id];
          const { lines } = linesOf(g, view);
          // Two lines can share one number (people per shift): count each proposal once.
          const pending = new Set(
            lines.flatMap((l) => (l.item.proposal ? [l.item.proposal.id] : [])),
          ).size;
          return (
            <button
              key={g.id}
              type="button"
              aria-haspopup="dialog"
              aria-label={B.badgeAria(g.scope, lines.length, is?.t ?? null, pending)}
              onClick={() => setOpenId(g.id)}
              className="bg-tide-sunken text-foreground hover:bg-ink-200 inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap"
            >
              {g.scope} <span className="text-ink-600 font-medium">· {lines.length}</span>
              {is ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px]",
                    is.red
                      ? "bg-status-critical-bg text-status-critical-fg-aa"
                      : "bg-status-caution-bg text-status-caution-fg-aa",
                  )}
                >
                  {is.t}
                </span>
              ) : null}
              {pending ? (
                <span className="bg-status-caution-bg text-status-caution-fg-aa rounded-full px-1.5 text-[11px]">
                  {B.toSign(pending)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <RosterRulesDialog
        group={group}
        issue={group ? issues[group.id] : undefined}
        view={view}
        can={can}
        toast={toast}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function RosterRulesDialog({
  group: g,
  issue,
  view,
  can,
  toast,
  onClose,
}: {
  group: BadgeGroup | null;
  issue: Issue | undefined;
  view: RosterView;
  can: Can;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const data = g ? linesOf(g, view) : null;
  const propose = (it: RuleItem, numeric: boolean) => async (value: string, why: string) => {
    const r = await proposeRegistryRuleAction({
      clientKey: newKey(),
      group: it.group,
      key: it.key,
      n: numeric ? Number(value) : null,
      newText: numeric ? null : value,
      reason: why,
    });
    if (r.ok) setAdding(false);
    return r;
  };
  const mcan = can ? { ...can, edit: false, levels: false, review: false, request: false } : null;
  return (
    <EditorDialog
      open={!!g}
      onOpenChange={(o) => !o && (setAdding(false), onClose())}
      width="medium"
    >
      {g && data ? (
        <>
          <div className="flex items-start justify-between gap-3 px-6 pt-5">
            <div className="flex flex-col gap-1">
              <DialogTitle>{D.title(g.scope)}</DialogTitle>
              <span className="text-body-s text-ink-600">{g.affects}</span>
            </div>
            <LabButton variant="text" onClick={onClose}>
              {D.close}
            </LabButton>
          </div>
          <ul className="divide-border flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6 py-3 [&>li]:py-2.5">
            {data.lines.map((l, i) => (
              <RuleLine
                key={i}
                item={l.item}
                can={mcan}
                toast={toast}
                numeric={"numeric" in l ? l.numeric : undefined}
                propose={propose(l.item, "numeric" in l)}
              />
            ))}
            {adding ? (
              <RuleLine
                item={{
                  group: `rb_${g.id}`,
                  key: data.next,
                  text: "",
                  label: D.newRule,
                  productId: null,
                  proposal: null,
                }}
                can={mcan}
                toast={toast}
                propose={propose(
                  {
                    group: `rb_${g.id}`,
                    key: data.next,
                    text: "",
                    productId: null,
                    proposal: null,
                  },
                  false,
                )}
                onCancel={() => setAdding(false)}
              />
            ) : null}
          </ul>
          <div className="flex flex-col gap-3 px-6 pb-3">
            {can?.propose && !adding ? (
              <button
                type="button"
                className={cn(linkBtn, "w-fit")}
                onClick={() => setAdding(true)}
              >
                {B.addRule}
              </button>
            ) : null}
            {issue ? (
              <div className="bg-ink-50 flex flex-col gap-1 rounded-xl px-3 py-2.5 text-[13px] leading-[18px]">
                <span className="text-ink-700 text-[12px] font-bold">{B.thisWeek}</span>
                {issue.now.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="border-border text-body-s text-ink-700 flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
            <span>{D.footer}</span>
            <Link href="/pharmacy/setup?tab=rules" className={linkBtn}>
              {D.seeAll}
            </Link>
          </div>
        </>
      ) : null}
    </EditorDialog>
  );
}
