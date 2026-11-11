"use client";

import type { AgeUnit } from "../../ranges/_lib/ages";
import { useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { LabButton } from "@/components/tide/work/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { saveLimitsDraftAction, signLimitsAsLeadAction } from "@/lib/lab/measures-actions";
import { Said, useAct } from "../../criticals/_components/setup-forms";
import { toDays } from "../../ranges/_lib/ages";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";

export interface LimitRowDraft {
  key: string;
  component: string;
  from: string;
  fromUnit: AgeUnit;
  to: string;
  toUnit: AgeUnit;
  low: string;
  high: string;
  referenceId: string;
  source: string;
}

const blank = (): LimitRowDraft => ({
  key: crypto.randomUUID(),
  component: "",
  from: "",
  fromUnit: "years",
  to: "",
  toUnit: "years",
  low: "",
  high: "",
  referenceId: "",
  source: "",
});

/**
 * The hospital's critical limits (§5.8, artboard 11). Test · unit (from the catalogue) · applies
 * to · critical at or below · critical at or above · reference id · source. Empty "applies to" means
 * all ages. An empty limit never fires. Nothing is pre-filled (Law 5, D-LAB1-10).
 */
export function LimitsEditor({
  components,
  initial,
  draftId,
  canSign,
  authoredByMe,
}: {
  components: { value: string; label: string; unit: string }[];
  initial: LimitRowDraft[];
  draftId: string | null;
  canSign: boolean;
  authoredByMe: boolean;
}) {
  const { pending, message, act, setMessage } = useAct();
  const [rows, setRows] = useState<LimitRowDraft[]>(initial.length ? initial : [blank()]);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const patch = (k: string, p: Partial<LimitRowDraft>) =>
    setRows((r) => r.map((x) => (x.key === k ? { ...x, ...p } : x)));
  const save = () =>
    act(
      () =>
        saveLimitsDraftAction({
          limits: rows.map((r) => {
            const [testId, conceptId] = r.component.split(":");
            return {
              testId,
              conceptId,
              ageFromDays: toDays(r.from, r.fromUnit),
              ageToDays: toDays(r.to, r.toUnit),
              low: r.low.trim() ? r.low.trim() : null,
              high: r.high.trim() ? r.high.trim() : null,
              referenceId: r.referenceId,
              source: r.source,
            };
          }),
        }),
      "Draft saved. MedSync does not flag with it until the laboratory lead and the CSO have signed.",
    );
  const sign = () =>
    act(async () => {
      const r = await signLimitsAsLeadAction({
        versionId: draftId,
        exceptionNote: note.trim() || null,
      });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, "Signed as laboratory lead. The CSO signs next; until then the signed set stays in force.");
  return (
    <section
      aria-labelledby="limits-heading"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="limits-heading" className="text-heading-s">
        Limits
      </h2>
      <div className="overflow-auto">
        <table className="text-body-s w-full border-collapse text-left">
          <thead>
            <tr className="text-caption text-muted-foreground">
              {[
                "Test and unit",
                "Applies from age",
                "to age",
                "Critical at or below",
                "Critical at or above",
                "Reference id",
                "Source",
                "Actions",
              ].map((h) => (
                <th key={h} scope="col" className="px-1 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="align-top">
                <td className="px-1 py-1">
                  <select
                    aria-label={`Limit ${i + 1} test`}
                    value={r.component}
                    onChange={(e) => patch(r.key, { component: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Choose</option>
                    {components.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label} ({c.unit})
                      </option>
                    ))}
                  </select>
                </td>
                {(["from", "to"] as const).map((k) => (
                  <td key={k} className="px-1 py-1">
                    <span className="flex gap-1">
                      <Input
                        aria-label={`Limit ${i + 1} age ${k}`}
                        value={r[k]}
                        onChange={(e) => patch(r.key, { [k]: e.target.value })}
                        inputMode="numeric"
                        placeholder="All"
                        className="min-h-11 w-16 tabular-nums sm:min-h-9"
                      />
                      <select
                        aria-label={`Limit ${i + 1} age ${k} unit`}
                        value={r[`${k}Unit`]}
                        onChange={(e) => patch(r.key, { [`${k}Unit`]: e.target.value as AgeUnit })}
                        className={selectClass}
                      >
                        <option value="days">days</option>
                        <option value="months">months</option>
                        <option value="years">years</option>
                      </select>
                    </span>
                  </td>
                ))}
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Limit ${i + 1} critical at or below`}
                    value={r.low}
                    onChange={(e) => patch(r.key, { low: e.target.value })}
                    inputMode="decimal"
                    className="min-h-11 w-24 text-right tabular-nums sm:min-h-9"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Limit ${i + 1} critical at or above`}
                    value={r.high}
                    onChange={(e) => patch(r.key, { high: e.target.value })}
                    inputMode="decimal"
                    className="min-h-11 w-24 text-right tabular-nums sm:min-h-9"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Limit ${i + 1} reference id`}
                    value={r.referenceId}
                    onChange={(e) => patch(r.key, { referenceId: e.target.value })}
                    className="min-h-11 w-28 font-mono sm:min-h-9"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Limit ${i + 1} source`}
                    value={r.source}
                    onChange={(e) => patch(r.key, { source: e.target.value })}
                    placeholder="The lab's call list; RCPath G158 App. A"
                    className="min-h-11 min-w-56 sm:min-h-9"
                  />
                </td>
                <td className="px-1 py-1">
                  <LabButton
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                    disabledReason={rows.length === 1 ? LABWS2_SETUP.sweep.whyOneRow : null}
                    className="min-h-11 sm:min-h-7"
                  >
                    Remove<span className="sr-only"> limit {i + 1}</span>
                  </LabButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRows((x) => [...x, blank()])}
          className="min-h-11 sm:min-h-7"
        >
          Add a limit
        </Button>
        <LabButton
          type="button"
          size="sm"
          onClick={save}
          className="min-h-11 sm:min-h-7"
          variant="primary"
          busy={pending}
        >
          Save draft
        </LabButton>
      </div>
      {draftId && canSign ? (
        <div className="flex flex-col gap-2">
          {authoredByMe ? (
            <label className="text-body-s flex flex-col gap-1">
              <span className="text-muted-foreground">
                You wrote this draft. If no other laboratory lead can sign, say why
              </span>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                className="min-h-11 sm:min-h-9"
              />
            </label>
          ) : null}
          {fresh ? (
            <FreshFactor
              onCancel={() => setFresh(false)}
              onConfirmed={() => {
                setFresh(false);
                setMessage(null);
                sign();
              }}
            />
          ) : (
            <div>
              <LabButton type="button" variant="secondary" onClick={sign} busy={pending}>
                Sign as laboratory lead
              </LabButton>
            </div>
          )}
        </div>
      ) : draftId ? (
        <StatusWord tone="caution">Waiting for the CSO</StatusWord>
      ) : null}
      <Said message={message} />
    </section>
  );
}
