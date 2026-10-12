"use client";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type { LookBackRow, SuppliedRow } from "@/lib/pharmacy/supply/read";
import Link from "next/link";
import { useId, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { expiryText } from "@/content/pharmacy-stock";
import { LOOK_BACK_REASONS, SUPPLY } from "@/content/pharmacy-supply";
import { cn } from "@/lib/utils";
import { TARGET } from "../../_components/review-dialogs";
import { CorrectDialog, LookBackDialog, ReverseDialog } from "../../_components/supply-dialogs";

/**
 * Supplied today and the look-back tab (5.7, wireframe §7.2). Time · patient · lines and quantities ·
 * batches · supplied by · reviewed by, newest first; the "Identified another way" filter for the
 * pharmacy in charge. Reverse (same day) and Correct the record are centred dialogs (5.7.1). A reversed
 * or corrected line stays listed, struck through and announced, with who and why (B-45, B-46).
 */
type Tab = "today" | "look_back";
const S = SUPPLY.supplied;

export function Supplied(props: {
  hospitalName: string;
  pointName: string | null;
  title: string;
  day: string;
  today: string;
  rows: SuppliedRow[];
  lookBack: LookBackRow[];
  identities: Record<string, PatientIdentity>;
  initialTab: Tab;
  canReverse: boolean;
  canCorrect: boolean;
  canReprint: boolean;
  canLookBack: boolean;
  timeZone: string;
}) {
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [anotherOnly, setAnotherOnly] = useState(false);
  const panel = useId();
  const dayId = useId();
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: props.timeZone,
  });
  const when = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: props.timeZone,
  });
  const who = (id: string) =>
    props.identities[id] ?? { name: "Name withheld", mrn: "", ageSex: "" };
  const shown = anotherOnly ? props.rows.filter((r) => r.identifiedAnotherWay) : props.rows;
  const waiting = props.lookBack.length;
  const tabs: { value: Tab; label: string; count: number | null; caution: boolean }[] = [
    {
      value: "today",
      label: props.day === props.today ? S.today : props.day,
      count: props.rows.length,
      caution: false,
    },
    {
      value: "look_back",
      label: waiting ? S.lookBack(waiting) : S.lookBackNone,
      count: null,
      caution: waiting > 0,
    },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${props.hospitalName} · ${S.title}`}
        placeInTopBar
        title={props.title}
        right={
          props.pointName ? (
            <span className="text-body-s text-muted-foreground">{props.pointName}</span>
          ) : null
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div
          role="tablist"
          aria-label={S.tabsLabel}
          className="bg-muted flex gap-0.5 rounded-md p-0.5"
        >
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              aria-controls={panel}
              onClick={() => setTab(t.value)}
              className={cn(
                "text-label focus-visible:shadow-focus inline-flex min-h-11 items-center gap-1.5 rounded-[5px] px-2.5 outline-none",
                tab === t.value
                  ? "bg-card text-foreground shadow-xs"
                  : "text-ink-600 hover:text-foreground",
              )}
            >
              {t.caution ? (
                <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                  {t.label}
                </StatusWord>
              ) : (
                t.label
              )}
              {t.count !== null ? (
                <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={dayId} className="text-caption">
              {S.day}
            </Label>
            <Input
              id={dayId}
              type="date"
              name="day"
              defaultValue={props.day}
              max={props.today}
              className="min-h-11"
            />
          </div>
          <Button type="submit" variant="secondary" className={TARGET}>
            {S.show}
          </Button>
        </form>
      </div>

      <div id={panel} role="tabpanel">
        {tab === "today" ? (
          <div className="flex flex-col gap-3">
            <label className="flex min-h-11 items-center gap-2 self-start">
              <input
                type="checkbox"
                checked={anotherOnly}
                onChange={(e) => setAnotherOnly(e.target.checked)}
              />
              <span className="text-body-s">{S.filter}</span>
            </label>
            <div className="border-border bg-card overflow-x-auto rounded-lg border">
              <table className="text-body-s w-full">
                <caption className="sr-only">{`${props.title}: ${S.count(shown.length)}`}</caption>
                <thead className="text-caption text-muted-foreground border-border border-b text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">{S.columns.time}</th>
                    <th className="px-3 py-2 font-medium">{S.columns.patient}</th>
                    <th className="px-3 py-2 font-medium">{S.columns.lines}</th>
                    <th className="px-3 py-2 font-medium">{S.columns.batches}</th>
                    <th className="px-3 py-2 font-medium">{S.columns.by}</th>
                    <th className="px-3 py-2 font-medium">{S.columns.reviewed}</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {shown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">
                        {S.empty}
                      </td>
                    </tr>
                  ) : (
                    shown.map((r) => {
                      const p = who(r.patientUserId);
                      return (
                        <tr key={r.handoverId} className="align-top">
                          <td className="px-3 py-3 font-mono whitespace-nowrap tabular-nums">
                            {time.format(new Date(r.at))}
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex flex-col">
                              <span className="text-foreground font-medium">{p.name}</span>
                              <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                                {p.mrn}
                              </span>
                              {r.collector === "representative" && r.collectorName ? (
                                <span className="text-caption text-muted-foreground">
                                  {S.collectedBy(r.collectorName, r.collectorRelationship ?? "")}
                                </span>
                              ) : r.collector === "ward_staff" ? (
                                <span className="text-caption text-muted-foreground">
                                  {S.wardStaff}
                                </span>
                              ) : null}
                              {r.identifiedAnotherWay ? (
                                <span className="text-caption">
                                  {S.another(r.identifiedAnotherWay)}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-3" colSpan={2}>
                            <ul className="flex flex-col gap-3">
                              {r.lines.map((l) => {
                                const struck = !!l.reversed || !!l.inError;
                                const batches = l.batches
                                  .map((b) => `${b.number} · ${expiryText(b)}`)
                                  .join(", ");
                                return (
                                  <li key={l.lineId} className="flex flex-col gap-1">
                                    <span className="grid gap-x-4 sm:grid-cols-2">
                                      <span className={struck ? "line-through" : undefined}>
                                        {struck ? (
                                          <span className="sr-only">{S.reversedSr} </span>
                                        ) : null}
                                        {l.medicine}{" "}
                                        <span className="font-mono tabular-nums">
                                          {l.quantity} {l.unit}
                                        </span>
                                      </span>
                                      <span
                                        className={cn(
                                          "font-mono tabular-nums",
                                          struck && "line-through",
                                        )}
                                      >
                                        {l.batches.map((b) => (
                                          <span key={b.number} className="block">
                                            {b.number} · {expiryText(b)}
                                            {l.batches.length > 1 ? ` · ${b.quantity}` : ""}
                                          </span>
                                        ))}
                                      </span>
                                    </span>
                                    {l.reversed ? (
                                      <span className="text-caption">
                                        {S.reversed(
                                          time.format(new Date(l.reversed.at)),
                                          l.reversed.cadre,
                                          l.reversed.reason,
                                        )}
                                      </span>
                                    ) : null}
                                    {l.inError ? (
                                      <span className="text-caption">{S.inError(l.inError)}</span>
                                    ) : null}
                                    {!struck && !l.controlled ? (
                                      <span className="flex flex-wrap gap-2">
                                        {props.canReverse && r.reversible ? (
                                          <ReverseDialog
                                            handoverId={r.handoverId}
                                            lineId={l.lineId}
                                            lede={`${l.medicine} · ${l.quantity} ${l.unit} · ${batches} · ${time.format(new Date(r.at))}`}
                                            quantity={l.quantity}
                                            unit={l.unit}
                                            batches={l.batches.map((b) => b.number).join(", ")}
                                          />
                                        ) : null}
                                        {props.canCorrect ? (
                                          <CorrectDialog
                                            handoverId={r.handoverId}
                                            lineId={l.lineId}
                                            lede={`${l.medicine} · ${l.quantity} ${l.unit} · ${batches}`}
                                          />
                                        ) : null}
                                      </span>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                          <td className="px-3 py-3">{r.suppliedBy}</td>
                          <td className="px-3 py-3">
                            <span className="flex flex-col gap-2">
                              <span>
                                {r.reviewed
                                  ? `${r.reviewed.cadre} · ${time.format(new Date(r.reviewed.at))}`
                                  : SUPPLY.handover.standard}
                              </span>
                              {r.labelMode === "by_hand" ? (
                                <span className="text-caption text-muted-foreground">
                                  {S.byHand}
                                </span>
                              ) : props.canReprint ? (
                                <Link
                                  href={`/pharmacy/labels/${r.handoverId}?reprint=1`}
                                  prefetch={false}
                                  className="text-body-s font-medium text-teal-700 underline-offset-4 hover:underline"
                                >
                                  {S.reprint}
                                </Link>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-lg border">
            <table className="text-body-s w-full">
              <caption className="sr-only">{S.lookBackNone}</caption>
              <thead className="text-caption text-muted-foreground border-border border-b text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">{SUPPLY.look.columns.time}</th>
                  <th className="px-3 py-2 font-medium">{SUPPLY.look.columns.patient}</th>
                  <th className="px-3 py-2 font-medium">{SUPPLY.look.columns.medicine}</th>
                  <th className="px-3 py-2 font-medium">{SUPPLY.look.columns.why}</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">{SUPPLY.look.looked}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {props.lookBack.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground px-3 py-8 text-center">
                      {SUPPLY.look.empty}
                    </td>
                  </tr>
                ) : (
                  props.lookBack.map((l) => {
                    const p = who(l.patientUserId);
                    const why = l.reasons.map((x) => LOOK_BACK_REASONS[x] ?? x).join("; ");
                    return (
                      <tr key={l.supplyId} className="align-top">
                        <td className="px-3 py-3 font-mono whitespace-nowrap tabular-nums">
                          {when.format(new Date(l.at))}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex flex-col">
                            <span className="text-foreground font-medium">{p.name}</span>
                            <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                              {p.mrn}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {l.medicine}{" "}
                          <span className="font-mono tabular-nums">
                            {l.quantity} {l.unit}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                            {why}
                          </StatusWord>
                        </td>
                        <td className="px-3 py-3">
                          {props.canLookBack ? (
                            <LookBackDialog supplyId={l.supplyId} lede={`${l.medicine} · ${why}`} />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
