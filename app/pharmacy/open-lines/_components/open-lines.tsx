"use client";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type { OpenLineRow } from "@/lib/pharmacy/review/read";
import { useId, useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { TabList } from "@/components/medsync/tab-list";
import { CLOSE_REASONS, NOT_SUPPLIED_REASONS, REVIEW } from "@/content/pharmacy-review";
import {
  ChangeOutcomeButton,
  CloseLineDialog,
  FilledDialog,
  PrintSlipButton,
} from "../../_components/review-dialogs";

/**
 * Open lines (5.7): tabs All · Owed · Buying outside with counts in their names (Section 10); each row
 * says what was already supplied or when the slip was printed, the coded reason, and how long it has
 * been open, in words. Every action is a person's, in a centred dialog where it asks for a reason.
 */
type Tab = "all" | "owed" | "buying_outside";
const O = REVIEW.open;
const DAY = 86_400_000;

export function OpenLines(props: {
  hospitalName: string;
  pointName: string | null;
  rows: OpenLineRow[];
  identities: Record<string, PatientIdentity>;
  canChange: boolean;
  canClose: boolean;
  serverNow: string;
  timeZone: string;
  title: string;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const tableId = useId();
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: props.timeZone,
  });
  const when = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: props.timeZone,
  });
  const counts = {
    all: props.rows.length,
    owed: props.rows.filter((r) => r.outcome === "owed").length,
    buying_outside: props.rows.filter((r) => r.outcome === "buying_outside").length,
  };
  const shown = tab === "all" ? props.rows : props.rows.filter((r) => r.outcome === tab);
  const age = (iso: string) => {
    const days = Math.floor((Date.parse(props.serverNow) - Date.parse(iso)) / DAY);
    return days <= 0 ? O.today : O.ago(days);
  };
  const reason = (code: string | null) =>
    code
      ? ((NOT_SUPPLIED_REASONS as Record<string, string>)[code] ??
        (CLOSE_REASONS as Record<string, string>)[code] ??
        code)
      : "";
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${props.hospitalName} · ${props.title}`}
        placeInTopBar
        title={props.title}
        right={
          props.pointName ? (
            <span className="text-body-s text-muted-foreground">{props.pointName}</span>
          ) : null
        }
      />
      <TabList
        label={O.tabsLabel}
        controls={tableId}
        value={tab}
        options={(["all", "owed", "buying_outside"] as const).map((t) => ({
          value: t,
          label: O.tabs[t],
          count: counts[t],
        }))}
        onChange={setTab}
      />
      <div id={tableId} className="border-border bg-card overflow-x-auto rounded-lg border">
        <table className="text-body-s w-full">
          <caption className="sr-only">{`${props.title}: ${O.tabs[tab]}`}</caption>
          <thead className="text-caption text-muted-foreground border-border border-b text-left">
            <tr>
              <th className="px-3 py-2 font-medium">{O.columns.patient}</th>
              <th className="px-3 py-2 font-medium">{O.columns.medicine}</th>
              <th className="px-3 py-2 font-medium">{O.columns.outcome}</th>
              <th className="px-3 py-2 font-medium">{O.columns.reason}</th>
              <th className="px-3 py-2 font-medium">{O.columns.since}</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">{O.columns.action}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">
                  {O.empty}
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const who = props.identities[r.patientUserId] ?? {
                  name: "Name withheld",
                  mrn: "",
                  ageSex: "",
                };
                return (
                  <tr key={r.lineId} className="align-top">
                    <td className="px-3 py-3">
                      <span className="flex flex-col">
                        <span className="text-foreground font-medium">{who.name}</span>
                        <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                          {who.mrn}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-col">
                        <span>{r.medicine}</span>
                        {r.supplied > 0 ? (
                          <span className="text-muted-foreground text-caption">
                            {O.supplied(r.supplied, day.format(new Date(r.since)))}
                          </span>
                        ) : null}
                        {r.slipPrintedAt ? (
                          <span className="text-muted-foreground text-caption">
                            {O.slipPrinted(when.format(new Date(r.slipPrintedAt)))}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusWord tone="neutral">{REVIEW.outcome[r.outcome]}</StatusWord>
                    </td>
                    <td className="px-3 py-3">{reason(r.reasonCode)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono tabular-nums">
                        {day.format(new Date(r.since))}
                      </span>{" "}
                      · {age(r.since)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap justify-end gap-2">
                        {r.outcome === "buying_outside" && props.canClose ? (
                          <FilledDialog lineId={r.lineId} medicine={r.medicine} />
                        ) : null}
                        {props.canChange && !(r.outcome === "owed" && r.controlled) ? (
                          <ChangeOutcomeButton lineId={r.lineId} toOutside={r.outcome === "owed"} />
                        ) : null}
                        {r.outcome === "buying_outside" && props.canChange ? (
                          <PrintSlipButton lineId={r.lineId} />
                        ) : null}
                        {props.canClose ? (
                          <CloseLineDialog lineId={r.lineId} medicine={r.medicine} />
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
      <p className="text-body-s text-muted-foreground">{O.explainer}</p>
    </div>
  );
}
