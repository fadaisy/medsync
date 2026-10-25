"use client";

import type { Person } from "../../../store/_components/supply-kit";
import type { Pack } from "@/lib/pharmacy/clinical/content";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLINICAL_UI } from "@/content/pharmacy-clinical";
import { LEVELS, SEVERITIES } from "@/lib/pharmacy/clinical/content";
import { AttestBox } from "../../../store/_components/supply-kit";
import {
  Field,
  newKey,
  num,
  Refusal,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../../store/places/_components/store-kit";
import {
  attestSigner,
  importAware,
  importCandidates,
  saveContentDraft,
  signContentEntry,
  withdrawContentEntry,
} from "../../actions";

const U = CLINICAL_UI;
const F = U.fields;

/** AM-0: the AWaRe edition as one draft pack; unmatched antibiotics are listed, never guessed. */
export function ImportAwareButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        className={TARGET}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await importAware({ clientKey: newKey() });
            setSaid(r.ok ? null : r.error);
            router.refresh();
          })
        }
      >
        {U.importAware}
      </Button>
      <Refusal error={said} />
    </div>
  );
}

/** CC-3: imports the candidate file as drafts; a second import changes nothing. */
export function ImportButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        className={TARGET}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await importCandidates({ clientKey: newKey() });
            setSaid(r.ok ? null : r.error);
            router.refresh();
          })
        }
      >
        {U.importLabel}
      </Button>
      <Refusal error={said} />
    </div>
  );
}

function Select({
  id,
  name,
  value,
  options,
}: {
  id: string;
  name: string;
  value?: string;
  options: readonly { v: string; l: string }[];
}) {
  return (
    <select id={id} name={name} defaultValue={value ?? ""} className={SELECT}>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

type P = Record<string, unknown>;
const levelOptions = LEVELS.map((l) => ({ v: l, l: U.levels[l] }));

/** One draft form per editable pack (5.2). No clinical value is ever filled in for the person (Law 6). */
export function EditDialog({
  pack,
  entryKey,
  payload,
  source,
  medicines,
  label,
}: {
  pack: Pack;
  entryKey: string | null;
  payload: object | null;
  source: string | null;
  medicines: readonly { id: string; name: string }[];
  label: string;
}) {
  const p = (payload ?? {}) as P;
  const meds = [{ v: "", l: "Choose" }, ...medicines.map((m) => ({ v: m.id, l: m.name }))];
  return (
    <StoreDialog
      label={label}
      title={U.editTitle(entryKey ?? U.packs[pack])}
      description={U.reference}
      submit={U.saveDraft}
      width="wide"
      onSave={async (clientKey, d) => {
        const levels = (side: string) =>
          Object.fromEntries(SEVERITIES.map((s) => [s, str(d, `${side}-${s}`)]));
        const body =
          pack === "interaction_pair"
            ? {
                a: str(d, "a"),
                b: str(d, "b"),
                severity: str(d, "severity"),
                effect: str(d, "effect"),
                management: str(d, "management"),
                byDesign: d.get("byDesign") === "on",
                restricted: str(d, "restricted") || null,
                route: null,
              }
            : pack === "alert_levels"
              ? {
                  dialog: levels("dialog"),
                  review: levels("review"),
                  suppressionDays: num(d, "suppressionDays"),
                }
              : pack === "review_settings"
                ? {
                    intervalDays: Object.fromEntries(
                      (["Access", "Watch", "Reserve"] as const)
                        .map((g) => [
                          g,
                          str(d, `interval${g}`) ? num(d, `interval${g}`) : undefined,
                        ])
                        .filter(([, v]) => v !== undefined),
                    ),
                    noCultureWindowHours: num(d, "noCultureWindowHours"),
                  }
                : pack === "reaction_timelines"
                  ? { seriousHours: num(d, "seriousHours"), otherDays: num(d, "otherDays") }
                  : pack === "lookback_windows"
                    ? {
                        chartedHours: num(d, "chartedHours"),
                        suppliedDays: num(d, "suppliedDays"),
                        suppliedDaysByMedicine: {},
                      }
                    : { minimum: num(d, "minimum") };
        const key =
          pack === "interaction_pair" ? [str(d, "a"), str(d, "b")].sort().join("+") : pack;
        return saveContentDraft({
          clientKey,
          pack,
          key,
          payload: body,
          source: str(d, "source") || null,
        });
      }}
    >
      {pack === "interaction_pair" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={F.a} id="a">
            <Select id="a" name="a" value={p.a as string} options={meds} />
          </Field>
          <Field label={F.b} id="b">
            <Select id="b" name="b" value={p.b as string} options={meds} />
          </Field>
          <Field label={F.severity} id="severity">
            <Select
              id="severity"
              name="severity"
              value={p.severity as string}
              options={[{ v: "", l: "Choose" }, ...SEVERITIES.map((s) => ({ v: s, l: s }))]}
            />
          </Field>
          <Field label={F.restricted} id="restricted">
            <Select
              id="restricted"
              name="restricted"
              value={(p.restricted as string) ?? ""}
              options={[
                { v: "", l: F.none },
                { v: "hiv", l: "hiv" },
                { v: "tb", l: "tb" },
                { v: "srh", l: "srh" },
              ]}
            />
          </Field>
          <Field label={F.effect} id="effect">
            <Input
              id="effect"
              name="effect"
              defaultValue={(p.effect as string) ?? ""}
              className={TARGET}
            />
          </Field>
          <Field label={F.management} id="management">
            <Input
              id="management"
              name="management"
              defaultValue={(p.management as string) ?? ""}
              className={TARGET}
            />
          </Field>
          <Field label={F.source} id="source">
            <Input id="source" name="source" defaultValue={source ?? ""} className={TARGET} />
          </Field>
          <label className="text-body-s flex min-h-11 items-center gap-2">
            <input type="checkbox" name="byDesign" defaultChecked={!!p.byDesign} />
            {F.byDesign}
          </label>
        </div>
      ) : pack === "alert_levels" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["dialog", "review"] as const).map((side) => (
            <fieldset
              key={side}
              className="border-border flex flex-col gap-2 rounded-md border p-3"
            >
              <legend className="text-body-s px-1">{F[side]}</legend>
              {SEVERITIES.map((s) => (
                <Field key={s} label={s} id={`${side}-${s}`}>
                  <Select
                    id={`${side}-${s}`}
                    name={`${side}-${s}`}
                    value={((p[side] as P | undefined)?.[s] as string) ?? ""}
                    options={[{ v: "", l: "Choose" }, ...levelOptions]}
                  />
                </Field>
              ))}
            </fieldset>
          ))}
          <Field label={F.suppressionDays} id="suppressionDays">
            <Input
              id="suppressionDays"
              name="suppressionDays"
              inputMode="numeric"
              defaultValue={(p.suppressionDays as number) ?? ""}
              className={TARGET}
            />
          </Field>
        </div>
      ) : pack === "review_settings" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["Access", "Watch", "Reserve"] as const).map((g) => (
            <Field key={g} label={F[`interval${g}`]} id={`interval${g}`}>
              <Input
                id={`interval${g}`}
                name={`interval${g}`}
                inputMode="numeric"
                defaultValue={((p.intervalDays as P | undefined)?.[g] as number) ?? ""}
                className={TARGET}
              />
            </Field>
          ))}
          <Field label={F.noCultureWindowHours} id="noCultureWindowHours">
            <Input
              id="noCultureWindowHours"
              name="noCultureWindowHours"
              inputMode="numeric"
              defaultValue={(p.noCultureWindowHours as number) ?? ""}
              className={TARGET}
            />
          </Field>
        </div>
      ) : pack === "reaction_timelines" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={F.seriousHours} id="seriousHours">
            <Input
              id="seriousHours"
              name="seriousHours"
              inputMode="numeric"
              defaultValue={(p.seriousHours as number) ?? ""}
              className={TARGET}
            />
          </Field>
          <Field label={F.otherDays} id="otherDays">
            <Input
              id="otherDays"
              name="otherDays"
              inputMode="numeric"
              defaultValue={(p.otherDays as number) ?? ""}
              className={TARGET}
            />
          </Field>
        </div>
      ) : pack === "lookback_windows" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={F.chartedHours} id="chartedHours">
            <Input
              id="chartedHours"
              name="chartedHours"
              inputMode="numeric"
              defaultValue={(p.chartedHours as number) ?? ""}
              className={TARGET}
            />
          </Field>
          <Field label={F.suppliedDays} id="suppliedDays">
            <Input
              id="suppliedDays"
              name="suppliedDays"
              inputMode="numeric"
              defaultValue={(p.suppliedDays as number) ?? ""}
              className={TARGET}
            />
          </Field>
        </div>
      ) : (
        <Field label={F.minimum} id="minimum">
          <Input
            id="minimum"
            name="minimum"
            inputMode="numeric"
            defaultValue={(p.minimum as number) ?? ""}
            className={TARGET}
          />
        </Field>
      )}
    </StoreDialog>
  );
}

/** CC-2: the signer confirms with their own password and code; one signer needs the exception in words. */
export function SignDialog({
  entryId,
  entryKey,
  people,
}: {
  entryId: string;
  entryKey: string;
  people: readonly Person[];
}) {
  const [att, setAtt] = useState<{ id: string; who: string } | null>(null);
  return (
    <StoreDialog
      label={U.sign}
      title={U.signTitle(entryKey)}
      description={U.signLead}
      submit={U.sign}
      variant="primary"
      width="wide"
      onOpen={() => setAtt(null)}
      onSave={async (clientKey, d) => {
        if (!att) return { ok: false, code: "invalid", error: U.signLead };
        return signContentEntry({
          clientKey,
          entryId,
          role: str(d, "role"),
          attestationId: att.id,
          exception: str(d, "exception") || null,
        });
      }}
    >
      <AttestBox
        people={people}
        action="sign_pack"
        attest={attestSigner}
        done={att}
        onDone={setAtt}
        label={U.sign}
      />
      <Field label={U.role} id="role">
        <Select
          id="role"
          name="role"
          value="cso"
          options={Object.entries(U.roles).map(([v, l]) => ({ v, l }))}
        />
      </Field>
      <Field label={U.exception} id="exception" hint={U.exceptionHint}>
        <Input id="exception" name="exception" className={TARGET} />
      </Field>
    </StoreDialog>
  );
}

/** CC-4: out of force at once, with a reason. */
export function WithdrawDialog({ entryId, entryKey }: { entryId: string; entryKey: string }) {
  return (
    <StoreDialog
      label={U.withdraw}
      title={U.withdrawTitle(entryKey)}
      submit={U.withdraw}
      onSave={async (clientKey, d) =>
        withdrawContentEntry({ clientKey, entryId, reason: str(d, "reason") })
      }
    >
      <Field label={U.withdrawReason} id="reason">
        <Input id="reason" name="reason" className={TARGET} />
      </Field>
    </StoreDialog>
  );
}
