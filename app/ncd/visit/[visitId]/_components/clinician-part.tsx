"use client";

import type { ConditionModule } from "@/lib/ncdreg/standard/types";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { completeness } from "@/lib/ncdreg/indicators/engine";
import { HYPOGLYCAEMIA, MEDICINE_GROUP_LABELS, MEDICINE_LIST, MISSED_DOSES, NOT_OBTAINED_REASON } from "@/lib/ncdreg/standard/code-lists";
import { needsConfirmation } from "@/lib/ncdreg/standard/validation";
import { RECORDED_CONTROL } from "@/lib/ncdreg/standard/types";
import { visitFormSpec, type FormRegistration } from "@/lib/ncdreg/visit-form";
import { useOutbox } from "../../../_components/outbox-provider";
import { ConfirmValues, Seg } from "./controls";

const CONTROL_WORDS: Record<string, string> = {
  controlled: "Controlled",
  partly_controlled: "Partly controlled",
  not_controlled: "Not controlled",
  not_assessed: "Not assessed",
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type ClinicianInitial = {
  medicines: string[];
  medicinesOther: string | null;
  confirmedUnchanged: boolean | null;
  missedDoses: string | null;
  hypoglycaemia: string | null;
  medicinesObtained: string | null;
  notObtainedReason: string | null;
  hba1c: { percent: number; resultDate: string | null } | null;
  nextAppointmentDate: string | null;
  disposition: string | null;
  observations: { registrationId: string; code: string; value: string | number | null }[];
  clinicianSaved: boolean;
};

/**
 * The clinician part (B3, B4, B9, G1): medicines carried forward with a one-action confirm, the
 * fields the person's registrations call for, the next appointment with quick picks, and the
 * completeness score. Records; never advises.
 */
export function ClinicianPart({
  visitId,
  personId,
  visitDate,
  visitType,
  stage,
  regs,
  initial,
  carried,
  intervalsWeeks,
  nurse,
}: {
  visitId: string;
  personId: string;
  visitDate: string;
  visitType: string;
  stage: string;
  regs: FormRegistration[];
  initial: ClinicianInitial;
  carried: { codes: string[]; other: string | null; from: string } | null;
  intervalsWeeks: number[];
  nurse: { weight: boolean; bp: boolean; glucose: boolean };
}) {
  const { submit } = useOutbox();
  const router = useRouter();
  const closed = stage === "closed";
  const spec = useMemo(() => visitFormSpec(regs, visitType), [regs, visitType]);
  const offers = (code: string) => spec.some((f) => f.key === code);
  const groupsFirst = useMemo(() => [...new Set(regs.flatMap((r) => r.module.medicine_groups))], [regs]);

  const fresh = !initial.clinicianSaved;
  const [meds, setMeds] = useState<string[]>(fresh ? (carried?.codes ?? []) : initial.medicines);
  const [other, setOther] = useState(fresh ? (carried?.other ?? "") : (initial.medicinesOther ?? ""));
  const [confirmed, setConfirmed] = useState<boolean>(!!initial.confirmedUnchanged);
  const [edited, setEdited] = useState(!fresh && !initial.confirmedUnchanged && initial.medicines.length > 0);
  const [missed, setMissed] = useState(initial.missedDoses);
  const [hypo, setHypo] = useState(initial.hypoglycaemia);
  const [hba1c, setHba1c] = useState(initial.hba1c ? String(initial.hba1c.percent) : "");
  const [hba1cDate, setHba1cDate] = useState(initial.hba1c?.resultDate ?? visitDate);
  const [obtained, setObtained] = useState(initial.medicinesObtained);
  const [reason, setReason] = useState(initial.notObtainedReason);
  const [next, setNext] = useState(initial.nextAppointmentDate ?? "");
  const [dispo, setDispo] = useState(initial.disposition);
  const [control, setControl] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.observations.filter((o) => o.code === "recorded_control").map((o) => [o.registrationId, String(o.value)])),
  );
  const [obs, setObs] = useState<Record<string, Record<string, string | number | boolean>>>(() => {
    const m: Record<string, Record<string, string | number | boolean>> = {};
    for (const o of initial.observations.filter((x) => x.code !== "recorded_control"))
      (m[o.registrationId] ??= {})[o.code] = o.value === "true" ? true : o.value === "false" ? false : (o.value ?? "");
    return m;
  });
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [confirmKind, setConfirmKind] = useState<"visit.save_clinician" | "visit.close">("visit.close");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(stage === "with_clinician" || stage === "closed");

  const touchStart = () => {
    if (started.current || closed) return;
    started.current = true;
    void submit("visit.start_clinician", { visitId, personId });
  };

  const score = completeness({
    visit: {
      type: visitType,
      weightKg: nurse.weight ? 1 : null,
      bp: nurse.bp ? [1, 1] : null,
      glucose: nurse.glucose ? { value: 1, type: "fasting" } : null,
      medicinesRecorded: confirmed || edited,
      missedDoses: missed,
      medicinesObtained: obtained,
      nextAppointment: next || null,
      disposition: dispo,
      recordedControl: control,
    },
    registrations: regs.map((r) => ({ id: r.registrationId, module: r.module })),
  });

  const payload = (confirmations: string[]) => ({
    visitId,
    personId,
    medicines: confirmed || edited ? { codes: meds, otherText: meds.includes("other") ? other : null, confirmedUnchanged: confirmed } : null,
    missedDoses: missed,
    hypoglycaemia: offers("hypoglycaemia") ? hypo : null,
    medicinesObtained: obtained,
    notObtainedReason: obtained === "partial" || obtained === "none" ? reason : null,
    hba1c: offers("hba1c") && hba1c ? { percent: Number(hba1c), resultDate: hba1cDate } : null,
    conditionFields: regs
      .filter((r) => r.module.outcome_classification.kind === "clinician_recorded" || r.module.visit_fields.some((f) => f.storage === "observation"))
      .map((r) => ({ registrationId: r.registrationId, recordedControl: control[r.registrationId] ?? null, observations: obs[r.registrationId] ?? {} }))
      .filter((c) => c.recordedControl || Object.keys(c.observations).length),
    nextAppointmentDate: dispo ? null : next || null,
    disposition: dispo,
    confirmations,
  });

  const act = (kind: "visit.save_clinician" | "visit.close", confirmations: string[] = []) =>
    start(async () => {
      setMsg(null);
      const flags = needsConfirmation({ hba1c_percent: hba1c ? Number(hba1c) : null }).filter((f) => !confirmations.includes(f));
      if (flags.length) return (setConfirmKind(kind), setConfirm(flags));
      const r = await submit(kind, payload(confirmations));
      if (!r.ok) return setMsg("message" in r ? r.message : "Not saved");
      if (kind === "visit.close") {
        setMsg("queued" in r ? "Visit closed on this device. Sent when the connection returns." : "Visit closed.");
        router.refresh();
      } else setMsg("queued" in r ? "Draft saved on this device." : "Draft saved.");
    });

  const medLabel = (c: string) => MEDICINE_LIST.medicines.find((m) => m.code === c)?.label ?? c;
  const groups = [...groupsFirst, ...Object.keys(MEDICINE_GROUP_LABELS).filter((g) => !groupsFirst.includes(g))];

  return (
    <form className="flex flex-col gap-5" onFocus={touchStart} onSubmit={(e) => e.preventDefault()} aria-label="Clinician entries">
      <fieldset disabled={closed || pending} className="flex flex-col gap-5">
        <section className="flex flex-col gap-2" aria-labelledby="meds-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="meds-h" className="text-label">
              Current medicines after this visit
            </h3>
            {carried && !confirmed ? (
              <Button type="button" variant="soft" onClick={() => (setMeds(carried.codes), setOther(carried.other ?? ""), setConfirmed(true), setEdited(false))}>
                <CheckIcon aria-hidden /> Confirm unchanged
              </Button>
            ) : confirmed ? (
              <span className="text-caption text-ink-700 inline-flex items-center gap-1">
                <CheckIcon className="size-3.5" aria-hidden /> Confirmed unchanged
              </span>
            ) : null}
          </div>
          {carried ? <p className="text-caption text-muted-foreground">Carried forward from the visit of {carried.from}. No doses are recorded.</p> : null}
          <ul className="flex flex-wrap gap-1.5">
            {meds.map((c) => (
              <li key={c} className="border-ink-200 inline-flex h-8 items-center gap-1 rounded-md border pr-1 pl-2.5 text-[13px]">
                {medLabel(c)}
                <button
                  type="button"
                  className="hover:bg-ink-100 focus-visible:shadow-focus grid size-6 place-items-center rounded"
                  aria-label={`Remove ${medLabel(c)}`}
                  onClick={() => (setMeds(meds.filter((x) => x !== c)), setConfirmed(false), setEdited(true))}
                >
                  <XIcon className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
            {!meds.length ? <li className="text-caption text-muted-foreground">No medicines listed.</li> : null}
          </ul>
          <label className="flex max-w-md flex-col gap-1">
            <span className="text-caption text-ink-600">Add a medicine</span>
            <select
              className="border-input h-9 rounded-md border bg-transparent px-2 text-[13px]"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v && !meds.includes(v)) {
                  setMeds([...meds, v]);
                  setConfirmed(false);
                  setEdited(true);
                }
              }}
            >
              <option value="">Choose…</option>
              {groups.map((g) => (
                <optgroup key={g} label={MEDICINE_GROUP_LABELS[g] ?? g}>
                  {MEDICINE_LIST.medicines
                    .filter((m) => m.group === g)
                    .map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          {meds.includes("other") ? (
            <label className="flex max-w-md flex-col gap-1">
              <span className="text-caption text-ink-600">Other medicine (name only)</span>
              <input className="border-input h-9 rounded-md border bg-transparent px-2 text-[13px]" value={other} onChange={(e) => (setOther(e.target.value), setEdited(true))} />
            </label>
          ) : null}
        </section>

        <Seg label="Missed doses in the past 7 days" hideLabel={false} value={missed} onChange={setMissed} options={MISSED_DOSES.codes.map((c) => [c.code, c.label] as const)} />
        {offers("hypoglycaemia") ? (
          <Seg label="Hypoglycaemia since last visit" hideLabel={false} value={hypo} onChange={setHypo} options={HYPOGLYCAEMIA.codes.map((c) => [c.code, c.label] as const)} />
        ) : null}
        {offers("hba1c") ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label">HbA1c % (if resulted)</span>
              <input className="border-input h-9 w-28 rounded-md border bg-transparent px-2 font-mono" inputMode="decimal" value={hba1c} onChange={(e) => setHba1c(e.target.value.replace(",", "."))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label">Result date</span>
              <input type="date" className="border-input h-9 rounded-md border bg-transparent px-2 font-mono text-[13px]" value={hba1cDate} max={visitDate} onChange={(e) => setHba1cDate(e.target.value)} />
            </label>
          </div>
        ) : null}

        {regs
          .filter((r) => r.module.outcome_classification.kind === "clinician_recorded")
          .map((r: { registrationId: string; module: ConditionModule }) => (
            <section key={r.registrationId} className="border-border flex flex-col gap-3 rounded-lg border p-3" aria-label={r.module.label}>
              <h3 className="text-label">
                {r.module.label} <span className="text-muted-foreground text-[11px] font-normal">· clinician-recorded</span>
              </h3>
              <Seg
                label={`${r.module.label}: control as you judge it`}
                hideLabel={false}
                value={control[r.registrationId]}
                onChange={(v) => setControl({ ...control, [r.registrationId]: v })}
                options={RECORDED_CONTROL.map((c) => [c, CONTROL_WORDS[c]!] as const)}
              />
              {r.module.visit_fields
                .filter((f) => f.storage === "observation")
                .map((f) => {
                  const cur = obs[r.registrationId]?.[f.code];
                  const set = (v: string | number | boolean) => setObs({ ...obs, [r.registrationId]: { ...(obs[r.registrationId] ?? {}), [f.code]: v } });
                  if (f.type === "enum")
                    return <Seg key={f.code} label={f.label} hideLabel={false} value={cur as string} onChange={set} options={(f.options ?? []).map((o) => [o.code, o.label] as const)} />;
                  if (f.type === "boolean")
                    return <Seg key={f.code} label={f.label} hideLabel={false} value={cur == null ? null : String(cur)} onChange={(v) => set(v === "true")} options={[["true", "Yes"], ["false", "No"]]} />;
                  return (
                    <label key={f.code} className="flex flex-col gap-1">
                      <span className="text-label">{f.label}</span>
                      <input className="border-input h-9 w-28 rounded-md border bg-transparent px-2 font-mono" inputMode="numeric" value={cur == null ? "" : String(cur)} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} />
                    </label>
                  );
                })}
            </section>
          ))}

        <div className="flex flex-col gap-2">
          <Seg label="Medicines obtained" hideLabel={false} value={obtained} onChange={setObtained} options={[["full", "In full"], ["partial", "In part"], ["none", "None"], ["not_applicable", "Not applicable"]]} />
          {obtained === "partial" || obtained === "none" ? (
            <Seg label="Reason" hideLabel={false} value={reason} onChange={setReason} options={NOT_OBTAINED_REASON.codes.map((c) => [c.code, c.label] as const)} />
          ) : null}
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="next-h">
          <h3 id="next-h" className="text-label">
            Next appointment
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {intervalsWeeks.map((w) => (
              <Button key={w} type="button" variant={next === addDays(visitDate, w * 7) && !dispo ? "primary" : "secondary"} onClick={() => (setNext(addDays(visitDate, w * 7)), setDispo(null))}>
                {w} weeks
              </Button>
            ))}
            <label className="flex items-center gap-2">
              <span className="sr-only">Next appointment date</span>
              <input type="date" min={addDays(visitDate, 1)} className="border-input h-8 rounded-md border bg-transparent px-2 font-mono text-[13px]" value={next} onChange={(e) => (setNext(e.target.value), setDispo(null))} />
            </label>
          </div>
          <Seg
            label="Or instead"
            hideLabel={false}
            value={dispo ?? ""}
            onChange={(v) => setDispo(v || null)}
            options={[["", "Keep in this clinic"], ["transfer_out", "Transfer out"], ["discharged_to_primary_care", "Discharge to primary care"]]}
          />
        </section>

        <section className="bg-ink-50 flex flex-col gap-1 rounded-lg p-3" aria-live="polite">
          <p className="text-label">
            Completeness <span className="font-mono tabular-nums">{score.score}%</span>
          </p>
          <p className="text-caption text-ink-600">{score.missing.length ? `Missing: ${score.missing.map((m) => m.replace(/^recorded_control:/, "control: ").replace(/_/g, " ")).join(", ")}` : "Every core field is recorded."}</p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="lg" onClick={() => act("visit.save_clinician")}>
            Save draft
          </Button>
          <Button type="button" size="lg" onClick={() => act("visit.close")}>
            Close visit
          </Button>
        </div>
      </fieldset>
      {msg ? (
        <p role="status" className="text-caption text-ink-700">
          {msg}
        </p>
      ) : null}
      {closed ? <p className="text-caption text-ink-600">This visit is closed. A late laboratory result can be added from the patient record.</p> : null}
      <ConfirmValues fields={confirm} onCancel={() => setConfirm(null)} onConfirm={(f) => (setConfirm(null), act(confirmKind, f))} />
    </form>
  );
}
