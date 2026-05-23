"use client";

import type { StepDef } from "../_components/step-list";
import type { SignupState } from "./actions";
import * as React from "react";
import { useActionState } from "react";

import { CascadingCombobox } from "@/components/form/cascading-combobox";
import { Combobox } from "@/components/form/combobox";
import { DatePicker } from "@/components/form/date-picker";
import { SegmentedControl } from "@/components/form/segmented";
import { FieldError, FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChecklistCard, ReassuranceCard, SupportLine } from "../_components/aside-cards";
import { SignupColumns } from "../_components/signup-columns";
import { StepList, StepPills } from "../_components/step-list";
import { submitSignupAction } from "./actions";

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

interface PatientSignupFormProps {
  districts: ReadonlyArray<DistrictOption>;
  subcounties: ReadonlyArray<SubcountyOption>;
}

const STEPS: ReadonlyArray<StepDef> = [
  { label: "About you", hint: "Name, sex, date of birth, phone" },
  { label: "ID & location", hint: "NIN or passport, district, language" },
  { label: "Account & consent", hint: "Email, password, terms" },
];

type StepIndex = 0 | 1 | 2;

const SEX_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
] as const;

const ID_OPTIONS = [
  { value: "nin", label: "NIN" },
  { value: "passport", label: "Passport" },
  { value: "refugee", label: "Refugee ID" },
  { value: "none", label: "None" },
] as const;

const initialState: SignupState = {};

function isStepIndex(n: number): n is StepIndex {
  return n === 0 || n === 1 || n === 2;
}

export function PatientSignupForm({ districts, subcounties }: PatientSignupFormProps) {
  const [state, formAction, pending] = useActionState(submitSignupAction, initialState);
  const initialValues = state.values ?? {};

  const [step, setStep] = React.useState<StepIndex>(0);

  const [sex, setSex] = React.useState<string | null>(initialValues.sex ?? null);
  const [dob, setDob] = React.useState<Date | null>(
    initialValues.date_of_birth ? new Date(initialValues.date_of_birth) : null,
  );
  const [idType, setIdType] = React.useState<string | null>(initialValues.id_type ?? null);
  const [districtId, setDistrictId] = React.useState<string | null>(
    initialValues.district_id || null,
  );
  const [subcountyId, setSubcountyId] = React.useState<string | null>(
    initialValues.subcounty_id || null,
  );

  // Jump to the step holding a server-side error (store-prior-values pattern).
  const { errors } = state;
  const [prevErrors, setPrevErrors] = React.useState(errors);
  if (errors !== prevErrors) {
    setPrevErrors(errors);
    if (errors) {
      let nextStep: StepIndex = step;
      if (errors.full_name || errors.sex || errors.date_of_birth || errors.phone) {
        nextStep = 0;
      } else if (errors.id_type || errors.id_number || errors.district_id) {
        nextStep = 1;
      } else if (errors.email || errors.password || errors.consent || errors._form) {
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
            title="What you'll get"
            tone="tealTinted"
            items={[
              "A patient ID (MS-2026-XXXXX) for any MedSync hospital",
              "Encrypted record only you and your care team can read",
              "SMS reminders for medications and follow-ups",
            ]}
          />
          <ReassuranceCard />
          <SupportLine />
        </>
      }
      form={
        <form
          action={formAction}
          className="flex flex-col gap-5"
          noValidate
          // Enter inside any text input would otherwise submit the form
          // from the wrong step (we render every step in the DOM and
          // CSS-hide the inactive ones, so the submit button on step 3
          // is reachable from a stray Enter on step 1 or 2). Block it
          // unless the user is actually on the final step.
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const target = e.target as HTMLElement;
            if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
            if (step !== 2) e.preventDefault();
          }}
          // Final defence: even if React reuses a button DOM node when
          // Continue → Submit re-renders mid-click and the in-flight
          // event lands on the freshly-mounted submit button, block
          // submission unless we're actually on the last step. Without
          // this guard the user was getting silently bounced back from
          // step 3 with empty step-3 fields (email / password / consent),
          // and our error-jump pattern was hiding the cause.
          onSubmit={(e) => {
            if (step !== 2) e.preventDefault();
          }}
        >
          <StepPills<StepIndex> steps={STEPS} current={step} onChange={setStep} />

          <FormError message={errors?._form} />

          {/* ── Step 1 — About you ─────────────────────────────────── */}
          <StepCard
            visible={step === 0}
            number="01"
            title="About you"
            description="Basics your care team uses to find your record."
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

            <Field label="Sex" htmlFor="sex" error={errors?.sex}>
              <SegmentedControl
                options={SEX_OPTIONS}
                value={sex as (typeof SEX_OPTIONS)[number]["value"] | null}
                onValueChange={(v) => setSex(v)}
                name="sex"
                aria-label="Sex"
              />
            </Field>

            <Field label="Date of birth" htmlFor="date_of_birth" error={errors?.date_of_birth}>
              <DatePicker
                id="date_of_birth"
                mode="single"
                value={dob}
                onValueChange={setDob}
                placeholder="Pick your date of birth"
                fromDate={new Date(1900, 0, 1)}
                toDate={new Date()}
                aria-invalid={!!errors?.date_of_birth}
              />
              <input
                type="hidden"
                name="date_of_birth"
                value={dob ? dob.toISOString().slice(0, 10) : ""}
              />
            </Field>

            <Field label="Phone (with country code)" htmlFor="phone" error={errors?.phone}>
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

          {/* ── Step 2 — ID & location ─────────────────────────────── */}
          <StepCard
            visible={step === 1}
            number="02"
            title="ID & location"
            description="What we encrypt and where to route your follow-ups."
          >
            <Field label="ID type" htmlFor="id_type" error={errors?.id_type}>
              <SegmentedControl
                options={ID_OPTIONS}
                value={idType as (typeof ID_OPTIONS)[number]["value"] | null}
                onValueChange={(v) => setIdType(v)}
                name="id_type"
                size="sm"
                aria-label="ID type"
              />
            </Field>

            <Field
              label={idType === "none" ? "ID number (not applicable)" : "ID number"}
              htmlFor="id_number"
              error={errors?.id_number}
              hint="Encrypted at rest. Only you and your care team can read it."
            >
              <Input
                id="id_number"
                name="id_number"
                type="text"
                autoComplete="off"
                disabled={idType === "none"}
                defaultValue={initialValues.id_number}
                aria-invalid={!!errors?.id_number}
                className="font-mono tracking-wider"
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
                searchPlaceholder="Type a district name"
                emptyMessage="No matches in this list."
              />
            </Field>

            <Field
              label="Subcounty / division"
              htmlFor="subcounty_id"
              error={errors?.subcounty_id}
              hint={
                districtId && !subcounties.some((s) => s.parentValue === districtId)
                  ? "Subcounty list isn't loaded for this district yet — leave blank for now."
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

            <Field
              label="Preferred language (optional)"
              htmlFor="preferred_language"
              error={errors?.preferred_language}
              hint="English, Luganda, Runyankole, Luo… free-form for now."
            >
              <Input
                id="preferred_language"
                name="preferred_language"
                type="text"
                autoComplete="off"
                defaultValue={initialValues.preferred_language}
              />
            </Field>
          </StepCard>

          {/* ── Step 3 — account & consent ─────────────────────────── */}
          <StepCard
            visible={step === 2}
            number="03"
            title="Account & consent"
            description="One last step before we email your verification code."
          >
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
              hint="At least 12 characters. Use something you can remember."
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

            <ConsentBox error={errors?.consent}>
              I confirm I&apos;m signing up for my own care record. I agree to MedSync&apos;s
              patient terms — my data stays in Uganda, and only my care team can read my clinical
              record.
            </ConsentBox>

            <p className="text-muted-foreground -mt-1 text-[11.5px]">
              We&apos;ll email you a 6-digit code to confirm your address. After that, you&apos;re
              in.
            </p>
          </StepCard>

          {/* Footer — sticky on small screens for thumb reach */}
          <Footer
            step={step}
            onPrev={prev}
            onNext={next}
            pending={pending}
            submitLabel={pending ? "Creating account…" : "Create account"}
          />
        </form>
      }
    />
  );
}

// ─── Layout / chrome primitives ─────────────────────────────────────────

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
        "border-border bg-card flex flex-col gap-5 rounded-xl border p-5 sm:p-6",
        "shadow-xs",
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
        <Button
          key="continue"
          type="button"
          variant="primary"
          size="md"
          onClick={(e) => {
            // Drop focus so a subsequent Enter can't land on the
            // freshly-mounted Submit button after the re-render.
            e.currentTarget.blur();
            onNext();
          }}
        >
          Continue
        </Button>
      ) : (
        <Button key="submit" type="submit" variant="primary" size="md" disabled={pending}>
          {submitLabel}
        </Button>
      )}
    </div>
  );
}
