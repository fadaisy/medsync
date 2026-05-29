"use client";

import type { RegisterIntakeState } from "../actions";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, UserPlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerIntakeAction } from "../actions";

interface EntryTypeOption {
  code: string;
  name: string;
  isEmergency: boolean;
  defaultPriorityHint: string;
  requiresReferral: boolean;
  allowsUnknownPatient: boolean;
  requiresAppointmentLink: boolean;
}

interface DeptOption {
  id: string;
  name: string;
}

interface HospitalOption {
  id: string;
  name: string;
  level: string;
}

const ENTRY_POINTS = [
  { value: "casualty", label: "Casualty / A&E" },
  { value: "medical_emergency_unit", label: "Medical Emergency Unit" },
  { value: "paeds_acu", label: "Paediatric Acute Care Unit" },
  { value: "assessment_centre", label: "Assessment Centre" },
  { value: "opd", label: "OPD" },
  { value: "ward", label: "Ward" },
  { value: "virtual", label: "Virtual" },
  { value: "other", label: "Other" },
] as const;

export function IntakeForm({
  entryTypes,
  departments,
  hospitals,
}: {
  entryTypes: ReadonlyArray<EntryTypeOption>;
  departments: ReadonlyArray<DeptOption>;
  hospitals: ReadonlyArray<HospitalOption>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RegisterIntakeState, FormData>(
    registerIntakeAction,
    {},
  );

  const [typeCode, setTypeCode] = useState<string>(entryTypes[0]?.code ?? "walk_in");
  const [patientMode, setPatientMode] = useState<"known" | "unknown">("known");

  const activeType = entryTypes.find((t) => t.code === typeCode);
  const isEmergency = !!activeType?.isEmergency;

  if (state.ok) {
    return (
      <div
        className={
          state.isEmergency
            ? "flex flex-col gap-3 rounded-xl border border-rose-500/40 bg-rose-50/40 p-5 dark:bg-rose-950/15"
            : "flex flex-col gap-3 rounded-xl border border-teal-500/40 bg-teal-50/40 p-5 dark:bg-teal-950/15"
        }
      >
        <span
          aria-hidden
          className={
            state.isEmergency
              ? "inline-flex size-9 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
              : "inline-flex size-9 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300"
          }
        >
          {state.isEmergency ? (
            <AlertTriangleIcon className="size-4" />
          ) : (
            <CheckCircle2Icon className="size-4" />
          )}
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-foreground text-[14px] font-medium">
            {state.isEmergency
              ? "Emergency intake registered — receiving unit alerted"
              : "Intake registered"}
          </span>
          <span className="text-muted-foreground text-[12.5px] leading-relaxed">
            Awaiting triage. The receiving department&rsquo;s clinical staff can see it on their
            incoming panel.
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => router.refresh()}>
            Register another
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/hospital-admin/intake")}
          >
            See today&rsquo;s intakes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="entry_type_code" value={typeCode} />

      {/* Entry type picker */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          How is the patient arriving?
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {entryTypes.map((t) => (
            <button
              key={t.code}
              type="button"
              onClick={() => setTypeCode(t.code)}
              aria-pressed={typeCode === t.code}
              className={
                typeCode === t.code
                  ? t.isEmergency
                    ? "rounded-full bg-rose-600 px-3 py-1 text-[12px] font-medium text-white shadow-xs"
                    : "rounded-full bg-teal-600 px-3 py-1 text-[12px] font-medium text-white shadow-xs"
                  : t.isEmergency
                    ? "rounded-full border border-rose-500/40 px-3 py-1 text-[12px] text-rose-700 transition-colors hover:bg-rose-50/60 dark:text-rose-300 dark:hover:bg-rose-950/30"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-full border px-3 py-1 text-[12px] transition-colors"
              }
            >
              {t.name}
            </button>
          ))}
        </div>
        {activeType ? (
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            {isEmergency
              ? "Emergency path — capture-fast. None of the fields below are required; submit what you have."
              : activeType.requiresReferral
                ? "Routine referral — capture the referring facility + reason; document upload optional."
                : "Routine intake — capture what you have."}
          </p>
        ) : null}
      </fieldset>

      {/* Patient */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Patient
        </legend>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setPatientMode("known")}
            aria-pressed={patientMode === "known"}
            className={
              patientMode === "known"
                ? "bg-foreground text-background rounded-md px-3 py-1.5 text-[12px] font-medium"
                : "border-border text-muted-foreground hover:text-foreground rounded-md border px-3 py-1.5 text-[12px]"
            }
          >
            Known patient
          </button>
          {activeType?.allowsUnknownPatient ? (
            <button
              type="button"
              onClick={() => setPatientMode("unknown")}
              aria-pressed={patientMode === "unknown"}
              className={
                patientMode === "unknown"
                  ? "bg-foreground text-background rounded-md px-3 py-1.5 text-[12px] font-medium"
                  : "border-border text-muted-foreground hover:text-foreground rounded-md border px-3 py-1.5 text-[12px]"
              }
            >
              Unknown / John Doe
            </button>
          ) : null}
        </div>
        {patientMode === "known" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="patient_user_id" className="text-[11px] tracking-tight">
              Patient UUID
            </Label>
            <Input
              id="patient_user_id"
              name="patient_user_id"
              placeholder="Paste patient UUID"
              className="font-mono text-[12px]"
              required={!activeType?.allowsUnknownPatient}
            />
            <p className="text-muted-foreground text-[10.5px]">
              Search-by-code picker lands with the patient-directory polish pass.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="patient_unknown_label" className="text-[11px] tracking-tight">
              Describe the patient
            </Label>
            <Input
              id="patient_unknown_label"
              name="patient_unknown_label"
              placeholder="e.g. Unknown female, ~30, brought by police"
              maxLength={240}
              required
            />
          </div>
        )}
      </fieldset>

      {/* Receiving department + entry point */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receiving_department_id" className="text-[11px] tracking-tight">
            Receiving department
          </Label>
          <select
            id="receiving_department_id"
            name="receiving_department_id"
            defaultValue=""
            className="border-input bg-background text-foreground focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-[13px] outline-none focus-visible:ring-[3px]"
          >
            <option value="">— Triage decides —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry_point" className="text-[11px] tracking-tight">
            Entry door
          </Label>
          <select
            id="entry_point"
            name="entry_point"
            defaultValue={isEmergency ? "casualty" : "opd"}
            className="border-input bg-background text-foreground focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-[13px] outline-none focus-visible:ring-[3px]"
          >
            {ENTRY_POINTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Referral block — visible only when relevant */}
      {activeType &&
      (activeType.code === "external_referral_routine" ||
        activeType.code === "external_referral_emergency" ||
        activeType.code === "inter_facility_transfer") ? (
        <fieldset className="border-border bg-card/60 flex flex-col gap-3 rounded-xl border p-4">
          <legend className="text-muted-foreground -ml-1 px-1 font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Referral
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="referring_hospital_id" className="text-[11px] tracking-tight">
                Referring hospital (in network)
              </Label>
              <select
                id="referring_hospital_id"
                name="referring_hospital_id"
                defaultValue=""
                className="border-input bg-background text-foreground focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-[13px] outline-none focus-visible:ring-[3px]"
              >
                <option value="">— Not in network —</option>
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="referring_facility_other" className="text-[11px] tracking-tight">
                Or referring facility name
              </Label>
              <Input
                id="referring_facility_other"
                name="referring_facility_other"
                placeholder="e.g. Soroti HC IV"
                maxLength={240}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="referring_clinician_name" className="text-[11px] tracking-tight">
                Referring clinician (optional)
              </Label>
              <Input
                id="referring_clinician_name"
                name="referring_clinician_name"
                placeholder="Dr / Sister name"
                maxLength={240}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="referral_date" className="text-[11px] tracking-tight">
                Referral date (optional)
              </Label>
              <Input
                id="referral_date"
                name="referral_date"
                type="date"
                className="font-mono text-[13px]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="referral_reason" className="text-[11px] tracking-tight">
              Referral reason
            </Label>
            <textarea
              id="referral_reason"
              name="referral_reason"
              rows={2}
              maxLength={2000}
              placeholder="What the referring facility wrote (or said on the phone)."
              className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring resize-none rounded-md border px-3 py-2 text-[13px] leading-relaxed outline-none focus-visible:ring-[3px]"
            />
          </div>
        </fieldset>
      ) : null}

      {/* Presenting complaint + brought-by */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="presenting_complaint" className="text-[11px] tracking-tight">
          Presenting complaint (optional — triage will refine)
        </Label>
        <textarea
          id="presenting_complaint"
          name="presenting_complaint"
          rows={2}
          maxLength={2000}
          placeholder="What did the patient (or carer) say at the desk?"
          className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring resize-none rounded-md border px-3 py-2 text-[13px] leading-relaxed outline-none focus-visible:ring-[3px]"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brought_by" className="text-[11px] tracking-tight">
            Brought by (optional)
          </Label>
          <Input
            id="brought_by"
            name="brought_by"
            placeholder="Family, police, ambulance…"
            maxLength={240}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priority_hint_override" className="text-[11px] tracking-tight">
            Priority hint
            <span className="text-muted-foreground/80 ml-1 font-normal">
              (default: {activeType?.defaultPriorityHint ?? "routine"})
            </span>
          </Label>
          <select
            id="priority_hint_override"
            name="priority_hint_override"
            defaultValue=""
            className="border-input bg-background text-foreground focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-[13px] outline-none focus-visible:ring-[3px]"
          >
            <option value="">Use default</option>
            <option value="routine">Routine</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason" className="text-[11px] tracking-tight">
          Audit note (≥ 8 chars)
        </Label>
        <Input
          id="reason"
          name="reason"
          minLength={8}
          maxLength={200}
          defaultValue="Patient registered at reception."
          required
        />
      </div>

      {state.error ? (
        <p className="text-destructive border-destructive/30 bg-destructive/5 rounded-md border px-3 py-2 text-[12px] leading-relaxed">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending}>
          <UserPlusIcon className="size-3.5" aria-hidden />
          {pending ? "Registering…" : "Register intake"}
        </Button>
      </div>
    </form>
  );
}
