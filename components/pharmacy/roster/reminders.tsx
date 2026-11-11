"use client";

import type { SectionProps } from "./roster-tab";
import Link from "next/link";
import { useState } from "react";

import { PickField } from "@/app/lab/_components/v2/fields";
import { setRemindersAction } from "@/app/pharmacy/setup/roster-actions";
import { sectionTitle } from "@/components/pharmacy/medicines/shared";
import { Panel } from "@/components/tide/work/kit";
import { dayLabel, ROSTER_REFUSAL, SHIFT } from "@/content/pharmacy-roster";
import { RS } from "@/content/pharmacy-roster-sections";
import { addDays, SHIFTS } from "@/lib/pharmacy/derive/roster";
import { NeedsDb, useAct } from "./swaps";

type Rem = SectionProps["view"]["reminders"];

/** §13 Reminders: four switches and the evening time; the in-charge sets them, everyone sees them. */
export function Reminders({ view, toast }: SectionProps) {
  const M = RS.reminders;
  const [rem, setRem] = useState<Rem>(view.reminders);
  const [pending, run] = useAct(toast);
  if (!view.ready) return <NeedsDb title={M.title} />;
  const can = view.inCharge;

  const save = (next: Rem, flash: string | null) => {
    const prev = rem;
    setRem(next);
    void run(
      () => setRemindersAction(next),
      () => flash,
    ).then((ok) => !ok && setRem(prev));
  };

  // The example: someone really on tomorrow's roster, else the spec's example with the viewer's name.
  const tomorrow = addDays(view.now.date, 1);
  const duty = view.duties
    .filter((d) => d.date === tomorrow)
    .sort((a, b) => SHIFTS.indexOf(a.shift) - SHIFTS.indexOf(b.shift))[0];
  const sent = rem.eveOn ? rem.eveTime : null;
  const fb = M.fallback;
  const viewer = view.people.find((p) => p.userId === view.viewerId) ?? view.people[0];
  const sms = duty
    ? M.sms(
        view.people.find((p) => p.userId === duty.userId)?.name ?? "",
        SHIFT[duty.shift].label,
        dayLabel(tomorrow),
        view.places.find((p) => p.id === duty.placeId)?.name ?? "",
        SHIFT[duty.shift].time,
        sent,
      )
    : M.sms(viewer?.name ?? fb.name, fb.shift, fb.day, fb.place, fb.time, sent);

  return (
    <Panel
      title={M.title}
      note={
        <>
          {M.sub}{" "}
          <Link
            href={M.href}
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            {M.link}
          </Link>
        </>
      }
    >
      <ul className="divide-border flex flex-col divide-y">
        {M.items.map((r) => (
          <li key={r.key}>
            <label className="flex cursor-pointer items-start justify-between gap-3 py-2 has-disabled:cursor-default">
              <span className="flex flex-col gap-0.5">
                <span className="text-body-s font-semibold">{r.label}</span>
                <span className="text-muted-foreground text-[12px]">{r.sub}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={rem[r.key]}
                disabled={!can || pending}
                onChange={() =>
                  save({ ...rem, [r.key]: !rem[r.key] }, M.toggled(r.label, !rem[r.key]))
                }
                className="accent-primary mt-0.5 size-5 shrink-0"
              />
            </label>
          </li>
        ))}
      </ul>
      {can ? (
        <PickField
          label={M.at}
          options={M.times.map((t) => ({ value: t, label: t }))}
          value={rem.eveTime}
          onChange={(v) => save({ ...rem, eveTime: v as Rem["eveTime"] }, null)}
        />
      ) : (
        <p className="text-caption text-muted-foreground">
          {M.at} {rem.eveTime}. {ROSTER_REFUSAL.inChargeOnly}
        </p>
      )}
      <div className="bg-tide-sunken rounded-tide-tile flex flex-col gap-1 px-3 py-2.5">
        <span className={sectionTitle}>{M.example}</span>
        <span className="text-[13px] leading-[18px]">{sms}</span>
      </div>
    </Panel>
  );
}
