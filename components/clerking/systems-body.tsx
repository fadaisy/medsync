"use client";

import type { HistoryBodyProps } from "./history-sections";
import type { History, SymptomEntry } from "@/lib/clerking/answers";
import type { Catalogue, RosSystemView, Symptom } from "@/lib/clerking/catalogue";
import type { Linked } from "@/lib/clerking/linkage";
import type { SystemStatus } from "@/lib/clerking/status";
import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, LinkIcon, PencilIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { PRESS } from "@/components/emr/orders/choice-chips";
import { Button } from "@/components/ui/button";
import { emptyEntry, nothingElse, setRos, updateRosDetail } from "@/lib/clerking/answers";
import { isRestricted, rosSystemsFor } from "@/lib/clerking/catalogue";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { systemStatuses } from "@/lib/clerking/status";
import { cn } from "@/lib/utils";
import { YesNoRow } from "./controls";
import { detailSummary } from "./model";
import { PropertyEditor } from "./property-editor";

/**
 * [03] Review of systems (§5.5): one row per system that applies to the patient's recorded sex
 * (C2), each with its status, its positives and "Nothing else" (the still-unasked, non-linked items
 * as no; Law 4). An open row lists its items in two columns. A symptom recorded in Complaint is a
 * linked, read-only answer that opens the complaint (D-CV-08). A "yes" offers Details, which opens
 * the centred pop-up with the property editor (ADR 0161); answering yes never opens it (D-CV-07).
 *
 * `SystemsView` is hook-free (the tap-count test presses its buttons); `SystemsBody` holds which
 * row is open and which symptom's details are showing.
 */

export interface SystemsViewProps extends HistoryBodyProps {
  open: string | null;
  onOpen: (system: string | null) => void;
  onDetails: (symptom: string, system: string) => void;
}

const has = (e: SymptomEntry | undefined) =>
  !!e && (!!e.duration || Object.keys(e.props).length > 0 || Object.keys(e.flags).length > 0);

const STATUS_TONE: Record<SystemStatus["tone"], string> = {
  done: "text-teal-700 dark:text-teal-300",
  partial: "text-foreground",
  open: "text-muted-foreground",
  required: "text-muted-foreground",
};

/** "9 positive · 2 with nothing to report · 3 not reviewed". */
export function rosSummary(statuses: readonly SystemStatus[]): string {
  const positive = statuses.reduce((n, s) => n + s.yes.length, 0);
  const clear = statuses.filter((s) => !s.yes.length && !s.open).length;
  const untouched = statuses.filter((s) => !s.yes.length && !s.no).length;
  return `${positive} positive · ${clear} with nothing to report · ${untouched} not reviewed`;
}

export function SystemsView(props: SystemsViewProps) {
  const { cat, history, onHistory, editable, open, onOpen, onDetails, onOpenComplaint } = props;
  const linked = linkedAnswers(cat, history.complaints);
  const systems = rosSystemsFor(cat, props.sex ?? null);
  const statuses = systemStatuses(cat, history, linked, props.sex ?? null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-body-s text-muted-foreground" aria-live="polite">
          {rosSummary(statuses)}
        </p>
        <span className="text-caption text-muted-foreground inline-flex items-center gap-1.5">
          <LinkIcon aria-hidden className="size-3" />
          Linked answers follow the complaint
        </span>
      </div>
      <ul aria-label="Systems" className="border-border divide-border divide-y rounded-lg border">
        {systems.map((sys, i) => (
          <SystemRow
            key={sys.id}
            cat={cat}
            sys={sys}
            status={statuses[i]!}
            history={history}
            linked={linked}
            isOpen={open === sys.id}
            editable={editable}
            onToggle={() => onOpen(open === sys.id ? null : sys.id)}
            onNothingElse={() =>
              onHistory((h) =>
                nothingElse(
                  h,
                  sys.items.map((s) => s.id),
                  new Set(linkedAnswers(cat, h.complaints).keys()),
                ),
              )
            }
            onAnswer={(id, a) => onHistory((h) => setRos(h, id, a))}
            onDetails={(id) => onDetails(id, sys.id)}
            onLinked={onOpenComplaint}
          />
        ))}
      </ul>
    </div>
  );
}

function SystemRow({
  cat,
  sys,
  status,
  history,
  linked,
  isOpen,
  editable,
  onToggle,
  onNothingElse,
  onAnswer,
  onDetails,
  onLinked,
}: {
  cat: Catalogue;
  sys: RosSystemView;
  status: SystemStatus;
  history: History;
  linked: ReadonlyMap<string, Linked>;
  isOpen: boolean;
  editable: boolean;
  onToggle: () => void;
  onNothingElse: () => void;
  onAnswer: (symptom: string, a: "yes" | "no") => void;
  onDetails: (symptom: string) => void;
  onLinked?: (complaintKey: string) => void;
}) {
  const label = (id: string) => sys.items.find((s) => s.id === id)?.label ?? id;
  const Chevron = isOpen ? ChevronDownIcon : ChevronRightIcon;
  return (
    <li data-system={sys.id} className={cn(isOpen && "bg-muted/30")}>
      <div className="flex items-center gap-2 py-1.5 pr-3 pl-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`clerking-ros-${sys.id}`}
          onClick={onToggle}
          className="focus-visible:shadow-focus grid min-h-10 min-w-0 flex-1 grid-cols-[16px_minmax(8rem,11rem)_minmax(6rem,8rem)_1fr] items-center gap-x-3 rounded-sm text-left outline-none pointer-coarse:min-h-11"
        >
          <Chevron aria-hidden className="text-muted-foreground size-4" />
          <span className="text-body-s text-foreground font-medium">{sys.label}</span>
          <span
            className={cn(
              "text-body-s",
              STATUS_TONE[status.tone],
              status.yes.length > 0 && "font-semibold",
            )}
          >
            {status.text}
          </span>
          <span className="text-body-s text-muted-foreground min-w-0 truncate">
            {status.yes.map(label).join(" · ")}
          </span>
        </button>
        {editable && status.open > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Nothing else in ${sys.label}`}
            className={cn("shrink-0 whitespace-nowrap", PRESS)}
            onClick={onNothingElse}
          >
            Nothing else
          </Button>
        ) : null}
      </div>
      {isOpen ? (
        <div
          id={`clerking-ros-${sys.id}`}
          className="grid gap-x-8 gap-y-0.5 px-4 pt-1 pb-3 sm:grid-cols-2"
        >
          {sys.items.map((s) => (
            <RosItem
              key={s.id}
              cat={cat}
              s={s}
              history={history}
              link={linked.get(s.id)}
              editable={editable}
              onAnswer={onAnswer}
              onDetails={onDetails}
              onLinked={onLinked}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

function RosItem({
  cat,
  s,
  history,
  link,
  editable,
  onAnswer,
  onDetails,
  onLinked,
}: {
  cat: Catalogue;
  s: Symptom;
  history: History;
  link: Linked | undefined;
  editable: boolean;
  onAnswer: (symptom: string, a: "yes" | "no") => void;
  onDetails: (symptom: string) => void;
  onLinked?: (complaintKey: string) => void;
}) {
  if (link)
    return (
      <div data-linked={s.id} className="flex min-h-[34px] items-center justify-between gap-3">
        <span className="text-body-s text-foreground">{s.label}</span>
        <button
          type="button"
          title="Open it in Complaint"
          aria-label={`${s.label}: ${link.answer === "yes" ? "yes" : "no"}, in complaint. Open the complaint`}
          onClick={() => onLinked?.(link.from)}
          className="text-caption text-muted-foreground hover:text-foreground focus-visible:shadow-focus inline-flex min-h-7 shrink-0 items-center gap-1 rounded-sm px-1.5 outline-none pointer-coarse:min-h-11"
        >
          <LinkIcon aria-hidden className="size-3" />
          {link.answer === "yes" ? "Yes, in complaint" : "No, in complaint"}
          <ChevronRightIcon aria-hidden className="size-3" />
        </button>
      </div>
    );
  const answer = history.ros[s.id];
  const detail = history.rosDetail[s.id];
  const filled = has(detail);
  const summary = answer === "yes" && filled ? detailSummary(cat, s, detail) : "";
  return (
    <div className="flex flex-col">
      <YesNoRow
        label={s.label}
        value={answer}
        restricted={isRestricted(s.sensitivity)}
        disabled={!editable}
        onAnswer={(a) => onAnswer(s.id, a)}
      >
        {answer === "yes" ? (
          <button
            type="button"
            data-details
            aria-haspopup="dialog"
            aria-label={`${filled ? "Details" : "Add details"}: ${s.label}`}
            aria-keyshortcuts="d"
            onClick={() => onDetails(s.id)}
            className={cn(
              "text-caption focus-visible:shadow-focus inline-flex min-h-7 items-center gap-1 rounded-sm border px-2 font-medium whitespace-nowrap outline-none pointer-coarse:min-h-11",
              PRESS,
              filled
                ? "border-border bg-card text-foreground hover:bg-muted"
                : "border-teal-600 bg-teal-50 text-teal-800",
            )}
          >
            <PencilIcon aria-hidden className="size-3" />
            {filled ? "Details" : "Add details"}
          </button>
        ) : null}
      </YesNoRow>
      {summary ? (
        <span className="text-caption text-muted-foreground -mt-0.5 truncate pb-1">{summary}</span>
      ) : null}
    </div>
  );
}

/* ─── The Details pop-up (§5.5, ADR 0161) ──────────────────────── */

export interface RosDetailsProps extends Pick<
  HistoryBodyProps,
  "cat" | "history" | "onHistory" | "editable" | "cautionFrom" | "patient"
> {
  /** The open symptom and its system, or null (closed). */
  open: { symptom: string; system: string } | null;
  onClose: () => void;
}

/** Hook-free: the dialog's parts are plain props, so the tests read and press them. */
export function RosDetails({
  cat,
  history,
  onHistory,
  editable,
  cautionFrom,
  patient,
  open,
  onClose,
}: RosDetailsProps) {
  const s = open ? cat.symptom(open.symptom) : undefined;
  const system = open
    ? cat.data.review_of_systems.systems.find((x) => x.id === open.system)?.label
    : undefined;
  const entry = (s && history.rosDetail[s.id]) || emptyEntry();
  const summary = s ? detailSummary(cat, s, entry) : "";
  return (
    <EmrDialog
      open={!!s}
      onOpenChange={(o) => (o ? undefined : onClose())}
      kicker={`Review of systems · ${system ?? ""}`}
      title={s?.label ?? ""}
      description={
        <>
          <span className="block">{summary || "Nothing recorded yet"}</span>
          {patient ? (
            <span className="text-caption block">
              <span>{patient.name}</span>{" "}
              <span className="font-mono tabular-nums">{patient.mrn}</span>
            </span>
          ) : null}
        </>
      }
      footer={
        s ? (
          <>
            {editable ? (
              <Button
                variant="ghost"
                className="sm:mr-auto"
                onClick={() => {
                  onHistory((h) => (h.ros[s.id] === "no" ? h : setRos(h, s.id, "no")));
                  onClose();
                }}
              >
                Change the answer to no
              </Button>
            ) : null}
            <Button className={PRESS} onClick={onClose}>
              Done
            </Button>
          </>
        ) : undefined
      }
    >
      {s ? (
        <PropertyEditor
          cat={cat}
          symptom={s}
          entry={entry}
          cautionFrom={cautionFrom}
          disabled={!editable}
          onEntry={(fn) => onHistory((h) => updateRosDetail(h, s.id, fn))}
        />
      ) : null}
    </EmrDialog>
  );
}

export function SystemsBody(props: HistoryBodyProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<RosDetailsProps["open"]>(null);
  return (
    <>
      <SystemsView
        {...props}
        open={open}
        onOpen={setOpen}
        onDetails={(symptom, system) => setDetails({ symptom, system })}
      />
      <RosDetails {...props} open={details} onClose={() => setDetails(null)} />
    </>
  );
}
