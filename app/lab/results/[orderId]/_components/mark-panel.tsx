"use client";

import type { CheckDraft, PanelPreview } from "./lab-result-entry";
import type { EntryLine } from "@/components/emr/results/model";
import type { CouldNotCheckReason } from "@/lib/lab/criticals/marks";
import { useEffect, useRef } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { unitWords } from "@/lib/emr/unit-words";
import { LabButton } from "../../../_components/v2/button";

const P = CRITICALS_UI.panel;
const REASONS = Object.entries(CRITICALS_COPY.couldNotCheck) as [CouldNotCheckReason, string][];

/**
 * Mark as critical (§5.2, artboard 2). A region with a heading, beside the locked results, never a
 * pop-up over them (design rule 3). Focus moves to the heading when it opens and back to the row's
 * button when it closes (§10). Every caution is a sentence in amber with its icon (Law 4).
 */
export function MarkPanel({
  items,
  checks,
  onCheck,
  onUnmark,
  locked = [],
  note,
  onNote,
  second,
  onSecond,
  solo,
  onSolo,
  preview,
  pending,
  error,
  onCancel,
  onEdit,
  onRelease,
}: {
  items: {
    conceptId: string;
    display: string;
    line: EntryLine | null;
    direction: "low" | "high" | null;
  }[];
  checks: Record<string, CheckDraft>;
  onCheck: (conceptId: string, patch: Partial<CheckDraft>) => void;
  onUnmark: (conceptId: string) => void;
  /** Auto marks from the signed limits: they cannot be removed (CM-4). */
  locked?: readonly string[];
  note: string;
  onNote: (s: string) => void;
  second: string;
  onSecond: (s: string) => void;
  solo: string;
  onSolo: (s: string) => void;
  preview: PanelPreview;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onEdit: () => void;
  onRelease: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const problems = items.flatMap((i) => {
    const c = checks[i.conceptId];
    if (!c?.kind) return [`${i.display}: choose the check.`];
    if (c.kind === "repeated" && !/^-?\d+([.,]\d+)?$/.test(c.repeatValue.trim()))
      return [`${i.display}: type the repeat value.`];
    if (c.kind === "could_not_check" && !c.reason) return [`${i.display}: choose why.`];
    if (c.kind === "could_not_check" && c.reason === "other" && c.text.trim().length < 3)
      return [`${i.display}: say why.`];
    return [];
  });
  if (preview.secondCheck && !second && solo.trim().length < 3)
    problems.push("Second check: choose who checked, or say why you are working alone.");

  return (
    <section
      aria-labelledby="mark-panel-heading"
      className="border-border bg-card flex flex-col gap-5 self-start rounded-lg border p-4 lg:sticky lg:top-16"
    >
      <h2
        id="mark-panel-heading"
        ref={heading}
        tabIndex={-1}
        className="text-heading-s outline-none"
      >
        {P.heading}
      </h2>

      {items.map((i) => {
        const c = checks[i.conceptId];
        const unit = i.line?.unit ? (unitWords(i.line.unit) ?? i.line.unit) : "";
        const range =
          i.line && (i.line.low || i.line.high)
            ? `Laboratory range ${i.line.low || "…"}–${i.line.high || "…"}`
            : "No range typed";
        const name = `check-${i.conceptId}`;
        return (
          <fieldset
            key={i.conceptId}
            className="border-border flex flex-col gap-3 border-b pb-4 last:border-b-0"
          >
            <legend className="sr-only">{i.display}</legend>
            <div className="flex items-start justify-between gap-2">
              <p className="flex flex-col">
                <span className="text-display-s font-mono tabular-nums">
                  {i.line?.value || i.line?.code}
                  {unit ? <span className="text-body-m text-muted-foreground"> {unit}</span> : null}
                </span>
                <span className="text-body-s">
                  {i.display}
                  {i.direction ? `, ${i.direction}` : ""} ·{" "}
                  <span className="text-muted-foreground">{range}</span>
                </span>
              </p>
              {locked.includes(i.conceptId) ? (
                <span className="text-caption text-muted-foreground">
                  At or beyond the signed limit
                </span>
              ) : items.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onUnmark(i.conceptId)}
                  className="min-h-11 sm:min-h-7"
                >
                  {P.unmark}
                </Button>
              ) : null}
            </div>
            <div
              role="radiogroup"
              aria-label={`${P.check} — ${i.display}`}
              className="flex flex-col gap-2"
            >
              <span className="text-body-s font-medium">{P.check}</span>
              <Choice
                name={name}
                checked={c?.kind === "repeated"}
                onChange={() => onCheck(i.conceptId, { kind: "repeated" })}
              >
                {P.repeated}
              </Choice>
              {c?.kind === "repeated" ? (
                <label className="text-body-s ml-7 flex items-center gap-2">
                  <span className="text-muted-foreground">{P.repeatValue}</span>
                  <Input
                    value={c.repeatValue}
                    inputMode="decimal"
                    onChange={(e) => onCheck(i.conceptId, { repeatValue: e.target.value })}
                    className="min-h-11 w-28 text-right font-mono tabular-nums sm:min-h-9"
                  />
                  <span className="text-muted-foreground">{unit}</span>
                </label>
              ) : null}
              <Choice
                name={name}
                checked={c?.kind === "checked_not_repeated"}
                onChange={() => onCheck(i.conceptId, { kind: "checked_not_repeated" })}
              >
                {P.checkedNotRepeated}
              </Choice>
              <Choice
                name={name}
                checked={c?.kind === "could_not_check"}
                onChange={() => onCheck(i.conceptId, { kind: "could_not_check" })}
              >
                {P.couldNotCheck}
              </Choice>
              {c?.kind === "could_not_check" ? (
                <div className="ml-7 flex flex-col gap-2">
                  <select
                    aria-label={P.reason}
                    value={c.reason ?? ""}
                    onChange={(e) =>
                      onCheck(i.conceptId, {
                        reason: (e.target.value || null) as CouldNotCheckReason | null,
                      })
                    }
                    className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9"
                  >
                    <option value="">{P.reason}</option>
                    {REASONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {c.reason === "other" ? (
                    <Input
                      aria-label={P.otherText}
                      placeholder={P.otherText}
                      value={c.text}
                      maxLength={200}
                      onChange={(e) => onCheck(i.conceptId, { text: e.target.value })}
                      className="min-h-11 sm:min-h-9"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
            <label className="text-body-s flex min-h-11 items-start gap-2 sm:min-h-0">
              <input
                type="checkbox"
                checked={c?.sampleChecked ?? false}
                onChange={(e) => onCheck(i.conceptId, { sampleChecked: e.target.checked })}
                className="mt-0.5 size-4 shrink-0 accent-teal-600"
              />
              {CRITICALS_COPY.sampleChecks}
            </label>
          </fieldset>
        );
      })}

      <section aria-labelledby="who-alerted" className="flex flex-col gap-2">
        <h3 id="who-alerted" className="text-body-s font-medium">
          {P.who}
        </h3>
        {preview.reachedNobody ? (
          <Amber>{CRITICALS_COPY.emptyLevel}</Amber>
        ) : (
          <ul className="text-body-s flex flex-col gap-0.5">
            {preview.level0.map((p) => (
              <li key={`${p.name}${p.role}`}>
                {p.name} <span className="text-muted-foreground">· {p.role}</span>
              </li>
            ))}
          </ul>
        )}
        {preview.next ? (
          <div className="text-body-s flex flex-col gap-0.5">
            {preview.next.at ? (
              <span className="text-muted-foreground">{P.nextAt(preview.next.at)}</span>
            ) : null}
            {preview.next.people.map((p) => (
              <span key={`${p.name}${p.role}`}>
                {p.name} <span className="text-muted-foreground">· {p.role}</span>
              </span>
            ))}
          </div>
        ) : null}
        {preview.emptyLevels.length > 0 && !preview.reachedNobody ? (
          <Amber>{CRITICALS_COPY.emptyLevel}</Amber>
        ) : null}
        {preview.timesSigned ? null : <Amber>{CRITICALS_COPY.noResponseTimes}</Amber>}
        {preview.smsLive ? null : (
          <p className="text-body-s text-muted-foreground">{CRITICALS_UI.smsOff}</p>
        )}
      </section>

      <label className="text-body-s flex flex-col gap-1">
        <span className="text-muted-foreground">{P.note}</span>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          maxLength={280}
          rows={3}
          className="border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none"
        />
        <span className="text-caption text-muted-foreground self-end tabular-nums">
          {note.length}/280
        </span>
      </label>

      {preview.secondCheck ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-s font-medium">{P.secondCheck}</legend>
          <select
            aria-label={P.secondChecker}
            value={second}
            onChange={(e) => onSecond(e.target.value)}
            className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9"
          >
            <option value="">{P.secondChecker}</option>
            {preview.labUsers.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name}
              </option>
            ))}
          </select>
          {second ? null : (
            <Input
              aria-label={P.workingAlone}
              placeholder={P.workingAlone}
              value={solo}
              maxLength={200}
              onChange={(e) => onSolo(e.target.value)}
              className="min-h-11 sm:min-h-9"
            />
          )}
        </fieldset>
      ) : null}

      <p className="text-caption text-muted-foreground">{CRITICALS_COPY.panelFootnote}</p>
      {problems.length ? (
        <ul className="flex flex-col gap-1" aria-label="Before release">
          {problems.map((p) => (
            <li key={p}>
              <StatusWord tone="caution">{p}</StatusWord>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {error ? <StatusWord tone="caution">{error}</StatusWord> : null}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <LabButton
          type="button"
          onClick={onRelease}
          variant="primary"
          busy={pending}
          disabledReason={problems.length > 0 ? LABWS2.reasons.problemsAbove : null}
        >
          {pending ? "Releasing…" : P.release}
        </LabButton>
        <LabButton type="button" variant="secondary" onClick={onEdit} busy={pending}>
          {P.editResults}
        </LabButton>
        <LabButton type="button" variant="quiet" onClick={onCancel} busy={pending}>
          {P.cancel}
        </LabButton>
      </div>
    </section>
  );
}

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-teal-600"
      />
      {children}
    </label>
  );
}

function Amber({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-status-caution-bg text-body-s dark:text-status-caution-fg flex items-start gap-2 rounded-md px-3 py-2 text-amber-800">
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
