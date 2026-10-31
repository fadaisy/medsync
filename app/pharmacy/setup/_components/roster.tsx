"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { RC } from "@/content/pharmacy-rework-records";
import { cn } from "@/lib/utils";
import { addRosterLineAction, endRosterLineAction } from "../actions";

const P = RC.setup.people;
const ROLES = Object.keys(P.roles);
const SHIFTS = Object.keys(P.shifts);
const DAYS = Object.keys(P.dayChoices);

/** The start day: today and the six days after it (Kampala dates, `YYYY-MM-DD`). */
const week = (today: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(Date.parse(`${today}T12:00:00+03:00`) + i * 86_400_000).toISOString().slice(0, 10),
  );
const dayWords = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Africa/Kampala",
});

export const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-full px-4 text-[13.5px]",
    on ? "bg-tide-navy-900 text-tide-on-band font-semibold" : "bg-card shadow-tide-card",
  );

export function Chips({
  label,
  keys,
  words,
  value,
  set,
}: {
  label: string;
  keys: readonly string[];
  words: Record<string, string>;
  value: string | null;
  set: (k: string | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-body-s mb-2 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => set(k)}
            className={chip(value === k)}
          >
            {words[k]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Add a roster line (PRD §6.7): person, place, role, shift and how long, as chips; the start day is today or picked. */
export function AddRosterDialog({
  people,
  places,
  today,
}: {
  people: { userId: string; label: string }[];
  places: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [userId, setUserId] = useState<string>("");
  const [place, setPlace] = useState<string | null>("");
  const [role, setRole] = useState<string | null>(null);
  const [shift, setShift] = useState<string | null>("day");
  const [from, setFrom] = useState(today);
  const [days, setDays] = useState<string | null>("7");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const r = await addRosterLineAction({
        clientKey: key,
        userId,
        locationId: place || null,
        role,
        shift,
        dateFrom: from,
        days: Number(days),
      });
      if (!r.ok) return setError(r.error);
      setOpen(false);
      setKey(crypto.randomUUID());
      router.refresh();
    });

  return (
    <>
      <LabButton onClick={() => setOpen(true)}>{P.add}</LabButton>
      <EditorDialog open={open} onOpenChange={(o) => !pending && setOpen(o)} width="wide">
        <div className="flex flex-col gap-1 px-6 pt-5">
          <DialogTitle>{P.addTitle}</DialogTitle>
          <p className="text-body-s text-ink-600">{P.lead}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <label className="flex flex-col gap-2">
            <span className="text-body-s font-semibold">{P.person}</span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="bg-card rounded-tide-field h-11 max-w-md px-3 text-[14px] shadow-[inset_0_0_0_1px_var(--color-ink-300)]"
            >
              <option value="">{P.person}</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Chips
            label={P.place}
            keys={["", ...places.map((p) => p.id)]}
            words={{ "": P.everywhere, ...Object.fromEntries(places.map((p) => [p.id, p.name])) }}
            value={place}
            set={setPlace}
          />
          <Chips label={P.role} keys={ROLES} words={P.roles} value={role} set={setRole} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Chips label={P.shift} keys={SHIFTS} words={P.shifts} value={shift} set={setShift} />
            <Chips label={P.days} keys={DAYS} words={P.dayChoices} value={days} set={setDays} />
          </div>
          <Chips
            label={P.cols.dates}
            keys={week(today)}
            words={Object.fromEntries(
              week(today).map((d, i) => [
                d,
                i === 0
                  ? (P.dayChoices["1"] ?? d)
                  : dayWords.format(new Date(`${d}T12:00:00+03:00`)),
              ]),
            )}
            value={from}
            set={(d) => setFrom(d ?? today)}
          />
          {error ? (
            <p role="alert" className="text-body-s text-ink-900 font-semibold">
              {error}
            </p>
          ) : null}
        </div>
        <div className="border-border flex flex-wrap justify-end gap-2 border-t px-6 py-3">
          <LabButton variant="text" onClick={() => !pending && setOpen(false)}>
            {P.cancel}
          </LabButton>
          <LabButton
            busy={pending}
            disabledReason={!userId || !role || !shift || !days ? P.choose : undefined}
            onClick={save}
          >
            {P.save}
          </LabButton>
        </div>
      </EditorDialog>
    </>
  );
}

/** End a roster line now (the line stays on record, ended). */
export function EndRosterButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <LabButton
      size="sm"
      variant="secondary"
      busy={pending}
      onClick={() =>
        start(async () => {
          const r = await endRosterLineAction({ id });
          if (r.ok) router.refresh();
        })
      }
    >
      {P.end}
    </LabButton>
  );
}
