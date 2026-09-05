"use client";

import type { ProfileUpdateState } from "../actions";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePatientProfileAction } from "../actions";

const NOK_OPTIONS = [
  { value: "", label: "Choose a relationship" },
  { value: "spouse", label: "Spouse" },
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "guardian", label: "Guardian" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

const LANGUAGE_SUGGESTIONS = [
  "English",
  "Luganda",
  "Swahili",
  "Runyankole",
  "Lusoga",
  "Acholi",
  "Lugbara",
];

export interface ProfileDefaults {
  phone: string;
  villageAddress: string | null;
  preferredLanguage: string | null;
  knownConditions: string[];
  nokName: string | null;
  nokRelationship: string | null;
  nokPhone: string | null;
}

export function ProfileForm({ defaults }: { defaults: ProfileDefaults }) {
  const [state, formAction] = useActionState<ProfileUpdateState, FormData>(
    updatePatientProfileAction,
    {} as ProfileUpdateState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Contact
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone" className="text-caption tracking-tight">
            Phone
          </Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={defaults.phone}
            type="tel"
            inputMode="tel"
            placeholder="+256…"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="village_address" className="text-caption tracking-tight">
            Village / address (optional)
          </Label>
          <Input
            id="village_address"
            name="village_address"
            defaultValue={defaults.villageAddress ?? ""}
            placeholder="Where you live"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preferred_language" className="text-caption tracking-tight">
            Preferred language (optional)
          </Label>
          <Input
            id="preferred_language"
            name="preferred_language"
            defaultValue={defaults.preferredLanguage ?? ""}
            placeholder="English, Luganda…"
            list="language-suggestions"
          />
          <datalist id="language-suggestions">
            {LANGUAGE_SUGGESTIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
      </section>

      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Health
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="known_conditions" className="text-caption tracking-tight">
            Known conditions (optional)
          </Label>
          <textarea
            id="known_conditions"
            name="known_conditions"
            rows={3}
            defaultValue={defaults.knownConditions.join(", ")}
            placeholder="Diabetes, Hypertension, Asthma…"
            className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring text-body-s resize-none rounded-md border px-3 py-2 leading-relaxed shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
          />
          <p className="text-muted-foreground text-caption leading-relaxed">
            Comma-separated. We use this to suggest what to log on the Track tab.
          </p>
        </div>
      </section>

      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Next of kin
        </h2>
        <p className="text-muted-foreground text-[11.5px] leading-relaxed">
          Someone to contact in an emergency. Both name and phone, or leave the whole section blank.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nok_name" className="text-caption tracking-tight">
            Name
          </Label>
          <Input
            id="nok_name"
            name="nok_name"
            defaultValue={defaults.nokName ?? ""}
            placeholder="Their full name"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nok_relationship" className="text-caption tracking-tight">
              Relationship
            </Label>
            <select
              id="nok_relationship"
              name="nok_relationship"
              defaultValue={defaults.nokRelationship ?? ""}
              className="border-input bg-background text-foreground focus-visible:ring-ring/50 text-body-s rounded-md border px-3 py-2 outline-none focus-visible:ring-[3px]"
            >
              {NOK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nok_phone" className="text-caption tracking-tight">
              Phone
            </Label>
            <Input
              id="nok_phone"
              name="nok_phone"
              defaultValue={defaults.nokPhone ?? ""}
              type="tel"
              inputMode="tel"
              placeholder="+256…"
            />
          </div>
        </div>
      </section>

      {state.error ? (
        <p className="text-destructive border-destructive/30 bg-destructive/5 rounded-md border px-3 py-2 text-[12px] leading-relaxed">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span aria-live="polite" className="text-muted-foreground text-[11.5px]">
          {state.ok ? "Saved." : ""}
        </span>
        <Button type="submit">Save changes</Button>
      </div>
    </form>
  );
}
