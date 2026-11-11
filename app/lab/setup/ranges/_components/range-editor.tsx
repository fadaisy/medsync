"use client";

import type { AgeUnit } from "../_lib/ages";
import type { RangeBand } from "@/lib/lab/ranges";
import { useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { LabButton } from "@/components/tide/work/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CRITICALS_COPY } from "@/content/lab-criticals";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { saveRangeDraftAction, signRangeAsLeadAction } from "@/lib/lab/measures-actions";
import { resolveRange } from "@/lib/lab/ranges";
import { toDays } from "../_lib/ages";
import { Said, useAct } from "../../criticals/_components/setup-forms";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";

export interface EditableBand {
  sex: "female" | "male" | "any";
  from: string;
  fromUnit: AgeUnit;
  to: string;
  toUnit: AgeUnit;
  low: string;
  high: string;
  source: string;
}

/** Three example patients (§5.7 preview). Invented: what the technologist would see for each. */
const EXAMPLES = [
  { label: "A woman of 58", sex: "female" as const, ageDays: Math.round(58 * 365.25) },
  { label: "A girl of 9", sex: "female" as const, ageDays: Math.round(9 * 365.25) },
  { label: "No date of birth recorded", sex: "male" as const, ageDays: null },
];

const REASON: Record<string, string> = {
  no_band_for_age: CRITICALS_COPY.noRange.no_band_for_age,
  sex_or_age_missing: CRITICALS_COPY.noRange.sex_or_age_missing,
  no_signed_range: "Two bands match: fix the overlap",
};

/**
 * The bands of one test component's range (§5.7, artboard 10). Saving keeps a draft; the
 * laboratory lead signs with a fresh second factor, and the CSO countersigns in the admin console.
 * The signed version stays in force until the next one is signed.
 */
export function RangeEditor({
  testId,
  conceptId,
  unit,
  initial,
  draftId,
  canSign,
  authoredByMe,
}: {
  testId: string;
  conceptId: string;
  unit: string;
  initial: EditableBand[];
  draftId: string | null;
  canSign: boolean;
  authoredByMe: boolean;
}) {
  const { pending, message, act, setMessage } = useAct();
  const [bands, setBands] = useState<EditableBand[]>(
    initial.length
      ? initial
      : [
          {
            sex: "any",
            from: "",
            fromUnit: "years",
            to: "",
            toUnit: "years",
            low: "",
            high: "",
            source: "",
          },
        ],
  );
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const patch = (i: number, p: Partial<EditableBand>) =>
    setBands((b) => b.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const asDays = bands.map((b, i) => ({
    id: String(i + 1),
    sex: b.sex,
    ageFromDays: toDays(b.from, b.fromUnit),
    ageToDays: toDays(b.to, b.toUnit),
    low: b.low.trim() ? b.low.trim().replace(",", ".") : null,
    high: b.high.trim() ? b.high.trim().replace(",", ".") : null,
  })) as RangeBand[];
  const preview = EXAMPLES.map((ex) => {
    const r = resolveRange(
      {
        measure: { testId, conceptId, resultType: "number", unitUcum: unit },
        hospitalId: "preview",
        sex: ex.sex,
        ageDaysAtCollection: ex.ageDays,
        at: new Date(2),
      },
      [
        {
          id: "draft",
          hospitalId: "preview",
          testId,
          conceptId,
          unitUcum: unit,
          version: 1,
          status: "signed",
          inForceFrom: new Date(1),
          supersededAt: null,
          bands: asDays,
        },
      ],
    );
    return {
      label: ex.label,
      words:
        r.kind === "band"
          ? `${r.band.low ?? "…"}–${r.band.high ?? "…"} ${unit}`
          : (REASON[r.reason] ?? r.reason),
    };
  });
  const sign = () =>
    act(async () => {
      const r = await signRangeAsLeadAction({
        versionId: draftId,
        exceptionNote: note.trim() || null,
      });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, "Signed as laboratory lead. The CSO signs next; until then the signed version stays in force.");

  return (
    <section
      aria-labelledby="range-heading"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="range-heading" className="text-heading-s">
        Bands, in {unit}
      </h2>
      <div className="overflow-auto">
        <table className="text-body-s w-full border-collapse text-left">
          <thead>
            <tr className="text-caption text-muted-foreground">
              {["Sex", "Age from", "Age to", "Low", "High", "Source", "Actions"].map((h) => (
                <th key={h} scope="col" className="px-1 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bands.map((b, i) => (
              <tr key={i} className="align-top">
                <td className="px-1 py-1">
                  <select
                    aria-label={`Band ${i + 1} sex`}
                    value={b.sex}
                    onChange={(e) => patch(i, { sex: e.target.value as EditableBand["sex"] })}
                    className={selectClass}
                  >
                    <option value="any">Any</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </td>
                {(["from", "to"] as const).map((k) => (
                  <td key={k} className="px-1 py-1">
                    <span className="flex gap-1">
                      <Input
                        aria-label={`Band ${i + 1} age ${k}`}
                        value={b[k]}
                        onChange={(e) => patch(i, { [k]: e.target.value })}
                        inputMode="numeric"
                        className="min-h-11 w-16 tabular-nums sm:min-h-9"
                      />
                      <select
                        aria-label={`Band ${i + 1} age ${k} unit`}
                        value={b[`${k}Unit`]}
                        onChange={(e) => patch(i, { [`${k}Unit`]: e.target.value as AgeUnit })}
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
                    aria-label={`Band ${i + 1} low`}
                    value={b.low}
                    onChange={(e) => patch(i, { low: e.target.value })}
                    inputMode="decimal"
                    className="min-h-11 w-20 text-right tabular-nums sm:min-h-9"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Band ${i + 1} high`}
                    value={b.high}
                    onChange={(e) => patch(i, { high: e.target.value })}
                    inputMode="decimal"
                    className="min-h-11 w-20 text-right tabular-nums sm:min-h-9"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Band ${i + 1} source`}
                    value={b.source}
                    onChange={(e) => patch(i, { source: e.target.value })}
                    placeholder="Kit insert; verified on 20 local samples"
                    className="min-h-11 min-w-56 sm:min-h-9"
                  />
                </td>
                <td className="px-1 py-1">
                  <LabButton
                    type="button"
                    variant="quiet"
                    size="sm"
                    onClick={() => setBands((x) => x.filter((_, j) => j !== i))}
                    disabledReason={bands.length === 1 ? LABWS2_SETUP.sweep.whyOneBand : null}
                    className="min-h-11 sm:min-h-7"
                  >
                    Remove<span className="sr-only"> band {i + 1}</span>
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
          onClick={() =>
            setBands((b) => [
              ...b,
              {
                sex: "any",
                from: "",
                fromUnit: "years",
                to: "",
                toUnit: "years",
                low: "",
                high: "",
                source: "",
              },
            ])
          }
          className="min-h-11 sm:min-h-7"
        >
          Add a band
        </Button>
      </div>
      <section aria-labelledby="preview" className="flex flex-col gap-1">
        <h3 id="preview" className="text-body-s font-medium">
          What the technologist sees
        </h3>
        <ul className="text-body-s flex flex-col gap-0.5">
          {preview.map((p) => (
            <li key={p.label}>
              <span className="text-muted-foreground">{p.label}: </span>
              {p.words}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <LabButton
          type="button"
          onClick={() =>
            act(
              () =>
                saveRangeDraftAction({
                  testId,
                  conceptId,
                  bands: asDays.map((b, i) => ({
                    sex: b.sex,
                    ageFromDays: b.ageFromDays,
                    ageToDays: b.ageToDays,
                    low: b.low,
                    high: b.high,
                    source: bands[i]!.source,
                  })),
                }),
              "Draft saved. It is not used until it is signed by the laboratory lead and the CSO.",
            )
          }
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
