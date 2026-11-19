"use client";

import type { HospitalOption } from "../../_components/staff-work";
import type { Choice } from "@/components/onboarding/fields";
import type { ClinicalInput } from "@/lib/onboarding/schemas";
import { PlusIcon } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { ConsentBlock } from "@/components/onboarding/consent-block";
import { DocumentField } from "@/components/onboarding/document-field";
import {
  EmailField,
  FieldError,
  fieldId,
  PasswordField,
  PhoneField,
  revealClass,
  SelectField,
  TextField,
  useFieldValue,
} from "@/components/onboarding/fields";
import { LeadDialog } from "@/components/onboarding/lead-dialog";
import { ProfessionField } from "@/components/onboarding/profession-field";
import { FormHeader, Section, SectionedForm } from "@/components/onboarding/sectioned-form";
import { Button } from "@/components/ui/button";
import { CLINICAL, STAFF_COMMON, TETHER_SIGNUP } from "@/content/onboarding";
import { STAFF } from "@/content/onboarding-staff";
import { professionById, PROFESSIONS, registrationLabel } from "@/lib/onboarding/profession";
import { clinicalSchema } from "@/lib/onboarding/schemas";
import { MAX_EXTRA_WORKPLACES } from "@/lib/onboarding/workplaces";
import { cn } from "@/lib/utils";
import { WorkFields } from "../../_components/staff-work";
import { submitClinicalSignup } from "../actions";

const SECTIONS = [
  { id: "you", title: CLINICAL.sections.you, fields: ["fullName", "email", "phone", "password"] },
  {
    id: "practice",
    title: CLINICAL.sections.practice,
    fields: ["profession", "specialty", "registrationNumber", "licence"],
  },
  {
    id: "work",
    title: CLINICAL.sections.work,
    // An array's own message sits at `.root` (the resolver puts it there); the bare name counts it.
    fields: [
      "hospitalId",
      "departmentId",
      "employmentType",
      "moreWorkplaces",
      "moreWorkplaces.root",
    ],
  },
] as const;

/** Files never go in the draft: a restored "file" would have no file behind it. */
const SECRET = ["licence"] as const;

export function ClinicalSignupForm({
  notice,
  hospitals,
  specialties,
  tether,
}: {
  notice: { version: string; sha: string; body: string; effective: string };
  hospitals: readonly HospitalOption[];
  specialties: readonly Choice[];
  /** On the Tether domain the heading names Tether (ADR 0511). */
  tether?: boolean;
}) {
  return (
    <SectionedForm<ClinicalInput>
      form="clinical"
      schema={clinicalSchema}
      defaults={{
        consentVersion: notice.version,
        consentSha: notice.sha,
        employmentType: "full_time",
      }}
      sections={SECTIONS}
      secret={SECRET}
      submit={submitClinicalSignup}
      submitLabel={CLINICAL.submit}
      pendingLabel={CLINICAL.pending}
      header={
        <FormHeader
          kicker={CLINICAL.kicker}
          title={tether ? TETHER_SIGNUP.clinicalTitle : CLINICAL.title}
          lead={CLINICAL.lead}
        />
      }
      consent={
        <ConsentBlock version={notice.version} effective={notice.effective} body={notice.body} />
      }
      after={CLINICAL.after}
    >
      <Section id="you">
        <TextField
          name="fullName"
          label={STAFF_COMMON.fullName}
          autoComplete="name"
          autoCapitalize="words"
        />
        <EmailField name="email" label={STAFF_COMMON.email} />
        <PhoneField name="phone" label={STAFF_COMMON.phone} />
        <PasswordField
          name="password"
          label={STAFF_COMMON.password}
          hint={STAFF_COMMON.passwordHint}
        />
      </Section>
      <Section id="practice">
        <PracticeFields specialties={specialties} />
      </Section>
      <Section id="work">
        <ClinicalWorkFields hospitals={hospitals} tether={tether} />
        <MoreWorkplaces hospitals={hospitals} />
      </Section>
    </SectionedForm>
  );
}

/** A profession tied to one department (laboratory, imaging, pharmacy) has it chosen for them. */
function ClinicalWorkFields({
  hospitals,
  tether,
}: {
  hospitals: readonly HospitalOption[];
  tether?: boolean;
}) {
  const profession = professionById(useFieldValue("profession") ?? "");
  return (
    <WorkFields
      hospitals={hospitals}
      departmentLabel={STAFF_COMMON.department}
      fixedDepartment={profession?.department}
      afterHospital={
        <LeadDialog
          source="clinical_signup"
          trigger={tether ? TETHER_SIGNUP.notOnTether : CLINICAL.notOnMedSync}
        />
      }
    />
  );
}

/**
 * Hospitals after the first (ADR 0530): add one, choose its department, employment and (if it
 * differs) the post held there, or remove it. A hospital chosen once is not offered again.
 */
function MoreWorkplaces({ hospitals }: { hospitals: readonly HospitalOption[] }) {
  const { control } = useFormContext<ClinicalInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "moreWorkplaces" });
  const main = professionById(useFieldValue("profession") ?? "");
  const first = useFieldValue("hospitalId") ?? "";
  const rows = useFieldValue<ClinicalInput["moreWorkplaces"]>("moreWorkplaces") ?? [];
  const posts = PROFESSIONS.filter((p) => p.council === main?.council).map((p) => ({
    value: p.id,
    label: p.label,
  }));
  const id = fieldId("moreWorkplaces.root");
  return (
    <div id={id} tabIndex={-1} className="flex flex-col gap-5 outline-none">
      {fields.map((f, i) => {
        const prefix = `moreWorkplaces.${i}.`;
        const taken = [first, ...rows.filter((_, j) => j !== i).map((r) => r?.hospitalId ?? "")];
        return (
          <fieldset
            key={f.id}
            className={cn("border-border flex flex-col gap-5 border-t pt-5", revealClass)}
          >
            <legend className="sr-only">{CLINICAL.hospitalNumber(i + 2)}</legend>
            <div className="flex items-center justify-between gap-3">
              <p aria-hidden className="text-body-m text-foreground font-medium">
                {CLINICAL.hospitalNumber(i + 2)}
              </p>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`${CLINICAL.removeHospital}: ${CLINICAL.hospitalNumber(i + 2)}`}
                className="text-body-s min-h-11 font-medium text-teal-700 underline underline-offset-4 dark:text-teal-400"
              >
                {CLINICAL.removeHospital}
              </button>
            </div>
            <WorkFields
              hospitals={hospitals}
              prefix={prefix}
              exclude={taken}
              departmentLabel={STAFF_COMMON.department}
              fixedDepartment={(professionById(rows[i]?.profession ?? "") ?? main)?.department}
            >
              {posts.length > 1 ? (
                <SelectField
                  name={`${prefix}profession`}
                  label={CLINICAL.postThere}
                  options={posts}
                  placeholder={CLINICAL.postSame}
                  optional
                />
              ) : null}
            </WorkFields>
          </fieldset>
        );
      })}
      <FieldError name="moreWorkplaces.root" />
      {fields.length < MAX_EXTRA_WORKPLACES ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-s text-muted-foreground">{CLINICAL.moreHospitals}</p>
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            onClick={() => append({ hospitalId: "", departmentId: "", employmentType: "visiting" })}
          >
            <PlusIcon aria-hidden className="size-4" />
            {CLINICAL.addHospital}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Profession first; it names the council, the registration label and whether a specialty is asked. */
function PracticeFields({ specialties }: { specialties: readonly Choice[] }) {
  const profession = professionById(useFieldValue("profession") ?? "");
  const specialtyOptions = [
    ...specialties,
    { value: "unlisted", label: CLINICAL.specialtyUnlisted },
  ];
  return (
    <>
      <ProfessionField />
      {profession?.needsSpecialty ? (
        <div className={revealClass}>
          <SelectField
            name="specialty"
            label={CLINICAL.specialty}
            options={specialtyOptions}
            placeholder={STAFF.specialtyPlaceholder}
          />
        </div>
      ) : null}
      <TextField
        name="registrationNumber"
        label={profession ? registrationLabel(profession) : STAFF.registrationNumber}
        hint={
          profession?.helper
            ? `${CLINICAL.registrationHint} ${profession.helper}`
            : CLINICAL.registrationHint
        }
        autoCapitalize="characters"
        maxLength={60}
      />
      <DocumentField
        name="licence"
        kind="licence"
        label={CLINICAL.licence}
        laterText={CLINICAL.licenceLater}
      />
    </>
  );
}
