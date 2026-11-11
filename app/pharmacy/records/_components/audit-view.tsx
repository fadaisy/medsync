"use client";

import type { AuditCat, AuditEvent, AuditMovement } from "@/lib/pharmacy/audit/derive";
import { useMemo, useState } from "react";

import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel, Pill } from "@/components/tide/work/kit";
import { RC, RULES } from "@/content/pharmacy-rework-records";
import {
  AUDIT_CATS,
  canCorrect,
  filterEvents,
  personView,
  whoDidWhat,
} from "@/lib/pharmacy/audit/derive";
import { cn } from "@/lib/utils";
import { CorrectDialog } from "./correct-dialog";

const A = RC.audit;
const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});
export const fmt = (iso: string) => when.format(new Date(iso));

/** Words for an event's action key (`kind:<kind>`, `src:<table>[:<sub>]`). */
export function actionWords(key: string): string {
  const [k, a, b] = key.split(":");
  if (k === "kind") return RC.kinds[a!] ?? a!;
  if (a === "pharmacy_case_events" && b) return RC.caseEvents[b] ?? RC.sources[a]!;
  if (a === "pharmacy_risk_actions" && b)
    return RC.losses.actions[b as keyof typeof RC.losses.actions] ?? RC.sources[a]!;
  return RC.sources[a!] ?? a!;
}
const reasonWords = (r: string | null) =>
  r ? (RC.correct.reasons[r as keyof typeof RC.correct.reasons] ?? r.replace(/_/g, " ")) : "";

const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-full px-4 text-[13.5px] sm:min-h-9",
    on ? "bg-tide-navy-900 text-tide-on-band font-semibold" : "bg-card shadow-tide-card",
  );

/**
 * Records › Audit trail (PRD §6.6, prototype audit.js `AuditView`): filters, "who did what", the timeline, and Correct
 * on correctable lines. The period is in the URL (the server loads it); person, kind and flagged filter here.
 */
export function AuditView({
  events,
  me,
  inCharge,
}: {
  events: AuditEvent[];
  me: string;
  inCharge: boolean;
}) {
  const [cat, setCat] = useState<AuditCat | "all">("all");
  const [who, setWho] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [shown, setShown] = useState<number>(RULES.auditFirst);
  const [fix, setFix] = useState<AuditMovement | null>(null);
  const list = useMemo(
    () => filterEvents(events, { cat, who, flagged }),
    [events, cat, who, flagged],
  );
  const top = useMemo(() => whoDidWhat(events), [events]);
  const person = who ? personView(events, who) : null;
  const people = useMemo(
    () => [...new Set(events.map((e) => e.who).filter((w): w is string => !!w))].sort(),
    [events],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={A.person}
          value={who ?? ""}
          onChange={(e) => setWho(e.target.value || null)}
          className="bg-card rounded-tide-field h-11 px-3 text-[13.5px] shadow-[inset_0_0_0_1px_var(--color-ink-300)] sm:h-9"
        >
          <option value="">{A.everyone}</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          aria-label={A.kind}
          value={cat}
          onChange={(e) => setCat(e.target.value as AuditCat | "all")}
          className="bg-card rounded-tide-field h-11 px-3 text-[13.5px] shadow-[inset_0_0_0_1px_var(--color-ink-300)] sm:h-9"
        >
          <option value="all">{A.everyKind}</option>
          {AUDIT_CATS.map((c) => (
            <option key={c} value={c}>
              {RC.cats[c]}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={flagged}
          onClick={() => setFlagged(!flagged)}
          className={chip(flagged)}
        >
          {A.flagged}
        </button>
      </div>

      {person ? (
        <Panel
          title={person.who}
          action={
            <LabButton variant="text" size="sm" onClick={() => setWho(null)}>
              {A.everyone}
            </LabButton>
          }
        >
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                [person.n, A.personStats.actions, false],
                [person.late, A.personStats.late, person.late > 0],
                [person.noWitness, A.personStats.noWitness, person.noWitness > 0],
                [person.corrections, A.personStats.corrections, false],
              ] as const
            ).map(([n, k, warn]) => (
              <div key={k} className="flex flex-col">
                <dd className="text-heading-s tabular-nums">{n}</dd>
                <dt
                  className={cn("text-caption", warn ? "text-amber-800" : "text-muted-foreground")}
                >
                  {k}
                </dt>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-1.5">
            {person.byCat.map((x) => (
              <li
                key={x.k}
                title={`${RC.cats[x.k]}: ${x.v}`}
                className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-2"
              >
                <span className="text-caption text-ink-700 truncate">{RC.cats[x.k]}</span>
                <span className="bg-tide-sunken h-2 overflow-hidden rounded-full">
                  <span
                    className="bg-tide-cascade-2 block h-full rounded-full"
                    style={{ width: `${(x.v / Math.max(...person.byCat.map((y) => y.v))) * 100}%` }}
                  />
                </span>
                <span className="text-caption text-right tabular-nums">{x.v}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : top.length ? (
        <Panel title={A.whoTitle} note={A.whoNote}>
          <div className="overflow-x-auto">
            <table className="text-body-s w-full">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {A.whoCols.person}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    {A.whoCols.actions}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    {A.whoCols.late}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    {A.whoCols.noWitness}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {A.whoCols.corrections}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {top.map((t) => (
                  <tr key={t.who}>
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        onClick={() => setWho(t.who)}
                        className="min-h-9 text-left font-semibold hover:underline"
                      >
                        {t.who}
                      </button>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{t.n}</td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right tabular-nums",
                        t.late && "text-amber-800",
                      )}
                    >
                      {t.late}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right tabular-nums",
                        t.noWitness && "text-amber-800",
                      )}
                    >
                      {t.noWitness}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{t.corrections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel title={A.trailTitle} note={A.trailNote(list.length)}>
        {list.length === 0 ? (
          <EmptyState compact title={A.empty} next={A.emptyNext} />
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {list.slice(0, shown).map((e) => (
              <Entry
                key={e.key}
                e={e}
                onWho={setWho}
                onFix={
                  e.move && canCorrect(e.move, { userId: me, inCharge })
                    ? () => setFix(e.move)
                    : null
                }
              />
            ))}
          </ul>
        )}
        {list.length > shown ? (
          <LabButton variant="text" size="sm" onClick={() => setShown(shown + RULES.auditMore)}>
            {A.more(Math.min(RULES.auditMore, list.length - shown))}
          </LabButton>
        ) : null}
      </Panel>
      <p className="text-caption text-muted-foreground max-w-prose">{A.hint}</p>
      {fix ? <CorrectDialog m={fix} onClose={() => setFix(null)} /> : null}
    </div>
  );
}

/** One entry: a grid row on wide screens, stacked under 640 px. A corrected line is struck through. */
function Entry({
  e,
  onWho,
  onFix,
}: {
  e: AuditEvent;
  onWho: (w: string) => void;
  onFix: (() => void) | null;
}) {
  const m = e.move;
  return (
    <li className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[8.5rem_9rem_minmax(0,1fr)_auto] sm:items-start">
      <span className="text-caption tabular-nums">
        {fmt(e.at)}
        {e.happened ? (
          <span className="text-muted-foreground block">
            {A.happened} {fmt(e.happened)}
          </span>
        ) : null}
      </span>
      <span className="text-caption">
        {e.who ? (
          <button type="button" onClick={() => onWho(e.who!)} className="text-left hover:underline">
            {e.who}
          </button>
        ) : null}
      </span>
      <span className="text-body-s min-w-0">
        <span className="text-caption text-muted-foreground">{RC.cats[e.cat]} · </span>
        <span className={cn(m?.correctedAt && "line-through")}>{actionWords(e.action)}</span>
        {e.tags.map((t) => (
          <Pill key={t} tone="caution" className="ml-1.5 align-middle">
            {RC.tags[t]}
          </Pill>
        ))}
        <span className={cn("text-ink-700 block break-words", m?.correctedAt && "line-through")}>
          {e.detail}
        </span>
        {m?.correctedAt ? (
          <span className="text-caption text-ink-700 block">
            {A.corrected(
              fmt(m.correctedAt),
              m.correctedBy ?? "",
              reasonWords(m.correctedWhy).toLowerCase(),
            )}
          </span>
        ) : null}
        {e.witness ? (
          <span className="text-caption text-muted-foreground block">
            {A.cols.witness}: {e.witness}
          </span>
        ) : null}
        {e.reason ? (
          <span className="text-caption text-muted-foreground block">
            {A.cols.reason}: {reasonWords(e.reason)}
          </span>
        ) : null}
      </span>
      <span>
        {onFix ? (
          <LabButton size="sm" variant="secondary" onClick={onFix}>
            {A.correct}
          </LabButton>
        ) : null}
      </span>
    </li>
  );
}
