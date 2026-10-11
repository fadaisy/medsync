"use client";

import type { EntryComponent, EntryLine, ResultEntryData } from "@/components/emr/results/model";
import type { CouldNotCheckReason } from "@/lib/lab/criticals/marks";
import { useRef, useState } from "react";

import { fixedFlag, toResultValues } from "@/components/emr/results/model";
import { useResultEntry } from "@/components/emr/results/result-entry";
import { ResultEntryView } from "@/components/emr/results/result-entry-view";
import { Button } from "@/components/ui/button";
import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";
import { releaseWithCriticalMarkAction } from "@/lib/lab/criticals/actions";
import { MarkPanel } from "./mark-panel";

export interface PanelPreview {
  level0: { name: string; role: string }[];
  next: { people: { name: string; role: string }[]; at: string | null } | null;
  emptyLevels: number[];
  reachedNobody: boolean;
  timesSigned: boolean;
  smsLive: boolean;
  secondCheck: boolean;
  labUsers: { userId: string; name: string }[];
}

export type CheckDraft = {
  kind: "repeated" | "checked_not_repeated" | "could_not_check" | null;
  repeatValue: string;
  reason: CouldNotCheckReason | null;
  text: string;
  sampleChecked: boolean;
};

const blank: CheckDraft = {
  kind: null,
  repeatValue: "",
  reason: null,
  text: "",
  sampleChecked: false,
};

/** Out of the lab's typed range, or flagged: the mark action is a quiet button in the row (§5.1). */
function outOfRange(line: EntryLine): boolean {
  if (["L", "H", "LL", "HH", "A"].includes(line.flag)) return true;
  const v = Number(line.value);
  if (!line.value || Number.isNaN(v)) return false;
  return (line.low !== "" && v < Number(line.low)) || (line.high !== "" && v > Number(line.high));
}

export function directionOf(line: EntryLine): "low" | "high" | null {
  if (line.flag === "L" || line.flag === "LL") return "low";
  if (line.flag === "H" || line.flag === "HH") return "high";
  const v = Number(line.value);
  if (!line.value || Number.isNaN(v)) return null;
  if (line.low !== "" && v < Number(line.low)) return "low";
  if (line.high !== "" && v > Number(line.high)) return "high";
  return null;
}

/**
 * Lab result entry with critical marks (Lab Phase 1 §5.1–§5.2, artboard 2; LAB_CRITICALS on). The
 * results stay visible and locked beside the Mark as critical panel; Release and alert writes the
 * report, the marks and the alert in one transaction (CM-2). A double tap replays on the panel's
 * client key (CA-8). Budget: Mark critical · Repeated · sample checks · Release and alert = 4 taps.
 */
export function LabResultEntry({
  data,
  preview,
}: {
  data: ResultEntryData;
  preview: PanelPreview;
}) {
  const e = useResultEntry(data, "lab");
  const [marked, setMarked] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<string, CheckDraft>>({});
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [second, setSecond] = useState("");
  const [solo, setSolo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  const returnTo = useRef<string | null>(null);
  const released = e.view.phase === "released";

  const openFor = (c: EntryComponent) => {
    returnTo.current = `mark-${c.conceptId}`;
    setMarked((m) => (m.includes(c.conceptId) ? m : [...m, c.conceptId]));
    setChecks((x) => ({ ...x, [c.conceptId]: x[c.conceptId] ?? blank }));
    setError(null);
    setOpen(true);
  };
  const close = (drop: boolean) => {
    setOpen(false);
    if (drop) {
      setMarked([]);
      setChecks({});
      setClientKey(crypto.randomUUID());
    }
    const id = returnTo.current;
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  const release = () =>
    e.start(async () => {
      setError(null);
      const r = await releaseWithCriticalMarkAction({
        surface: "lab",
        patientUserId: data.patientUserId,
        orderId: data.orderId,
        values: toResultValues(data.components, e.state),
        ...(e.state.conclusionCode ? { conclusionCode: e.state.conclusionCode } : {}),
        ...(e.state.conclusionText.trim() ? { conclusionText: e.state.conclusionText.trim() } : {}),
        marks: marked.map((conceptId) => {
          const c = checks[conceptId] ?? blank;
          return {
            conceptId,
            check:
              c.kind === "repeated"
                ? { kind: "repeated" as const, repeatValue: c.repeatValue.replace(",", ".").trim() }
                : c.kind === "could_not_check"
                  ? {
                      kind: "could_not_check" as const,
                      reason: c.reason ?? "other",
                      ...(c.text.trim() ? { text: c.text.trim() } : {}),
                    }
                  : { kind: "checked_not_repeated" as const },
            sampleChecked: c.sampleChecked,
            ...(second ? { secondCheckerId: second } : {}),
            ...(solo.trim() ? { soloReason: solo.trim() } : {}),
          };
        }),
        ...(note.trim() ? { note: note.trim() } : {}),
        clientKey,
      });
      if (!r.ok) return setError(r.error);
      const failed = r.data?.subState === "not_sent" || r.data?.deliveryFailed;
      setOpen(false);
      e.done(failed ? CRITICALS_COPY.notSent : "Released. The alert is sent.");
    });

  const view = {
    ...e.view,
    onSave: (status: "preliminary" | "final") =>
      status === "final" && marked.length > 0 ? setOpen(true) : e.view.onSave(status),
  };
  const P = CRITICALS_UI.panel;

  return (
    <div className={open ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]" : ""}>
      <ResultEntryView
        data={data}
        {...view}
        lockAll={open}
        releaseLabel={marked.length > 0 ? P.release : "Release final"}
        rowAction={(c, line) => {
          if (released || !(line.value || line.code)) return null;
          const isMarked = marked.includes(c.conceptId);
          return (
            <div className="flex">
              <Button
                id={`mark-${c.conceptId}`}
                type="button"
                size="sm"
                variant={isMarked || outOfRange(line) ? "secondary" : "ghost"}
                aria-pressed={isMarked}
                onClick={() => openFor(c)}
                disabled={e.pending}
                className="min-h-11 sm:min-h-7"
              >
                {isMarked ? P.marked : P.mark}
              </Button>
            </div>
          );
        }}
      />
      {open ? (
        <MarkPanel
          items={marked.map((id) => {
            const c = data.components.find((x) => x.conceptId === id)!;
            const line = e.state.lines[id];
            const f = line && c.fixed ? fixedFlag(c, line) : null;
            return {
              conceptId: id,
              display: c.display,
              line: line ?? null,
              // With fixed units the flag is computed (FL-1); otherwise the lab's own.
              direction: c.fixed
                ? f === "low" || f === "high"
                  ? f
                  : null
                : line
                  ? directionOf(line)
                  : null,
            };
          })}
          checks={checks}
          onCheck={(id, patch) =>
            setChecks((x) => ({ ...x, [id]: { ...(x[id] ?? blank), ...patch } }))
          }
          onUnmark={(id) => {
            const rest = marked.filter((m) => m !== id);
            setMarked(rest);
            if (rest.length === 0) close(true);
          }}
          note={note}
          onNote={setNote}
          second={second}
          onSecond={setSecond}
          solo={solo}
          onSolo={setSolo}
          preview={preview}
          pending={e.pending}
          error={error}
          onCancel={() => close(true)}
          onEdit={() => close(false)}
          onRelease={release}
        />
      ) : null}
    </div>
  );
}
