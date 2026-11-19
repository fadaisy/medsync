"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import {
  ChoiceField,
  FieldError,
  fieldId,
  FieldShell,
  inputClass,
  useFieldA11y,
  useFieldError,
} from "@/components/onboarding/fields";
import { ChosenCard, SearchField } from "@/components/onboarding/search-field";
import { STAFF_COMMON } from "@/content/onboarding";
import { STAFF } from "@/content/onboarding-staff";
import { departmentsAction } from "../_actions/lookup";

/*
 * "Where you work" for both staff forms (§5.4): hospital (searched locally, the list ships with the
 * page), then its departments (loaded on pick; cleared when the hospital changes), then employment.
 * `afterHospital` holds the clinical form's "My hospital isn't on MedSync".
 */

export interface HospitalOption {
  id: string;
  name: string;
}

type Department = { id: string; name: string; code: string | null };

export const EMPLOYMENT_OPTIONS = Object.entries(STAFF_COMMON.employmentOptions).map(
  ([value, label]) => ({ value, label }),
);

const norm = (s: string) => s.toLowerCase().trim();

export function WorkFields({
  hospitals,
  departmentLabel,
  fixedDepartment,
  afterHospital,
  prefix = "",
  exclude,
  children,
}: {
  hospitals: readonly HospitalOption[];
  departmentLabel: string;
  /** A catalogue code (LABORATORY, PHARMACY…): when the hospital has it live, it is chosen and not asked. */
  fixedDepartment?: string;
  afterHospital?: ReactNode;
  /** For a hospital after the first (ADR 0530): the fields live under e.g. `moreWorkplaces.0.`. */
  prefix?: string;
  /** Hospitals already chosen elsewhere on the form: not offered again. */
  exclude?: readonly string[];
  children?: ReactNode;
}) {
  const names = {
    hospital: `${prefix}hospitalId`,
    department: `${prefix}departmentId`,
    employment: `${prefix}employmentType`,
  };
  const { control, setValue } = useFormContext();
  const { field: hospital } = useController({ name: names.hospital, control });
  const hospitalError = useFieldError(names.hospital);
  const chosen = hospitals.find((h) => h.id === hospital.value) ?? null;
  const id = fieldId(names.hospital);

  const search = useCallback(
    (q: string) =>
      hospitals.filter((h) => !exclude?.includes(h.id) && norm(h.name).includes(norm(q))),
    [hospitals, exclude],
  );
  const pick = (next: string) => {
    hospital.onChange(next);
    hospital.onBlur();
    setValue(names.department, "", { shouldValidate: false }); // a department belongs to one hospital
  };

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5" data-field={names.hospital}>
        <label htmlFor={id} className="text-body-s text-foreground font-medium">
          {STAFF_COMMON.hospital}
        </label>
        {chosen ? (
          <ChosenCard onChange={() => pick("")}>
            <p className="text-body-m text-foreground font-medium">{chosen.name}</p>
          </ChosenCard>
        ) : (
          <SearchField<HospitalOption>
            id={id}
            placeholder={STAFF_COMMON.hospitalPlaceholder}
            search={search}
            minChars={0}
            optionKey={(o) => o.id}
            optionText={(o) => o.name}
            renderOption={(o) => <span className="text-body-m text-foreground">{o.name}</span>}
            onSelect={(o) => pick(o.id)}
            describedBy={hospitalError ? `${id}-error` : undefined}
            invalid={!!hospitalError}
          />
        )}
        <FieldError name={names.hospital} />
        {afterHospital}
      </div>
      <DepartmentField
        name={names.department}
        hospitalId={chosen?.id ?? ""}
        label={departmentLabel}
        fixedCode={fixedDepartment}
      />
      <ChoiceField
        name={names.employment}
        label={STAFF_COMMON.employment}
        options={EMPLOYMENT_OPTIONS}
      />
      {children}
    </>
  );
}

/**
 * A native select whose options follow the chosen hospital; disabled until there is one. With a
 * `fixedCode` the hospital has live, that department is chosen and shown read-only; without it
 * (the hospital has no such department yet) the select comes back, so no one is stuck.
 */
function DepartmentField({
  name,
  hospitalId,
  label,
  fixedCode,
}: {
  name: string;
  hospitalId: string;
  label: string;
  fixedCode?: string;
}) {
  const { control } = useFormContext();
  const { field } = useController({ name, control });
  const [loaded, setLoaded] = useState<{
    for: string;
    rows: Department[];
    failed?: boolean;
  }>({ for: "", rows: [] });

  useEffect(() => {
    if (!hospitalId) return;
    let live = true;
    void departmentsAction(hospitalId)
      .then((rows) => live && setLoaded({ for: hospitalId, rows }))
      // A failed lookup must not read as "no departments" (that sends people to the wrong fix).
      .catch(() => live && setLoaded({ for: hospitalId, rows: [], failed: true }));
    return () => {
      live = false;
    };
  }, [hospitalId]);

  const ready = !!hospitalId && loaded.for === hospitalId;
  const rows = ready ? loaded.rows : [];
  const fixed = fixedCode ? rows.find((d) => d.code === fixedCode) : undefined;
  const a11y = useFieldA11y(name, !!fixed);
  const { value, onChange } = field;
  useEffect(() => {
    if (fixed && value !== fixed.id) onChange(fixed.id);
  }, [fixed, value, onChange]);
  const placeholder = !hospitalId
    ? STAFF_COMMON.departmentFirst
    : !ready
      ? STAFF.departmentLoading
      : rows.length
        ? STAFF.departmentPlaceholder
        : loaded.failed
          ? STAFF.departmentFailed
          : STAFF.departmentNone;

  if (fixed)
    return (
      <FieldShell name={name} label={label} hint={STAFF.departmentFixed}>
        <input {...a11y} readOnly value={fixed.name} className={inputClass} />
      </FieldShell>
    );

  // The hospital's own departments, searched in place like the hospital (no system menu).
  const chosen = ready ? rows.find((d) => d.id === value) : undefined;
  const searchable = ready && rows.length > 0;
  return (
    <FieldShell name={name} label={label}>
      {chosen ? (
        <ChosenCard onChange={() => onChange("")}>
          <p className="text-body-m text-foreground font-medium">{chosen.name}</p>
        </ChosenCard>
      ) : searchable ? (
        <SearchField<Department>
          id={a11y.id}
          placeholder={placeholder}
          search={(q) => rows.filter((d) => norm(d.name).includes(norm(q)))}
          minChars={0}
          optionKey={(d) => d.id}
          optionText={(d) => d.name}
          renderOption={(d) => <span className="text-body-m text-foreground">{d.name}</span>}
          onSelect={(d) => {
            onChange(d.id);
            field.onBlur();
          }}
          describedBy={a11y["aria-describedby"]}
          invalid={!!a11y["aria-invalid"]}
        />
      ) : (
        <input
          {...a11y}
          readOnly
          disabled
          value=""
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </FieldShell>
  );
}
