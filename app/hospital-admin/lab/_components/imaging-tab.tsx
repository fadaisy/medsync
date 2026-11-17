"use client";

import type { OfferingRow } from "@/lib/services/data";
import type { Comparison, OpenProblem } from "@/supabase/functions/_shared/services-hub";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, k, Seg, Step } from "@/components/clinics-schedule/shared";
import { LAB_ADMIN } from "@/content/hospital-admin/lab";
import { LAB_TEST_MENU as C } from "@/content/lab-test-menu";
import { IMAGING_ITEMS } from "@/supabase/functions/_shared/services-hub";
import { saveImagingAction } from "../_lib/actions";
import v from "./lab.module.css";

const I = LAB_ADMIN.imaging;

/** What is down now, in words: from Availability's open problems, never set here. */
const nowWord = (p: OpenProblem | undefined, o: OfferingRow | undefined) =>
  p
    ? p.unconfirmed
      ? I.now.unconfirmed
      : p.state === "limited"
        ? I.now.limited
        : I.now.unavailable
    : o && o.provision !== "not_offered" && o.confirmedAt
      ? I.now.running
      : null;

/**
 * Imaging (folded in from Departments › Diagnostics): one card per A.4 service with where it is done, its machines,
 * hours and stated turnaround. Open a card to change it. What is down now comes from Availability.
 */
export function ImagingTab({
  offerings,
  problems,
  comparison,
  presetLabel,
}: {
  offerings: OfferingRow[];
  problems: OpenProblem[];
  comparison: Comparison | null;
  presetLabel: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byCode = new Map(offerings.map((o) => [o.code, o]));
  return (
    <>
      <p className={k("su-note")}>
        {I.note} <Link href="/hospital-admin/departments/availability">{I.report}</Link>
      </p>
      {comparison && presetLabel ? (
        <p className={k("su-note")}>
          {I.compare(
            comparison.offered,
            comparison.inPreset,
            presetLabel,
            comparison.gaps.map((g) => g.label).join(", "),
          )}
        </p>
      ) : null}
      <div className={v.g2} data-tour="wt-lab-img">
        {IMAGING_ITEMS.map((it) => {
          const o = byCode.get(it.code);
          const p = problems.find((x) => x.subjectRef === it.code);
          const now = nowWord(p, o);
          const on = open === it.code;
          const sub = !o
            ? I.notSet
            : [
                o.confirmedAt ? C.where[o.provision] : I.planned,
                o.provision === "referred" && o.referredTo ? o.referredTo : null,
                o.provision === "in_house" && o.machines != null ? I.machines(o.machines) : null,
                o.provision === "in_house"
                  ? o.hours === "24h"
                    ? I.hoursOpts["24h"]
                    : o.hoursNote
                  : null,
                o.provision !== "not_offered" ? o.statedTat : null,
              ]
                .filter(Boolean)
                .join(" · ");
          return (
            <div key={it.code} className={`${k("su-card")} ${v.imc} ${on ? v.on : ""}`}>
              <button
                type="button"
                className={v.imh}
                aria-expanded={on}
                onClick={() => setOpen(on ? null : it.code)}
              >
                <span className={k("su-cn")}>
                  <b>{it.label}</b>
                  <small>{sub}</small>
                </span>
                {now ? <span className={k("su-st", p ? "setup" : "live")}>{now}</span> : null}
              </button>
              {p?.note ? <p className={`${k("su-note")} ${v.padx}`}>{p.note}</p> : null}
              {on ? (
                <ImagingForm
                  key={JSON.stringify(o ?? null)}
                  code={it.code}
                  offering={o}
                  onDone={() => setOpen(null)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ImagingForm({
  code,
  offering,
  onDone,
}: {
  code: string;
  offering: OfferingRow | undefined;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    provision: offering?.provision ?? "in_house",
    hours: offering?.hours ?? "scheduled",
    hours_note: offering?.hoursNote ?? "",
    stated_tat: offering?.statedTat ?? "",
    referred_to: offering?.referredTo ?? "",
    machines: offering?.machines ?? 0,
  });
  const set = <K extends keyof typeof f>(key: K, val: (typeof f)[K]) =>
    setF((x) => ({ ...x, [key]: val }));
  const planned = !!offering && !offering.confirmedAt;
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveImagingAction({
        code,
        provision: f.provision,
        hours: f.hours,
        hours_note: f.hours_note.trim() || null,
        stated_tat: f.stated_tat.trim() || null,
        referred_to: f.referred_to.trim() || null,
        machines: f.machines,
      });
      if (!r.ok) return setError(r.error);
      onDone();
      router.refresh();
    });
  return (
    <div className={`${k("su-sec")} ${v.pad}`}>
      {planned ? <p className={k("su-note")}>{I.plannedNote}</p> : null}
      <span className={k("cap")}>{I.where}</span>
      <Seg
        opts={(["in_house", "referred", "not_offered"] as const).map(
          (w) => [w, C.where[w]] as const,
        )}
        value={f.provision}
        onPick={(w) => set("provision", w)}
        label={I.where}
        className={v.wrapSeg}
      />
      {f.provision === "in_house" ? (
        <>
          <Field label={I.machinesLabel}>
            <Step
              value={f.machines}
              dn={() => set("machines", Math.max(0, f.machines - 1))}
              up={() => set("machines", Math.min(500, f.machines + 1))}
              dnLabel={I.fewer}
              upLabel={I.more}
            />
          </Field>
          <span className={k("cap")}>{I.hours}</span>
          <Seg
            opts={[
              ["24h", I.hoursOpts["24h"]],
              ["scheduled", I.hoursOpts.scheduled],
            ]}
            value={f.hours}
            onPick={(h) => set("hours", h)}
            label={I.hours}
          />
          {f.hours === "scheduled" ? (
            <Field as="label" label={I.when}>
              <input
                className={k("in")}
                maxLength={60}
                placeholder={I.whenPh}
                value={f.hours_note}
                onChange={(e) => set("hours_note", e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}
      {f.provision === "referred" ? (
        <Field as="label" label={I.to} hint={I.toHint}>
          <input
            className={k("in")}
            maxLength={120}
            value={f.referred_to}
            onChange={(e) => set("referred_to", e.target.value)}
          />
        </Field>
      ) : null}
      {f.provision !== "not_offered" ? (
        <Field as="label" label={I.tat} hint={I.tatHint}>
          <input
            className={k("in")}
            maxLength={40}
            placeholder={I.tatPh}
            value={f.stated_tat}
            onChange={(e) => set("stated_tat", e.target.value)}
          />
        </Field>
      ) : null}
      {error ? (
        <p className={k("su-note")} role="alert">
          {error}
        </p>
      ) : null}
      <div className={v.row}>
        <button type="button" className={k("btn", "sm", "k")} disabled={pending} onClick={save}>
          {planned ? I.confirm : I.save}
        </button>
      </div>
    </div>
  );
}
