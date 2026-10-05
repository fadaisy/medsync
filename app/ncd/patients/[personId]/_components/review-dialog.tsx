"use client";

import type { ReviewComponent } from "@/lib/ncdreg/standard/types";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ALCOHOL, AMPUTATION, CV_RISK, DIPSTICK, EYE_METHOD, LVH, MACULAR_OEDEMA, RETINOPATHY_GRADE, TOBACCO } from "@/lib/ncdreg/standard/code-lists";
import { needsConfirmation } from "@/lib/ncdreg/standard/validation";
import { useOutbox } from "../../../_components/outbox-provider";
import { ConfirmValues, Seg } from "../../../visit/[visitId]/_components/controls";

const LABELS: Record<ReviewComponent | "other", string> = {
  kidney: "Kidney",
  eyes: "Eyes",
  feet: "Feet",
  lipids: "Lipids",
  hba1c: "HbA1c",
  other: "Other annual items",
};
const opts = (l: { codes: readonly { code: string; label: string }[] }) => l.codes.map((c) => [c.code, c.label] as const);
const yn = [["true", "Yes"], ["false", "No"]] as const;
const field = "border-input h-10 w-32 rounded-lg border bg-transparent px-3 font-mono text-[14px]";

/** C1/C2: one form per component, saved and dated on its own; categories are calculated on save. */
export function ReviewDialog({
  open,
  onOpenChange,
  personId,
  components,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  personId: string;
  components: (ReviewComponent | "other")[];
  today: string;
}) {
  const router = useRouter();
  const { submit } = useOutbox();
  const list = components.filter((c) => c !== "hba1c");
  const [comp, setComp] = useState(list[0] ?? "kidney");
  const [date, setDate] = useState(today);
  const [v, setV] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: string) => (x: string) => setV({ ...v, [k]: x });
  const num = (k: string) => (v[k] ? Number(v[k]) : null);
  const bool = (k: string) => (v[k] == null ? null : v[k] === "true");

  const data = () => {
    switch (comp) {
      case "kidney":
        return { component: "kidney", creatinine: num("creatinine"), creatinineUnit: v.unit ?? "umol", urineTest: v.urine || null, acrMgMmol: v.urine === "acr" ? num("acr") : null, dipstick: v.urine === "dipstick" ? v.dipstick || null : null };
      case "eyes":
        return { component: "eyes", examined: v.examined === "true", method: v.method || null, retinopathyGrade: v.grade || null, macularOedema: v.mo || null, referred: bool("referred") };
      case "feet":
        return { component: "feet", lossOfProtectiveSensation: v.lops === "true", absentPulses: v.pulses === "true", deformity: v.deformity === "true", currentUlcer: v.ulcer === "true", previousUlcer: v.prevUlcer === "true", amputation: v.amputation || "none" };
      case "lipids":
        return { component: "lipids", totalCholesterol: num("total"), ldl: num("ldl") };
      default:
        return { component: "other", cvRiskCategory: v.cv || null, ecgDone: bool("ecg"), lvh: v.lvh || null, tobacco: v.tobacco || null, alcohol: v.alcohol || null };
    }
  };

  const save = (confirmations: string[] = []) =>
    start(async () => {
      setMsg(null);
      const creat = num("creatinine");
      const flags = needsConfirmation({
        creatinine_umol: creat == null ? null : v.unit === "mgdl" ? creat * 88.4 : creat,
        acr_mg_mmol: num("acr"),
        total_cholesterol: num("total"),
        ldl: num("ldl"),
      }).filter((f) => !confirmations.includes(f));
      if (flags.length) return setConfirm(flags);
      const r = await submit("review.save", { reviewId: crypto.randomUUID(), personId, reviewDate: date, data: data(), confirmations });
      if (!r.ok) return setMsg("message" in r ? r.message : "Not saved");
      const d = ("result" in r ? (r.result.derived as Record<string, unknown>) : {}) ?? {};
      const parts = [
        d.egfr != null ? `eGFR ${String(d.egfr)} mL/min/1.73m²` : null,
        d.kdigoG ? `kidney category ${String(d.kdigoG)}` : null,
        d.kdigoA ? `albuminuria category ${String(d.kdigoA)}` : null,
        d.footRisk != null ? `foot risk category ${String(d.footRisk)}` : null,
      ].filter(Boolean);
      setResult(parts.length ? `${parts.join(" · ")} (category from latest result)` : "Saved.");
      setV({});
      router.refresh();
    });

  return (
    <EditorDialog open={open} onOpenChange={(o) => (onOpenChange(o), setResult(null))} width="medium">
      <SheetHeader>
        <SheetTitle>Record a review</SheetTitle>
        <SheetDescription>Each part is saved and dated on its own.</SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-4">
        <Seg label="Review" hideLabel={false} value={comp} onChange={(c) => (setComp(c as typeof comp), setV({}), setResult(null))} options={list.map((c) => [c, LABELS[c]] as const)} />
        <label className="flex flex-col gap-1">
          <span className="text-label">Date</span>
          <input type="date" max={today} className={field + " w-44"} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {comp === "kidney" ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-label">Serum creatinine</span>
                <input className={field} inputMode="decimal" value={v.creatinine ?? ""} onChange={(e) => set("creatinine")(e.target.value)} />
              </label>
              <Seg label="Unit" value={v.unit ?? "umol"} onChange={set("unit")} options={[["umol", "µmol/L"], ["mgdl", "mg/dL"]]} />
            </div>
            <Seg label="Urine test" hideLabel={false} value={v.urine} onChange={set("urine")} options={[["acr", "Albumin-to-creatinine ratio"], ["dipstick", "Dipstick protein"]]} />
            {v.urine === "acr" ? (
              <label className="flex flex-col gap-1">
                <span className="text-label">ACR mg/mmol</span>
                <input className={field} inputMode="decimal" value={v.acr ?? ""} onChange={(e) => set("acr")(e.target.value)} />
              </label>
            ) : null}
            {v.urine === "dipstick" ? <Seg label="Dipstick" hideLabel={false} value={v.dipstick} onChange={set("dipstick")} options={opts(DIPSTICK)} /> : null}
          </>
        ) : null}
        {comp === "eyes" ? (
          <>
            <Seg label="Examined" hideLabel={false} value={v.examined} onChange={set("examined")} options={yn} />
            {v.examined === "true" ? (
              <>
                <Seg label="Method" hideLabel={false} value={v.method} onChange={set("method")} options={opts(EYE_METHOD)} />
                <label className="flex flex-col gap-1">
                  <span className="text-label">Retinopathy grade, worse eye</span>
                  <select className="border-input h-10 rounded-lg border bg-transparent px-3 text-[14px]" value={v.grade ?? ""} onChange={(e) => set("grade")(e.target.value)}>
                    <option value="">Choose…</option>
                    {RETINOPATHY_GRADE.codes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Seg label="Macular oedema" hideLabel={false} value={v.mo} onChange={set("mo")} options={opts(MACULAR_OEDEMA)} />
                <Seg label="Referred" hideLabel={false} value={v.referred} onChange={set("referred")} options={yn} />
              </>
            ) : null}
          </>
        ) : null}
        {comp === "feet" ? (
          <>
            {(
              [
                ["lops", "Loss of protective sensation"],
                ["pulses", "Absent pulses"],
                ["deformity", "Deformity"],
                ["ulcer", "Current ulcer"],
                ["prevUlcer", "Previous ulcer"],
              ] as const
            ).map(([k, l]) => (
              <Seg key={k} label={l} hideLabel={false} value={v[k]} onChange={set(k)} options={yn} />
            ))}
            <Seg label="Amputation" hideLabel={false} value={v.amputation ?? "none"} onChange={set("amputation")} options={opts(AMPUTATION)} />
          </>
        ) : null}
        {comp === "lipids" ? (
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label">Total cholesterol mmol/L</span>
              <input className={field} inputMode="decimal" value={v.total ?? ""} onChange={(e) => set("total")(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label">LDL cholesterol mmol/L</span>
              <input className={field} inputMode="decimal" value={v.ldl ?? ""} onChange={(e) => set("ldl")(e.target.value)} />
            </label>
          </div>
        ) : null}
        {comp === "other" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-label">Cardiovascular risk category, as recorded by the clinician</span>
              <select className="border-input h-10 rounded-lg border bg-transparent px-3 text-[14px]" value={v.cv ?? ""} onChange={(e) => set("cv")(e.target.value)}>
                <option value="">Choose…</option>
                {CV_RISK.codes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <Seg label="ECG done" hideLabel={false} value={v.ecg} onChange={set("ecg")} options={yn} />
            {v.ecg === "true" ? <Seg label="Left ventricular hypertrophy" hideLabel={false} value={v.lvh} onChange={set("lvh")} options={opts(LVH)} /> : null}
            <Seg label="Tobacco" hideLabel={false} value={v.tobacco} onChange={set("tobacco")} options={opts(TOBACCO)} />
            <Seg label="Alcohol" hideLabel={false} value={v.alcohol} onChange={set("alcohol")} options={opts(ALCOHOL)} />
          </>
        ) : null}
        {result ? (
          <p role="status" className="text-body-s text-ink-800 bg-ink-50 rounded-lg p-3">
            {result}
          </p>
        ) : null}
        {msg ? (
          <p role="alert" className="text-body-s text-ink-800">
            {msg}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button onClick={() => save()} disabled={pending}>
          Save {LABELS[comp].toLowerCase()}
        </Button>
      </SheetFooter>
      <ConfirmValues fields={confirm} onCancel={() => setConfirm(null)} onConfirm={(f) => (setConfirm(null), save(f))} />
    </EditorDialog>
  );
}
