"use client";

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

const STEPS = ["Account", "Professional identity", "Affiliation"] as const;
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

  // Controlled values for non-native widgets.
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

  // Bubble licence file selection into a hidden <input type="file"> for
  // FormData submission. We re-mirror onto a real file input via a ref.
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    for (const f of licenceFiles) dt.items.add(f.file);
    fileInputRef.current.files = dt.files;
  }, [licenceFiles]);

  // Jump to the step holding a server-side error.
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
    <form
      action={formAction}
      encType="multipart/form-data"
      className="flex flex-col gap-6"
      noValidate
    >
      <ol className="flex items-center gap-1.5" aria-label="Signup progress">
        {STEPS.map((label, i) => {
          const active = i === step;
          const visited = i < step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(i as StepIndex)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
                  active
                    ? "text-foreground bg-teal-500/10"
                    : visited
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground hover:bg-muted",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]",
                    active
                      ? "bg-teal-500 text-white"
                      : visited
                        ? "bg-teal-500/20 text-teal-700 dark:text-teal-300"
                        : "border-border text-muted-foreground border",
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate font-medium">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <FormError message={errors?._form} />

      {/* ── Step 1 — Account ───────────────────────────────────────── */}
      <Section visible={step === 0}>
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

        <Footer>
          <Button type="button" variant="primary" size="md" onClick={next}>
            Next: professional identity
          </Button>
        </Footer>
      </Section>

      {/* ── Step 2 — Professional identity ─────────────────────────── */}
      <Section visible={step === 1}>
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

        <Footer>
          <Button type="button" variant="secondary" size="md" onClick={prev}>
            Back
          </Button>
          <Button type="button" variant="primary" size="md" onClick={next}>
            Next: affiliation
          </Button>
        </Footer>
      </Section>

      {/* ── Step 3 — Affiliation ───────────────────────────────────── */}
      <Section visible={step === 2}>
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

        <Field label="Employment type" htmlFor="employment_type" error={errors?.employment_type}>
          <SegmentedControl
            options={EMPLOYMENT_OPTIONS}
            value={employmentType as (typeof EMPLOYMENT_OPTIONS)[number]["value"] | null}
            onValueChange={(v) => setEmploymentType(v)}
            name="employment_type"
            size="sm"
            aria-label="Employment type"
          />
        </Field>

        <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
          <label htmlFor="consent" className="flex items-start gap-2 text-[13px]">
            <input
              id="consent"
              name="consent"
              type="checkbox"
              required
              className="border-border mt-0.5 size-4 shrink-0 rounded-sm text-teal-500 focus-visible:ring-teal-500"
            />
            <span className="text-foreground/90">
              I confirm I&apos;m the holder of the council registration above. I agree to
              MedSync&apos;s clinical-staff terms — including MFA on every session and that my
              affiliation is inert until my hospital admin approves it.
            </span>
          </label>
          {errors?.consent ? <FieldError message={errors.consent} /> : null}
        </div>

        <Footer>
          <Button type="button" variant="secondary" size="md" onClick={prev}>
            Back
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Submitting…" : "Submit for verification"}
          </Button>
        </Footer>

        <p className="text-muted-foreground mt-2 text-[11.5px]">
          We&apos;ll email you a 6-digit code to confirm your address. After that you&apos;ll land
          in a pending-approval queue for your hospital admin to review.
        </p>
      </Section>
    </form>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────

function Section({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-5", visible ? "block" : "hidden")} aria-hidden={!visible}>
      {children}
    </div>
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

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-gray-150 mt-2 flex items-center justify-end gap-2 border-t pt-4">
      {children}
    </div>
  );
}
