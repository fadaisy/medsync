"use client";

import type { DetailsSection, DetailsForm as Form, OnFile } from "@patient-core/me-profile";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import {
  detailsBody,
  formFrom,
  ID_TYPES,
  languageOf,
  LANGUAGES,
  RELATIONSHIPS,
  TITLES,
} from "@patient-core/me-profile";
import { CheckIcon } from "lucide-react";

import { Chip, ChipRow, TextField } from "@/components/tide/controls";
import { Button, ICON, Note } from "@/components/tide/kit";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { saveDetailsAction } from "@/lib/patient-web/me-actions";

type Errors = Partial<Record<DetailsSection | "form", string>>;

/** One quiet card: a heading, an "Added" mark with a check (words, not colour alone), the inputs. */
function Part({
  title,
  added,
  addedWords,
  error,
  children,
}: {
  title: string;
  added: boolean;
  addedWords?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] leading-[22px] font-semibold">{title}</h2>
        {added ? (
          <span className="text-pw-accent-text inline-flex items-center gap-1 text-[13px] font-semibold">
            <CheckIcon className="size-3.5" {...ICON} />
            {addedWords ?? C.added}
          </span>
        ) : null}
      </div>
      {children}
      {error ? <Note>{error}</Note> : null}
    </section>
  );
}

/** What saved now reads from the file; what was refused stays typed so it can be fixed (the phone's merge). */
function afterSave(on: OnFile, f: Form, saved: DetailsSection[]): OnFile {
  const next = { ...on };
  if (saved.includes("title")) next.titleCode = f.title;
  if (saved.includes("language")) next.preferredLanguage = languageOf(f) || null;
  if (saved.includes("id")) Object.assign(next, { idOnFile: true, idType: f.idType });
  if (saved.includes("nok"))
    Object.assign(next, { nokOnFile: !!f.nokName.trim(), relationship: f.nokRelationship });
  return next;
}

export function DetailsForm({
  onFile: initial,
  hospital,
}: {
  onFile: OnFile;
  hospital: ReactNode;
}) {
  const [onFile, setOnFile] = useState(initial);
  const [form, setForm] = useState<Form>(() => formFrom(initial));
  const [nokEditing, setNokEditing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [savedOnce, setSavedOnce] = useState(false);
  const [saving, start] = useTransition();

  const patch = (next: Partial<Form>) => setForm((f) => ({ ...f, ...next }));
  const body = detailsBody(form, onFile);
  const dirty = Object.keys(body).length > 0;

  const save = () =>
    start(async () => {
      setErrors({});
      const r = await saveDetailsAction(body).catch(() => ({
        ok: false as const,
        message: W.offline,
      }));
      if (!r.ok) return setErrors({ form: r.message });
      setErrors(r.errors);
      const fresh = afterSave(onFile, form, r.saved);
      setOnFile(fresh);
      const base = formFrom(fresh);
      setForm((f) => ({
        ...base,
        ...(r.errors.title ? { title: f.title } : {}),
        ...(r.errors.language
          ? { languageChoice: f.languageChoice, languageOther: f.languageOther }
          : {}),
        ...(r.errors.id ? { idType: f.idType, idNumber: f.idNumber } : {}),
        ...(r.errors.nok
          ? { nokName: f.nokName, nokRelationship: f.nokRelationship, nokPhone: f.nokPhone }
          : {}),
      }));
      if (r.saved.includes("nok")) setNokEditing(false);
      if (r.saved.length) setSavedOnce(true);
    });

  const relLabel = RELATIONSHIPS.find((o) => o.key === onFile.relationship)?.label;

  return (
    <>
      <Part title={C.titlePart} added={onFile.titleCode !== null} error={errors.title}>
        <ChipRow label={C.titlePart}>
          {TITLES.map((o) => (
            <Chip
              key={o.label}
              selected={form.title === o.key}
              onClick={() => patch({ title: o.key })}
            >
              {o.label}
            </Chip>
          ))}
        </ChipRow>
      </Part>

      <Part title={C.languagePart} added={!!onFile.preferredLanguage} error={errors.language}>
        <ChipRow label={C.languagePart}>
          {[...LANGUAGES, C.other].map((l) => (
            <Chip
              key={l}
              selected={form.languageChoice === l}
              onClick={() => patch({ languageChoice: form.languageChoice === l ? null : l })}
            >
              {l}
            </Chip>
          ))}
        </ChipRow>
        {form.languageChoice === C.other ? (
          <TextField
            label={C.yourLanguage}
            value={form.languageOther}
            onChange={(e) => patch({ languageOther: e.target.value })}
            maxLength={40}
          />
        ) : null}
      </Part>

      {hospital}

      <Part title={C.idPart} added={onFile.idOnFile} error={errors.id}>
        {onFile.idOnFile ? (
          <p className="text-pw-ink-2 text-[15px]">
            {C.idOnFile(ID_TYPES.find((o) => o.key === onFile.idType)?.label ?? C.anId)}
          </p>
        ) : (
          <>
            <p className="text-pw-ink-2 text-[15px]">{C.idOnce}</p>
            <ChipRow label={C.idPart}>
              {ID_TYPES.map((o) => (
                <Chip
                  key={o.key}
                  selected={form.idType === o.key}
                  onClick={() => patch({ idType: o.key })}
                >
                  {o.label}
                </Chip>
              ))}
            </ChipRow>
            <TextField
              label={C.idNumber}
              value={form.idNumber}
              onChange={(e) => patch({ idNumber: e.target.value })}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </>
        )}
      </Part>

      <Part
        title={C.nokPart}
        added={onFile.nokOnFile}
        addedWords={onFile.nokOnFile && relLabel ? C.addedRel(relLabel) : undefined}
        error={errors.nok}
      >
        {onFile.nokOnFile && !nokEditing ? (
          <>
            <p className="text-pw-ink-2 text-[15px]">{C.nokKept}</p>
            <button
              type="button"
              onClick={() => setNokEditing(true)}
              className="text-pw-accent-text focus-visible:outline-pw-focus inline-flex min-h-12 items-center self-start font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
            >
              {C.replace}
            </button>
          </>
        ) : (
          <>
            <p className="text-pw-ink-2 text-[15px]">{C.nokIntro}</p>
            <TextField
              label={C.theirName}
              value={form.nokName}
              onChange={(e) => patch({ nokName: e.target.value })}
              maxLength={120}
              autoComplete="off"
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-base leading-5 font-semibold">{C.relationshipOptional}</span>
              <ChipRow label={C.relationshipOptional}>
                {RELATIONSHIPS.map((o) => (
                  <Chip
                    key={o.key}
                    selected={form.nokRelationship === o.key}
                    onClick={() =>
                      patch({ nokRelationship: form.nokRelationship === o.key ? null : o.key })
                    }
                  >
                    {o.label}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            <TextField
              label={C.theirPhone}
              hint={C.phoneHint}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={form.nokPhone}
              onChange={(e) =>
                patch({ nokPhone: e.target.value.replace(/[^\d\s]/g, "").slice(0, 12) })
              }
            />
            {nokEditing ? (
              <button
                type="button"
                onClick={() => {
                  setNokEditing(false);
                  patch({ nokName: "", nokPhone: "", nokRelationship: onFile.relationship });
                }}
                className="text-pw-accent-text focus-visible:outline-pw-focus inline-flex min-h-12 items-center self-start font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
              >
                {C.keepOnFile}
              </button>
            ) : null}
          </>
        )}
      </Part>

      {errors.form ? <Note>{errors.form}</Note> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button busy={saving} disabledReason={dirty ? undefined : C.nothingToSave} onClick={save}>
          {C.save}
        </Button>
        {savedOnce && !dirty ? (
          <span
            role="status"
            className="text-pw-accent-text inline-flex items-center gap-1.5 font-semibold"
          >
            <CheckIcon className="size-4" {...ICON} />
            {C.saved}
          </span>
        ) : null}
      </div>
    </>
  );
}
