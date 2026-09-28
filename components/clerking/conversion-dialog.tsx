"use client";

import type { Conversion, ConversionLine, History, PendingChoice } from "@/lib/clerking/answers";
import type { Catalogue } from "@/lib/clerking/catalogue";
import type { Resolution } from "@/lib/clerking/convert";
import { useState } from "react";
import { LockIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markReviewed, resolveChoice } from "@/lib/clerking/convert";
import { Chip, Segmented } from "./controls";

/**
 * A v1 draft continued in the new format (legacy-conversion.v1.json, proposal §7): the choices
 * still to finish, and what became of every v1 answer. Opens by itself the first time the draft
 * opens (#12); nothing is asserted until the clinician picks (#6). A centred dialog (ADR 0161).
 */

export interface PregnancyWrite {
  pregnancyState: "pregnant" | "postpartum" | "not_pregnant" | "unknown";
  lnmp?: string;
  lnmpCertainty?: "sure" | "unsure";
}

export interface ConversionHandlers {
  /** recordPregnancy (the route of `pregnancy_status` and `lmp`); resolves true once written. */
  onRecordPregnancy?: (w: PregnancyWrite) => Promise<boolean>;
}

const PREGNANCY_WORDS: Record<string, string> = {
  pregnant: "Pregnant",
  postpartum: "Postpartum",
  not_pregnant: "Not pregnant",
  unknown: "Unknown",
};

const where = (x: { from: "complaint" | "ros"; answer: "yes" | "no" }) =>
  x.from === "complaint"
    ? "Presenting complaint"
    : `Systems review: ${x.answer === "yes" ? "present" : "absent"}`;

function Lock() {
  return <LockIcon aria-label="Restricted" className="text-muted-foreground size-3" />;
}

/** "Continued from the previous format": the strip above the step, while anything is open. */
export function ConversionStrip({ conv, onOpen }: { conv: Conversion; onOpen: () => void }) {
  const open = conv.pending.length;
  return (
    <p className="bg-card border-border text-body-s text-foreground flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-4 py-2.5">
      <StatusWord tone="neutral">Previous format</StatusWord>
      <span className="flex-1">
        {open
          ? `Continued from the previous format. ${open} ${open === 1 ? "answer" : "answers"} to finish.`
          : "Continued from the previous format."}
      </span>
      <Button size="sm" variant="secondary" onClick={onOpen}>
        {open ? "Finish" : "What was carried"}
      </Button>
    </p>
  );
}

export function ConversionDialog({
  cat,
  history,
  editable,
  act,
  open,
  onOpenChange,
  onHistory,
  on,
}: {
  cat: Catalogue;
  history: History;
  editable: boolean;
  /** Chart writes allowed (the pregnancy record). */
  act: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHistory: (fn: (h: History) => History) => void;
  on: ConversionHandlers;
}) {
  const conv = history.converted;
  if (!conv) return null;
  const close = () => {
    if (editable && !conv.reviewed) onHistory(markReviewed);
    onOpenChange(false);
  };
  const resolve = (id: string, r: Resolution) => onHistory((h) => resolveChoice(cat, h, id, r));
  const symLabel = (id: string) => cat.symptom(id)?.label ?? id;

  return (
    <EmrDialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      width="wide"
      sheet="tall"
      kicker="Continued from the previous format"
      title="What was carried across"
      description="This draft was started in the previous format. Each answer was carried across by the signed conversion table. Where one old answer could mean more than one thing, you choose; until then it counts as not asked."
      footer={
        <Button type="button" variant="primary" onClick={close}>
          {conv.pending.length ? "Finish later" : "Done"}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {conv.pending.length ? (
          <section aria-labelledby="conv-open" className="flex flex-col gap-3">
            <h3 id="conv-open" className="text-heading-s text-foreground">
              {`To finish (${conv.pending.length})`}
            </h3>
            <ul className="flex flex-col gap-3">
              {conv.pending.map((p) => (
                <li key={p.id} className="border-border rounded-md border px-4 py-3">
                  <PendingRow
                    p={p}
                    cat={cat}
                    history={history}
                    editable={editable}
                    act={act}
                    symLabel={symLabel}
                    onResolve={(r) => resolve(p.id, r)}
                    onRecordPregnancy={on.onRecordPregnancy}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="conv-lines" className="flex flex-col gap-2">
          <h3 id="conv-lines" className="text-heading-s text-foreground">
            {`Every answer from the previous format (${conv.lines.length})`}
          </h3>
          <ul className="divide-border flex flex-col divide-y">
            {conv.lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="text-body-s text-foreground min-w-48 font-medium">{l.label}</span>
                <span className="text-caption text-muted-foreground">{where(l)}</span>
                <span className="text-body-s text-foreground flex-1">
                  {lineWords(l, symLabel, history)}
                </span>
                {l.review ? <StatusWord tone="caution">Needs review</StatusWord> : null}
                {l.ask?.length ? (
                  <span className="text-caption text-muted-foreground">
                    {`Ask about: ${l.ask
                      .map(
                        (a) => cat.properties(l.to?.[0] ?? "").find((x) => x.id === a)?.label ?? a,
                      )
                      .join(", ")
                      .toLowerCase()}`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </EmrDialog>
  );
}

function lineWords(l: ConversionLine, symLabel: (id: string) => string, h: History): string {
  const to = (l.to ?? []).map(symLabel).join(", ");
  switch (l.result) {
    case "converted":
      return l.answer === "yes" ? `Recorded as ${to}` : `Recorded as no ${to.toLowerCase()}`;
    case "contradiction":
      return `Also recorded as present; kept as ${to}`;
    case "choose":
      return h.converted?.pending.some((p) => p.token === l.token && p.label === l.label)
        ? "To finish above"
        : "Finished";
    case "proposed":
      return h.converted?.pending.some((p) => p.token === l.token && p.label === l.label)
        ? "To confirm above"
        : "Confirmed";
    case "text":
      return "Kept as text";
    case "not_asked":
      return "Not carried: an absent narrow symptom does not rule out the broader one";
    case "left_out":
      return "Not carried";
    case "wrong_sex":
      return "Not carried: does not apply to this patient";
  }
}

function PendingRow({
  p,
  cat,
  history,
  editable,
  act,
  symLabel,
  onResolve,
  onRecordPregnancy,
}: {
  p: PendingChoice;
  cat: Catalogue;
  history: History;
  editable: boolean;
  act: boolean;
  symLabel: (id: string) => string;
  onResolve: (r: Resolution) => void;
  onRecordPregnancy?: (w: PregnancyWrite) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string[]>(p.propose ? [p.propose] : []);
  const [lnmp, setLnmp] = useState("");
  const [certainty, setCertainty] = useState<"sure" | "unsure" | null>(null);
  const [busy, setBusy] = useState(false);
  const prop =
    p.kind === "property" && p.symptom
      ? cat.properties(p.symptom).find((x) => x.id === p.property)
      : undefined;
  const single = p.kind === "activity" || p.kind === "pregnancy" || prop?.kind === "one";
  const toggle = (id: string) =>
    setPicked((cur) =>
      single
        ? cur[0] === id
          ? []
          : [id]
        : cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id],
    );
  const optionLabel = (id: string) => {
    if (p.kind === "symptom") return symLabel(id);
    if (p.kind === "property") return prop?.options.find((o) => o.id === id)?.label ?? id;
    if (p.kind === "activity")
      return cat.data.social_history.activity.find((o) => o.id === id)?.label ?? id;
    return PREGNANCY_WORDS[id] ?? id;
  };
  const question =
    p.kind === "symptom"
      ? "Which did the patient mean? Choose one or more."
      : p.kind === "property"
        ? `${symLabel(p.symptom ?? "")}: ${(prop?.label ?? "").toLowerCase()}?`
        : p.kind === "activity"
          ? p.propose
            ? "Recorded as no functional limitation. Confirm the activity level."
            : "Which activity level?"
          : p.kind === "pregnancy"
            ? "Pregnancy status was recorded in the previous format. Confirm it."
            : "The last menstrual period was recorded in the previous format, with no date. Enter the date.";
  const record = async (w: PregnancyWrite) => {
    if (!onRecordPregnancy) return;
    setBusy(true);
    const ok = await onRecordPregnancy(w);
    setBusy(false);
    if (ok) onResolve({ kind: "recorded" });
  };
  const canWrite =
    editable && (p.kind !== "pregnancy" && p.kind !== "lnmp" ? true : act && !!onRecordPregnancy);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-body-s text-foreground inline-flex items-center gap-1.5 font-medium">
          {p.label}
          {p.restricted ? <Lock /> : null}
        </span>
        <span className="text-caption text-muted-foreground">{where(p)}</span>
      </div>
      <p className="text-body-s text-foreground">{question}</p>
      {p.kind === "lnmp" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex w-48 flex-col gap-1.5">
            <label htmlFor={`conv-lnmp-${p.id}`} className="text-caption text-muted-foreground">
              First day of the last period
            </label>
            <Input
              id={`conv-lnmp-${p.id}`}
              type="date"
              value={lnmp}
              disabled={!canWrite}
              onChange={(e) => setLnmp(e.target.value)}
            />
          </div>
          <Segmented
            label="How sure"
            options={[
              { id: "sure", label: "Sure" },
              { id: "unsure", label: "Unsure" },
            ]}
            value={certainty}
            onPick={(v) => setCertainty((c) => (c === v ? null : v))}
            disabled={!canWrite}
          />
        </div>
      ) : (
        <div role="group" aria-label={question} className="flex flex-wrap gap-1.5 max-sm:gap-2">
          {p.options.map((o) => (
            <Chip
              key={o}
              selected={picked.includes(o)}
              disabled={!canWrite}
              onPress={() => toggle(o)}
            >
              {optionLabel(o)}
              {p.kind === "symptom" && cat.symptom(o)?.sensitivity !== "standard" ? <Lock /> : null}
            </Chip>
          ))}
        </div>
      )}
      {p.flag ? (
        <p className="text-caption text-muted-foreground">
          A caution flag stays on the Flags panel until this is finished.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {p.kind === "pregnancy" ? (
          <Button
            size="sm"
            disabled={!canWrite || busy || picked.length !== 1}
            onClick={() =>
              void record({ pregnancyState: picked[0] as PregnancyWrite["pregnancyState"] })
            }
          >
            Record pregnancy status
          </Button>
        ) : p.kind === "lnmp" ? (
          <Button
            size="sm"
            disabled={!canWrite || busy || !lnmp}
            onClick={() =>
              void record({
                pregnancyState: "unknown",
                lnmp,
                ...(certainty ? { lnmpCertainty: certainty } : {}),
              })
            }
          >
            Record the date
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!canWrite || !picked.length}
            onClick={() =>
              onResolve(
                p.kind === "symptom"
                  ? { kind: "symptoms", symptoms: picked }
                  : p.kind === "property"
                    ? { kind: "options", options: picked }
                    : { kind: "activity", value: picked[0]! },
              )
            }
          >
            {p.kind === "activity" ? "Confirm" : "Use this"}
          </Button>
        )}
        {p.text ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canWrite}
            onClick={() => onResolve({ kind: "text" })}
          >
            Keep as text
          </Button>
        ) : null}
        {(p.kind === "pregnancy" || p.kind === "lnmp") && !act ? (
          <span className="text-caption text-muted-foreground">
            The pregnancy record can be written only during an open visit.
          </span>
        ) : null}
      </div>
      {history.complaints.some((c) => c.key === p.complaintKey) ? (
        <p className="text-caption text-muted-foreground">
          Until you choose, the complaint stays as the words written.
        </p>
      ) : null}
    </div>
  );
}
