"use client";

import type { HouseholdDraft } from "@patient-core/me-profile";
import { useState, useTransition } from "react";
import { HOUSEHOLD_RELATIONSHIPS } from "@patient-core/me-profile";

import { Chip, ChipRow, TextField } from "@/components/tide/controls";
import { Button, Note } from "@/components/tide/kit";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { addHouseholdAction } from "@/lib/patient-web/me-actions";
import { Switch } from "../../_components/rows";

const EMPTY: HouseholdDraft = {
  label: "",
  phone: "",
  age: "",
  dob: "",
  relationship: null,
  adult: false,
};

/**
 * "Add someone": the server checks again and its sentence is shown word for word, the minor refusal included
 * ("Booking for a child is not available yet."). No clinical question is asked here.
 */
export function HouseholdForm() {
  const [d, setD] = useState<HouseholdDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const patch = (p: Partial<HouseholdDraft>) => setD((x) => ({ ...x, ...p }));

  const add = () =>
    start(async () => {
      setError(null);
      setAdded(null);
      const res = await addHouseholdAction(d).catch(() => ({
        ok: false as const,
        error: W.offline,
      }));
      if (!res.ok) return setError(res.error);
      setAdded(d.label.trim());
      setD(EMPTY);
    });

  return (
    <section
      aria-labelledby="hh-add"
      className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-4 p-5"
    >
      {added ? (
        <p role="status" className="text-pw-accent-text text-[15px] font-semibold">
          {C.onList(added)}
        </p>
      ) : null}
      <h2 id="hh-add" className="text-xl leading-[26px] font-semibold tracking-[-0.015em]">
        {C.addSomeone}
      </h2>
      <TextField
        label={C.theirName}
        value={d.label}
        onChange={(e) => patch({ label: e.target.value })}
        maxLength={80}
        autoComplete="off"
      />
      <TextField
        label={C.phone}
        hint={C.phoneMemberHint}
        placeholder={C.phonePlaceholder}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={d.phone}
        onChange={(e) => patch({ phone: e.target.value })}
      />
      <TextField
        label={C.age}
        inputMode="numeric"
        maxLength={3}
        value={d.age}
        onChange={(e) => patch({ age: e.target.value.replace(/\D/g, "") })}
      />
      <TextField
        label={C.dob}
        // Typed, not a native date picker (tests/design/tide-guards); the server parses YYYY-MM-DD.
        placeholder="YYYY-MM-DD"
        maxLength={10}
        autoComplete="off"
        value={d.dob}
        onChange={(e) => patch({ dob: e.target.value })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-base leading-5 font-semibold">{C.whoToYou}</span>
        <ChipRow label={C.whoToYou}>
          {HOUSEHOLD_RELATIONSHIPS.map((r) => (
            <Chip
              key={r.value}
              selected={d.relationship === r.value}
              onClick={() => patch({ relationship: r.value })}
            >
              {r.label}
            </Chip>
          ))}
        </ChipRow>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-semibold">{C.adultSwitch}</span>
        <Switch label={C.adultSwitch} checked={d.adult} onChange={(adult) => patch({ adult })} />
      </div>
      {error ? (
        <div role="alert">
          <Note>{error}</Note>
        </div>
      ) : null}
      <Button busy={busy} onClick={add} className="self-start">
        {C.addPerson}
      </Button>
    </section>
  );
}
