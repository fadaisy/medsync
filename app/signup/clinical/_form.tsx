"use client";

import type { StepDef } from "../_components/step-list";
import type { ClinicalSignupState } from "./actions";
import type { PickedFile } from "@/components/form/file-upload";
import * as React from "react";
import { useActionState } from "react";

import { CascadingCombobox } from "@/components/form/cascading-combobox";
import { Combobox } from "@/components/form/combobox";
import { DatePicker } from "@/components/form/date-picker";
import { FileUpload } from "@/components/form/file-upload";
import { SegmentedControl } from "@/components/form/segmented";
import { FieldError, FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChecklistCard, ReassuranceCard, SupportLine } from "../_components/aside-cards";
import { SignupColumns } from "../_components/signup-columns";
import { StepList, StepPills } from "../_components/step-list";
import { submitClinicalSignupAction } from "./actions";

export interface ClinicalRefItem {
  value: string;
  label: string;
  description?: string;
}

export interface ClinicalRefChildItem extends ClinicalRefItem {
  parentValue: string;
}

export interface ClinicalRefData {
  councils: ReadonlyArray<ClinicalRefItem>;
  cadres: ReadonlyArray<ClinicalRefChildItem>;
  hospitals: ReadonlyArray<ClinicalRefItem>;
  departments: ReadonlyArray<ClinicalRefChildItem>;
  specialties: ReadonlyArray<ClinicalRefItem>;
  roles: ReadonlyArray<ClinicalRefChildItem>;
}

const STEPS: ReadonlyArray<StepDef> = [
  { label: "Account", hint: "Name, email, password, phone" },
  { label: "Professional identity", hint: "Council, registration, licence" },
  { label: "Affiliation", hint: "Hospital, department, role" },
];

type StepIndex = 0 | 1 | 2;

const EMPLOYMENT_OPTIONS = [
  { value: "full_time", label: "Full time" },
  { value: "visiting", label: "Visiting" },
  { value: "locum", label: "Locum" },
] as const;

const PRIMARY_ROLE_OPTIONS = [
  { value: "clinician", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "lab_tech", label: "Lab tech" },
] as const;

const initialState: ClinicalSignupState = {};

function isStepIndex(n: number): n is StepIndex {
  return n === 0 || n === 1 || n === 2;
}

export function ClinicalSignupForm({ refData }: { refData: ClinicalRefData }) {
  const [state, formAction, pending] = useActionState(submitClinicalSignupAction, initialState);
  const initialValues = state.values ?? {};

  const [step, setStep] = React.useState<StepIndex>(0);

  const [councilId, setCouncilId] = React.useState<string | null>(initialValues.council_id || null);
  const [expiry, setExpiry] = React.useState<Date | null>(
    initialValues.registration_expiry ? new Date(initialValues.registration_expiry) : null,
  );
  const [licenceFiles, setLicenceFiles] = React.useState<PickedFile[]>([]);
  const [hospitalId, setHospitalId] = React.useState<string | null>(
    initialValues.hospital_id || null,
  );
  const [departmentId, setDepartmentId] = React.useState<string | null>(
    initialValues.department_id || null,
  );
  const [cadreId, setCadreId] = React.useState<string | null>(initialValues.cadre_id || null);
  const [roleId, setRoleId] = React.useState<string | null>(initialValues.role_id || null);
  const [specialtyId, setSpecialtyId] = React.useState<string | null>(
    initialValues.specialty_id || null,
  );
  const [employmentType, setEmploymentType] = React.useState<string | null>(
    initialValues.employment_type ?? null,
  );
  const [primaryRole, setPrimaryRole] = React.useState<string | null>(
    initialValues.primary_role ?? null,
  );

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    for (const f of licenceFiles) dt.items.add(f.file);
    fileInputRef.current.files = dt.files;
  }, [licenceFiles]);

  const { errors } = state;
  const [prevErrors, setPrevErrors] = React.useState(errors);
  if (errors !== prevErrors) {
    setPrevErrors(errors);
    if (errors) {
      let nextStep: StepIndex = step;
      if (errors.full_name || errors.email || errors.password || errors.phone) {
        nextStep = 0;
      } else if (
        errors.council_id ||
        errors.registration_number ||
        errors.registration_expiry ||
        errors.licence_document ||
        errors.primary_role
      ) {
        nextStep = 1;
      } else if (
        errors.hospital_id ||
        errors.department_id ||
        errors.cadre_id ||
        errors.role_id ||
        errors.employment_type ||
        errors.consent ||
        errors._form
      ) {
        nextStep = 2;
      }
      if (nextStep !== step) setStep(nextStep);
    }
  }

  function next() {
    if (step < 2) setStep((s) => (isStepIndex(s + 1) ? ((s + 1) as StepIndex) : s));
  }
  function prev() {
    if (step > 0) setStep((s) => (isStepIndex(s - 1) ? ((s - 1) as StepIndex) : s));
  }

  return (
    <SignupColumns
      aside={
        <>
          <StepList<StepIndex> steps={STEPS} current={step} onChange={setStep} />
          <ChecklistCard
            title="You'll need"
            tone="tealTinted"
            items={[
              "Your council registration number (UMDPC / UNMC / AHPC / PSU)",
              "A scan of your practising licence (PDF, JPG or PNG · up to 5 MB)",
              "The hospital + department you're joining",
            ]}
          />
          <ChecklistCard
            title="After you submit"
            items={[
              "Email OTP to confirm your address (~1 min)",
              "MFA enrolment — mandatory for clinical roles",
              "Hospital admin approves your affiliation — usually within a working day",
            ]}
          />
          <ReassuranceCard />
          <SupportLine />
        </>
      }
      form={
        <form action={formAction} className="flex flex-col gap-5" noValidate>
          <StepPills<StepIndex> steps={STEPS} current={step} onChange={setStep} />

          <FormError message={errors?._form} />

          {/* ── Step 1 — Account ───────────────────────────────────── */}
          <StepCard
            visible={step === 0}
            number="01"
            title="Account basics"
            description="Your work email and a strong password."
          >
            <Field label="Full name" htmlFor="full_name" error={errors?.full_name}>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                defaultValue={initialValues.full_name}
                aria-invalid={!!errors?.full_name}
              />
            </Field>

            <Field
              label="Institutional email"
              htmlFor="email"
              error={errors?.email}
              hint="Use the email your hospital uses for your account."
            >
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={initialValues.email}
                aria-invalid={!!errors?.email}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={errors?.password}
              hint="At least 12 characters."
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                aria-invalid={!!errors?.password}
              />
            </Field>

            <Field label="Phone" htmlFor="phone" error={errors?.phone}>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+256 700 000 000"
                required
                defaultValue={initialValues.phone}
                aria-invalid={!!errors?.phone}
              />
            </Field>
          </StepCard>

          {/* ── Step 2 — Professional identity ─────────────────────── */}
          <StepCard
            visible={step === 1}
            number="02"
            title="Professional identity"
            description="Council registration + your current practising licence."
          >
            <Field label="Council" htmlFor="council_id" error={errors?.council_id}>
              <Combobox
                id="council_id"
                items={refData.councils}
                value={councilId}
                onValueChange={(v) => {
                  setCouncilId(v);
                  setCadreId(null);
                  setRoleId(null);
                }}
                name="council_id"
                placeholder="Pick a regulator"
                searchPlaceholder="UMDPC, UNMC, AHPC, PSU…"
              />
            </Field>

            <Field
              label="Council registration number"
              htmlFor="registration_number"
              error={errors?.registration_number}
            >
              <Input
                id="registration_number"
                name="registration_number"
                type="text"
                autoComplete="off"
                required
                defaultValue={initialValues.registration_number}
                aria-invalid={!!errors?.registration_number}
                className="font-mono tracking-wider"
              />
            </Field>

            <Field
              label="Registration expiry (optional)"
              htmlFor="registration_expiry"
              error={errors?.registration_expiry}
              hint="Practising certificate expiry, if you have it."
            >
              <DatePicker
                id="registration_expiry"
                mode="single"
                value={expiry}
                onValueChange={setExpiry}
                placeholder="Pick expiry date"
                withDropdownCaption={false}
                fromDate={new Date()}
              />
              <input
                type="hidden"
                name="registration_expiry"
                value={expiry ? expiry.toISOString().slice(0, 10) : ""}
              />
            </Field>

            <Field
              label="Licence document"
              htmlFor="licence_document"
              error={errors?.licence_document}
              hint="PDF, JPG or PNG up to 5 MB. Stored encrypted; only your hospital admin and a superadmin can open it."
            >
              <FileUpload
                id="licence_document_picker"
                value={licenceFiles}
                onFilesChange={setLicenceFiles}
                accept=".pdf,image/jpeg,image/png"
                maxSize={5 * 1024 * 1024}
                aria-label="Licence document"
              />
              <input
                ref={fileInputRef}
                type="file"
                name="licence_document"
                accept=".pdf,image/jpeg,image/png"
                className="hidden"
                tabIndex={-1}
                aria-hidden
              />
            </Field>

            <Field label="Primary role" htmlFor="primary_role" error={errors?.primary_role}>
              <SegmentedControl
                options={PRIMARY_ROLE_OPTIONS}
                value={primaryRole as (typeof PRIMARY_ROLE_OPTIONS)[number]["value"] | null}
                onValueChange={(v) => setPrimaryRole(v)}
                name="primary_role"
                size="sm"
                aria-label="Primary role"
              />
            </Field>
          </StepCard>

          {/* ── Step 3 — Affiliation ───────────────────────────────── */}
          <StepCard
            visible={step === 2}
            number="03"
            title="First affiliation"
            description="Pick where you'll be practising. You can add more after approval."
          >
            <Field label="Hospital" htmlFor="hospital_id" error={errors?.hospital_id}>
              <Combobox
                id="hospital_id"
                items={refData.hospitals}
                value={hospitalId}
                onValueChange={(v) => {
                  setHospitalId(v);
                  setDepartmentId(null);
                }}
                name="hospital_id"
                placeholder="Pick a hospital"
                searchPlaceholder="Search hospitals…"
              />
            </Field>

            <Field label="Department" htmlFor="department_id" error={errors?.department_id}>
              <CascadingCombobox
                id="department_id"
                items={refData.departments}
                parentValue={hospitalId}
                value={departmentId}
                onValueChange={setDepartmentId}
                name="department_id"
                placeholder="Pick a department"
                placeholderEmptyParent="Pick a hospital first"
              />
            </Field>

            <Field label="Cadre" htmlFor="cadre_id" error={errors?.cadre_id}>
              <CascadingCombobox
                id="cadre_id"
                items={refData.cadres}
                parentValue={councilId}
                value={cadreId}
                onValueChange={(v) => {
                  setCadreId(v);
                  setRoleId(null);
                }}
                name="cadre_id"
                placeholder="Pick a cadre"
                placeholderEmptyParent="Pick a council in step 2 first"
              />
            </Field>

            <Field label="Role" htmlFor="role_id" error={errors?.role_id}>
              <CascadingCombobox
                id="role_id"
                items={refData.roles}
                parentValue={cadreId}
                value={roleId}
                onValueChange={setRoleId}
                name="role_id"
                placeholder="Pick a role"
                placeholderEmptyParent="Pick a cadre first"
              />
            </Field>

            <Field label="Specialty (optional)" htmlFor="specialty_id" error={errors?.specialty_id}>
              <Combobox
                id="specialty_id"
                items={refData.specialties}
                value={specialtyId}
                onValueChange={setSpecialtyId}
                name="specialty_id"
                placeholder="Search specialties…"
                searchPlaceholder="Cardiology, Nephrology…"
              />
            </Field>

            <Field
              label="Employment type"
              htmlFor="employment_type"
              error={errors?.employment_type}
            >
              <SegmentedControl
                options={EMPLOYMENT_OPTIONS}
                value={employmentType as (typeof EMPLOYMENT_OPTIONS)[number]["value"] | null}
                onValueChange={(v) => setEmploymentType(v)}
                name="employment_type"
                size="sm"
                aria-label="Employment type"
              />
            </Field>

            <ConsentBox error={errors?.consent}>
              I confirm I&apos;m the holder of the council registration above. I agree to
              MedSync&apos;s clinical-staff terms — including MFA on every session and that my
              affiliation is inert until my hospital admin approves it.
            </ConsentBox>

            <p className="text-muted-foreground -mt-1 text-[11.5px]">
              We&apos;ll email you a 6-digit code to confirm your address. After that you land in
              your hospital admin&apos;s approval queue.
            </p>
          </StepCard>

          <Footer
            step={step}
            onPrev={prev}
            onNext={next}
            pending={pending}
            submitLabel={pending ? "Submitting…" : "Submit for verification"}
          />
        </form>
      }
    />
  );
}

// ─── Shared chrome (same as patient form) ───────────────────────────────

function StepCard({
  visible,
  number,
  title,
  description,
  children,
}: {
  visible: boolean;
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-border bg-card flex flex-col gap-5 rounded-xl border p-5 shadow-xs sm:p-6",
        visible ? "block" : "hidden",
      )}
      aria-hidden={!visible}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="border-border bg-muted text-muted-foreground inline-flex h-6 items-center rounded-xs border px-1.5 font-mono text-[11px] leading-none font-semibold tabular-nums"
        >
          [{number}]
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-foreground text-[16px] leading-tight font-medium">{title}</h2>
          <p className="text-muted-foreground text-[12.5px] leading-snug">{description}</p>
        </div>
      </header>
      <div className="border-border -mx-5 border-t sm:-mx-6" />
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <p className="text-muted-foreground text-[11.5px]">{hint}</p>
      ) : null}
    </div>
  );
}

function ConsentBox({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-md border p-3">
      <label htmlFor="consent" className="flex items-start gap-2 text-[13px]">
        <input
          id="consent"
          name="consent"
          type="checkbox"
          required
          className="border-border mt-0.5 size-4 shrink-0 rounded-sm text-teal-500 focus-visible:ring-teal-500"
        />
        <span className="text-foreground/90 leading-snug">{children}</span>
      </label>
      {error ? <FieldError message={error} /> : null}
    </div>
  );
}

function Footer({
  step,
  onPrev,
  onNext,
  pending,
  submitLabel,
}: {
  step: StepIndex;
  onPrev: () => void;
  onNext: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={onPrev}
        disabled={step === 0}
        className={cn(step === 0 && "invisible")}
      >
        &larr; Back
      </Button>
      {step < 2 ? (
        <Button type="button" variant="primary" size="md" onClick={onNext}>
          Continue
        </Button>
      ) : (
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {submitLabel}
        </Button>
      )}
    </div>
  );
}
