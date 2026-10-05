"use client";

import type { BpReading } from "@/lib/ncdreg/standard/calculations";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { bmi, glucoseMgdlToMmol, parseBp, visitBp } from "@/lib/ncdreg/standard/calculations";
import { needsConfirmation } from "@/lib/ncdreg/standard/validation";
import { cn } from "@/lib/utils";
import { useOutbox } from "../../../_components/outbox-provider";
import { ConfirmValues, Seg } from "./controls";

export type NurseInitial = {
  weightKg: number | null;
  bp: [number, number][];
  glucose: { value: number; type: string | null; method: string | null } | null;
};

/**
 * The nurse part (B1, B5): weight, up to three readings typed as "120/80", the computed visit blood
 * pressure and BMI, glucose with type and method where the conditions call for it. Saving does not
 * need the clinician part; offline it is kept on the device and sent later.
 */
export function NursePart({
  visitId,
  personId,
  initial,
  heightCm,
  glucose,
  closed,
  big = false,
  glucoseUnit = "mmol",
  onSaved,
}: {
  visitId: string;
  personId: string;
  initial: NurseInitial;
  heightCm: number | null;
  glucose: boolean;
  closed: boolean;
  big?: boolean;
  glucoseUnit?: string;
  onSaved?: (queued: boolean) => void;
}) {
  const { submit } = useOutbox();
  const [weight, setWeight] = useState(initial.weightKg?.toString() ?? "");
  const [bps, setBps] = useState<string[]>(
    initial.bp.length ? initial.bp.map(([s, d]) => `${s}/${d}`) : [""],
  );
  const [unit, setUnit] = useState<"mmol" | "mgdl">(glucoseUnit === "mgdl" ? "mgdl" : "mmol");
  const [gval, setGval] = useState(initial.glucose ? String(initial.glucose.value) : "");
  const [gtype, setGtype] = useState(initial.glucose?.type ?? "fasting");
  const [gmethod, setGmethod] = useState(initial.glucose?.method ?? "capillary");
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // Capture rule (§7 B): focus lands on the first empty field.
  useEffect(() => {
    const first = [
      ...(formRef.current?.querySelectorAll<HTMLInputElement>("input[inputmode]") ?? []),
    ].find((i) => !i.value && !i.disabled);
    first?.focus();
  }, []);

  const readings = useMemo(
    () => bps.map((b) => parseBp(b)).filter((x): x is BpReading => !!x),
    [bps],
  );
  const badBp = bps.some((b) => b.trim() && !parseBp(b));
  const vbp = visitBp(readings);
  const w = Number(weight);
  const bmiNow = weight && heightCm && w > 0 ? bmi(w, heightCm) : null;
  const gNum = gval ? Number(gval) : null;
  const gMmol =
    gNum == null || !Number.isFinite(gNum)
      ? null
      : unit === "mgdl"
        ? glucoseMgdlToMmol(gNum)
        : gNum;

  const save = (confirmed: string[] = []) =>
    start(async () => {
      setMsg(null);
      const flags = [
        ...needsConfirmation({ weight_kg: weight ? w : null, glucose_mmol: gMmol }),
        ...readings.flatMap(([s, d]) => needsConfirmation({ systolic: s, diastolic: d })),
      ];
      const pendingConfirm = [...new Set(flags)].filter((f) => !confirmed.includes(f));
      if (pendingConfirm.length) return setConfirm(pendingConfirm);
      const r = await submit("visit.save_nurse", {
        visitId,
        personId,
        weightKg: weight ? w : null,
        bp: readings,
        glucose:
          glucose && gNum != null ? { value: gNum, unit, type: gtype, method: gmethod } : null,
        confirmations: confirmed,
      });
      if (!r.ok) return setMsg("message" in r ? r.message : "Not saved");
      const queued = "queued" in r;
      setMsg(
        queued
          ? "Saved on this device now. Sent when the connection returns."
          : "Measurements saved.",
      );
      onSaved?.(queued);
    });

  const input = cn(
    "border-input focus-visible:shadow-focus w-full rounded-lg border bg-transparent px-3 font-mono tabular-nums outline-none",
    big ? "h-12 text-[18px]" : "h-10 text-[15px]",
  );
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      aria-label="Measurements"
    >
      <fieldset disabled={closed || pending} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-label">Weight kg</span>
          <input
            className={input}
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(",", "."))}
          />
        </label>
        <div className={cn("grid gap-3", big ? "grid-cols-2" : "grid-cols-3")}>
          {bps.map((b, i) => (
            <label key={i} className="flex flex-col gap-1">
              <span className="text-label">Blood pressure {i + 1}</span>
              <input
                className={input}
                inputMode="numeric"
                placeholder="120/80"
                value={b}
                onChange={(e) =>
                  setBps(bps.map((x, j) => (j === i ? e.target.value.replace(/[^\d/ ]/g, "") : x)))
                }
                aria-invalid={!!b.trim() && !parseBp(b)}
              />
            </label>
          ))}
        </div>
        {badBp ? (
          <p className="text-caption text-ink-800">
            Type each reading as systolic/diastolic, for example 120/80.
          </p>
        ) : null}
        {bps.length < 3 ? (
          <Button
            type="button"
            variant="soft"
            size={big ? "lg" : "md"}
            className="self-start"
            onClick={() => setBps([...bps, ""])}
          >
            <PlusIcon aria-hidden /> Add a reading
          </Button>
        ) : null}
        <dl className="bg-ink-50 grid grid-cols-2 gap-3 rounded-lg p-3">
          <div>
            <dt className="text-overline text-muted-foreground uppercase">Visit blood pressure</dt>
            <dd className="font-mono text-[20px] tabular-nums">
              {vbp ? `${vbp[0]}/${vbp[1]}` : "–"}{" "}
              <small className="text-muted-foreground text-[12px]">mmHg</small>
            </dd>
            <dd className="text-caption text-muted-foreground">
              {readings.length
                ? `Mean of ${readings.length} reading${readings.length > 1 ? "s" : ""}`
                : "No reading yet"}
            </dd>
          </div>
          <div>
            <dt className="text-overline text-muted-foreground uppercase">Body mass index</dt>
            <dd className="font-mono text-[20px] tabular-nums">
              {bmiNow ?? "–"} <small className="text-muted-foreground text-[12px]">kg/m²</small>
            </dd>
            <dd className="text-caption text-muted-foreground">
              {heightCm ? `Height ${heightCm} cm` : "No height recorded"}
            </dd>
          </div>
        </dl>
        {glucose ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-label">Glucose {unit === "mgdl" ? "mg/dL" : "mmol/L"}</span>
                <input
                  className={input}
                  inputMode="decimal"
                  value={gval}
                  onChange={(e) => setGval(e.target.value.replace(",", "."))}
                />
              </label>
              <Seg
                label="Glucose unit"
                value={unit}
                onChange={(v) => setUnit(v as "mmol" | "mgdl")}
                options={[
                  ["mmol", "mmol/L"],
                  ["mgdl", "mg/dL"],
                ]}
              />
            </div>
            <Seg
              label="Glucose type"
              value={gtype}
              onChange={setGtype}
              big={big}
              options={[
                ["fasting", "Fasting"],
                ["random", "Random"],
                ["post_meal", "After meal"],
              ]}
            />
            <Seg
              label="Glucose method"
              value={gmethod}
              onChange={setGmethod}
              options={[
                ["capillary", "Capillary"],
                ["laboratory", "Laboratory"],
              ]}
            />
          </div>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className={cn(big && "h-13 w-full text-[15px]")}
          disabled={badBp}
        >
          Save measurements
        </Button>
      </fieldset>
      {msg ? (
        <p role="status" className="text-caption text-ink-700">
          {msg}
        </p>
      ) : null}
      <ConfirmValues
        fields={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(f) => (setConfirm(null), save(f))}
      />
    </form>
  );
}
