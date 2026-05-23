"use client";

import type { HospitalSignupState } from "./actions";
import type { PickedFile } from "@/components/form/file-upload";
import * as React from "react";
import { useActionState } from "react";

import { CascadingCombobox } from "@/components/form/cascading-combobox";
import { Combobox } from "@/components/form/combobox";
import { FileUpload } from "@/components/form/file-upload";
import { SegmentedControl } from "@/components/form/segmented";
import { FieldError, FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { submitHospitalSignupAction } from "./actions";

export interface DistrictOption {
  value: string;
  label: string;
  description?: string;
}

export interface SubcountyOption {
  value: string;
  label: string;
  parentValue: string;
}

interface HospitalSignupFormProps {
  districts: ReadonlyArray<DistrictOption>;
  subcounties: ReadonlyArray<SubcountyOption>;
}

const STEPS = ["Hospital", "Location & registration", "Applicant & account"] as const;
type StepIndex = 0 | 1 | 2;

const LEVEL_OPTIONS = [
  { value: "national_referral", label: "National referral", description: "Mulago-tier" },
  { value: "regional", label: "Regional referral" },
  { value: "district", label: "District / general" },
  { value: "hc4", label: "Health centre IV" },
  { value: "hc3", label: "Health centre III" },
  { value: "private", label: "Private hospital" },
] as const;

const OWNERSHIP_OPTIONS = [
  { value: "public_moh", label: "Public · MoH" },
  { value: "private", label: "Private" },
  { value: "ngo_faith_based", label: "NGO / Faith-based" },
  { value: "private_clinic", label: "Private clinic" },
] as const;

const initialState: HospitalSignupState = {};

function isStepIndex(n: number): n is StepIndex {
  return n === 0 || n === 1 || n === 2;
}

export function HospitalSignupForm({ districts, subcounties }: HospitalSignupFormProps) {
  const [state, formAction, pending] = useActionState(submitHospitalSignupAction, initialState);
  const initialValues = state.values ?? {};

  const [step, setStep] = React.useState<StepIndex>(0);

  const [level, setLevel] = React.useState<string | null>(initialValues.level ?? null);
  const [ownership, setOwnership] = React.useState<string | null>(initialValues.ownership ?? null);
  const [districtId, setDistrictId] = React.useState<string | null>(
    initialValues.district_id || null,
  );
  const [subcountyId, setSubcountyId] = React.useState<string | null>(
    initialValues.subcounty_id || null,
  );
  const [authFiles, setAuthFiles] = React.useState<PickedFile[]>([]);

  // Mirror the picked file into a real <input type="file"> so the
  // FormData submission carries it.
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!fileInputRef.current) return;
    const dt = new DataTransfer();
    for (const f of authFiles) dt.items.add(f.file);
    fileInputRef.current.files = dt.files;
  }, [authFiles]);

  const { errors } = state;
  const [prevErrors, setPrevErrors] = React.useState(errors);
  if (errors !== prevErrors) {
    setPrevErrors(errors);
    if (errors) {
      let nextStep: StepIndex = step;
      if (errors.hospital_name || errors.level || errors.ownership) {
        nextStep = 0;
      } else if (
        errors.registration_number ||
        errors.registration_authority ||
        errors.district_id ||
        errors.subcounty_id ||
        errors.physical_address ||
        errors.institutional_email_domain
      ) {
        nextStep = 1;
      } else if (
        errors.full_name ||
        errors.email ||
        errors.password ||
        errors.phone ||
        errors.applicant_role ||
        errors.authorisation_document ||
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
      <ol className="flex items-center gap-1.5" aria-label="Application progress">
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

      {/* ── Step 1 — Hospital basics ───────────────────────────────── */}
      <Section visible={step === 0}>
        <Field label="Official hospital name" htmlFor="hospital_name" error={errors?.hospital_name}>
          <Input
            id="hospital_name"
            name="hospital_name"
            type="text"
            required
            defaultValue={initialValues.hospital_name}
            aria-invalid={!!errors?.hospital_name}
            placeholder="e.g. Mulago National Referral Hospital"
          />
        </Field>

        <Field label="Facility level" htmlFor="level" error={errors?.level}>
          <Combobox
            id="level"
            items={LEVEL_OPTIONS as ReadonlyArray<{ value: string; label: string }>}
            value={level}
            onValueChange={setLevel}
            name="level"
            placeholder="Select level"
            searchPlaceholder="National referral, district, HC4…"
          />
        </Field>

        <Field label="Ownership" htmlFor="ownership" error={errors?.ownership}>
          <SegmentedControl
            options={OWNERSHIP_OPTIONS}
            value={ownership as (typeof OWNERSHIP_OPTIONS)[number]["value"] | null}
            onValueChange={(v) => setOwnership(v)}
            name="ownership"
            size="sm"
            aria-label="Ownership"
          />
        </Field>

        <Footer>
          <Button type="button" variant="primary" size="md" onClick={next}>
            Next: location &amp; registration
          </Button>
        </Footer>
      </Section>

      {/* ── Step 2 — Location & registration ───────────────────────── */}
      <Section visible={step === 1}>
        <Field
          label="Registration / licence number"
          htmlFor="registration_number"
          error={errors?.registration_number}
        >
          <Input
            id="registration_number"
            name="registration_number"
            type="text"
            required
            defaultValue={initialValues.registration_number}
            aria-invalid={!!errors?.registration_number}
            className="font-mono tracking-wider"
          />
        </Field>

        <Field
          label="Registering authority (optional)"
          htmlFor="registration_authority"
          error={errors?.registration_authority}
          hint="MoH Facility List, Uganda Investment Authority, etc."
        >
          <Input
            id="registration_authority"
            name="registration_authority"
            type="text"
            defaultValue={initialValues.registration_authority}
          />
        </Field>

        <Field label="District" htmlFor="district_id" error={errors?.district_id}>
          <Combobox
            id="district_id"
            items={districts}
            value={districtId}
            onValueChange={(v) => {
              setDistrictId(v);
              setSubcountyId(null);
            }}
            name="district_id"
            placeholder="Search districts…"
          />
        </Field>

        <Field
          label="Subcounty / division"
          htmlFor="subcounty_id"
          error={errors?.subcounty_id}
          hint={
            districtId && !subcounties.some((s) => s.parentValue === districtId)
              ? "Subcounty list isn't loaded for this district yet — leave blank."
              : undefined
          }
        >
          <CascadingCombobox
            id="subcounty_id"
            items={subcounties}
            parentValue={districtId}
            value={subcountyId}
            onValueChange={setSubcountyId}
            name="subcounty_id"
            placeholder="Pick a subcounty"
            placeholderEmptyParent="Pick a district first"
          />
        </Field>

        <Field label="Physical address" htmlFor="physical_address" error={errors?.physical_address}>
          <Input
            id="physical_address"
            name="physical_address"
            type="text"
            required
            defaultValue={initialValues.physical_address}
            aria-invalid={!!errors?.physical_address}
            placeholder="Plot, road, locality"
          />
        </Field>

        <Field
          label="Institutional email domain (optional)"
          htmlFor="institutional_email_domain"
          error={errors?.institutional_email_domain}
          hint="e.g. mulago.go.ug — used later to verify clinician emails belong to your facility."
        >
          <Input
            id="institutional_email_domain"
            name="institutional_email_domain"
            type="text"
            defaultValue={initialValues.institutional_email_domain}
            placeholder="mulago.go.ug"
            className="font-mono tracking-wider"
          />
        </Field>

        <Footer>
          <Button type="button" variant="secondary" size="md" onClick={prev}>
            Back
          </Button>
          <Button type="button" variant="primary" size="md" onClick={next}>
            Next: applicant &amp; account
          </Button>
        </Footer>
      </Section>

      {/* ── Step 3 — Applicant + account ───────────────────────────── */}
      <Section visible={step === 2}>
        <Field label="Your full name" htmlFor="full_name" error={errors?.full_name}>
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
          label="Your role at the facility"
          htmlFor="applicant_role"
          error={errors?.applicant_role}
          hint="Director, Hospital Administrator, IT lead, etc."
        >
          <Input
            id="applicant_role"
            name="applicant_role"
            type="text"
            required
            defaultValue={initialValues.applicant_role}
            aria-invalid={!!errors?.applicant_role}
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

        <Field label="Email" htmlFor="email" error={errors?.email}>
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

        <Field
          label="Letter of authority"
          htmlFor="authorisation_document"
          error={errors?.authorisation_document}
          hint="PDF, JPG or PNG up to 5 MB. A signed letter on facility letterhead confirming you may apply on behalf of the hospital."
        >
          <FileUpload
            id="authorisation_document_picker"
            value={authFiles}
            onFilesChange={setAuthFiles}
            accept=".pdf,image/jpeg,image/png"
            maxSize={5 * 1024 * 1024}
            aria-label="Letter of authority"
          />
          <input
            ref={fileInputRef}
            type="file"
            name="authorisation_document"
            accept=".pdf,image/jpeg,image/png"
            className="hidden"
            tabIndex={-1}
            aria-hidden
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
              I confirm I have authority to apply on behalf of this facility. I agree to
              MedSync&apos;s pilot terms — including MFA on every session, and that no clinical data
              lands until a MedSync superadmin reviews this application.
            </span>
          </label>
          {errors?.consent ? <FieldError message={errors.consent} /> : null}
        </div>

        <Footer>
          <Button type="button" variant="secondary" size="md" onClick={prev}>
            Back
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        </Footer>

        <p className="text-muted-foreground mt-2 text-[11.5px]">
          We&apos;ll email you a 6-digit code to confirm your address. After that your application
          lands in the MedSync superadmin review queue.
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
