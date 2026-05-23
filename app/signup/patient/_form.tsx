"use client";

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

const STEPS = ["About you", "ID & location", "Account & consent"] as const;
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

  // Controlled fields: things that need a non-native widget. Everything
  // else (text/email/password) is uncontrolled — its value persists in
  // the DOM across step navigation because we render every step's
  // inputs and only toggle CSS display.
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

  // When the server returns an error, jump to the first step that
  // contains an errored field so the user sees the message. We detect
  // the change by comparing the `errors` reference against the prior
  // render's value — React's recommended "store prior values" pattern
  // (lets us setState during render, conditionally, without an effect).
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
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {/* Step tabs — clickable so the user can hop sections */}
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

      {/* ── Step 1 — About you ─────────────────────────────────────── */}
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
          {/* Hidden ISO date for form submission. */}
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

        <Footer>
          <Button type="button" variant="primary" size="md" onClick={next}>
            Next: ID &amp; location
          </Button>
        </Footer>
      </Section>

      {/* ── Step 2 — ID & location ─────────────────────────────────── */}
      <Section visible={step === 1}>
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

        <Footer>
          <Button type="button" variant="secondary" size="md" onClick={prev}>
            Back
          </Button>
          <Button type="button" variant="primary" size="md" onClick={next}>
            Next: account &amp; consent
          </Button>
        </Footer>
      </Section>

      {/* ── Step 3 — account & consent ─────────────────────────────── */}
      <Section visible={step === 2}>
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
              I confirm I&apos;m signing up for my own care record. I agree to MedSync&apos;s
              patient terms — my data stays in Uganda, and only my care team can read my clinical
              record.
            </span>
          </label>
          {errors?.consent ? <FieldError message={errors.consent} /> : null}
        </div>

        <Footer>
          <Button type="button" variant="secondary" size="md" onClick={prev}>
            Back
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </Footer>

        <p className="text-muted-foreground mt-2 text-[11.5px]">
          We&apos;ll email you a 6-digit code to confirm your address. After that, you&apos;re in.
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
