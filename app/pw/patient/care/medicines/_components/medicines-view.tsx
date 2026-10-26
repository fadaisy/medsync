"use client";

import type { Given } from "@/lib/patient-web/care-medicines";
import type { MyMedicine } from "@/lib/patient-web/care-view";
import type { DayDose, Today } from "@/lib/patient-web/today";
import type { DoseSlot } from "@patient-core/dose-slots";
import type { DoseStatus } from "@patient-core/medicines";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dayHeadline, lastSevenDays, shortDate, timelineFill } from "@patient-core/care-day";
import { hhmm, SLOT_WORDS } from "@patient-core/dose-slots";
import {
  CheckIcon,
  MoonIcon,
  PillIcon,
  PlusIcon,
  SunIcon,
  SunriseIcon,
  SunsetIcon,
} from "lucide-react";

import { setMedicationStateAction } from "@/app/patient/track/actions";
import { reportBoughtOutside, reportCouldNotGet } from "@/app/patient/track/medications/actions";
import { AddMedicineForm, useTake } from "@/app/pw/_components/take";
import { Ring } from "@/components/tide/care-ring";
import { NowCard } from "@/components/tide/cascade";
import { Dialog } from "@/components/tide/controls";
import { Button, Card, ICON, IconDisc, Note, Overline, SectionHead } from "@/components/tide/kit";
import { CARE_COPY } from "@/content/patient/care";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { flipState } from "@/lib/patient-web/care-view";
import { cn } from "@/lib/utils";
import { takeDoseAction } from "../../../_lib/day-actions";

const C = CARE_COPY.meds;

const SLOT_ICONS: Record<DoseSlot, typeof SunIcon> = {
  morning: SunriseIcon,
  midday: SunIcon,
  evening: SunsetIcon,
  night: MoonIcon,
};

const STOP: Record<DoseStatus, { disc: string; sub: string }> = {
  taken: { disc: "bg-pw-accent-pressed text-pw-surface", sub: "text-pw-accent-text" },
  due: {
    disc: "bg-pw-surface text-pw-ink ring-[3px] ring-pw-accent shadow-[0_0_0_9px_var(--pw-accent-tint)]",
    sub: "text-pw-ink",
  },
  later: { disc: "bg-pw-surface-2 text-pw-ink-4", sub: "text-pw-ink-4" },
  missed: { disc: "bg-pw-surface-2 text-pw-ink-2", sub: "text-pw-ink-2" },
  noEntry: { disc: "bg-pw-surface-2 text-pw-ink-3", sub: "text-pw-ink-3" },
};

export function MedicinesView({
  nowIso,
  day,
  week,
  weekTotals,
  mine,
  given,
  adding: startAdding,
}: {
  nowIso: string;
  day: Today;
  week: number[];
  weekTotals: number[];
  mine: MyMedicine[];
  given: Given | null;
  /** `?add=1`: open on Add a medicine, as the phone does. */
  adding: boolean;
}) {
  const now = new Date(nowIso);
  const router = useRouter();
  const { toast, say, undo, pending: undoing } = useTake();
  const [taking, start] = useTransition();
  const [justTaken, setJustTaken] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(startAdding);

  const { taken, total } = day;
  const doses = day.doses.map((d) => ({ ...d, snoozedUntil: snoozed[d.id] ?? null }));
  const due = doses.find((d) => d.status === "due");
  const done = doses.find((d) => d.id === justTaken && d.status === "taken");
  const next = done ? doses.find((d) => d.status !== "taken" && d.time > done.time) : undefined;
  const days = lastSevenDays(now);
  const weekTaken = week.reduce((a, b) => a + b, 0);
  const weekTotal = weekTotals.reduce((a, b) => a + b, 0);
  const fill = timelineFill(taken, total);

  const take = (d: DayDose) =>
    start(async () => {
      const r = await takeDoseAction(d.medicationId, d.scheduledForIso);
      if (r.ok) setJustTaken(d.id);
      else say(r.error || C.takeFailed);
    });

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-5">
      <div className="flex items-center gap-5">
        <Ring
          value={total ? taken / total : 0}
          size={116}
          stroke={12}
          arc="stroke-pw-accent-pressed"
          label={C.ringLabel(taken, total)}
        >
          <span className="font-pw-mono text-[34px] leading-9 font-bold tracking-[-0.04em]">
            {taken}
            <span className="text-pw-ink-4 text-lg">/{total}</span>
          </span>
          <span className="text-pw-ink-2 mt-1 text-xs font-semibold">{C.takenToday}</span>
        </Ring>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Overline area="medicines">{shortDate(now)}</Overline>
          <h2 className="text-[30px] leading-[33px] font-medium tracking-[-0.03em]">
            {dayHeadline(taken, total)}
          </h2>
          <p className="text-pw-ink-2 text-[15px] font-medium">
            {weekTotal ? `${C.weekLine(weekTaken, weekTotal)} · ` : ""}
            {PATIENT_WEB_COPY.whoSeesLog}
          </p>
        </div>
      </div>

      {doses.length ? (
        <Card className="relative px-1.5 py-3.5">
          <ol aria-label={C.timelineLabel} className="relative flex">
            <span
              aria-hidden
              className="bg-pw-surface-3 absolute inset-x-[12%] top-[26px] h-[3px] rounded-full"
            >
              <span
                className="bg-pw-accent-pressed block h-full rounded-full transition-[width] duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{ width: `${Math.round(fill * 100)}%` }}
              />
            </span>
            {doses.map((d) => {
              const Icon = d.status === "taken" ? CheckIcon : SLOT_ICONS[d.slot];
              const sub =
                d.status === "taken"
                  ? C.takenAt(d.takenAt ?? d.time)
                  : d.status === "due" && d.snoozedUntil
                    ? C.snoozedLine(d.snoozedUntil)
                    : `${C.status[d.status]} · ${d.time}`;
              return (
                <li
                  key={d.id}
                  className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[52px] place-items-center rounded-full transition-colors duration-250 motion-reduce:transition-none",
                      STOP[d.status].disc,
                    )}
                  >
                    <Icon
                      className="size-[22px]"
                      strokeWidth={d.status === "taken" ? 3 : 1.8}
                      aria-hidden
                    />
                  </span>
                  <span className="text-[13px] font-bold">{SLOT_WORDS[d.slot]}</span>
                  <span className={cn("px-1 text-xs font-semibold", STOP[d.status].sub)}>
                    <span className="sr-only">{d.medicine}: </span>
                    {sub}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}

      {due && !done ? (
        <NowCard
          pill={C.nowPill(due.time)}
          overline={SLOT_WORDS[due.slot]}
          title={due.medicine}
          line={due.instruction}
          actions={
            <>
              <Button tone="primary" busy={taking} onClick={() => take(due)} className="flex-1">
                <CheckIcon className="size-5" {...ICON} />
                {C.tookIt}
              </Button>
              {due.snoozedUntil ? (
                <Button tone="glass" disabledReason={C.snoozedUntil(due.snoozedUntil)}>
                  {C.snoozed}
                </Button>
              ) : (
                <Button
                  tone="glass"
                  aria-label={C.snoozeLabel}
                  onClick={() =>
                    setSnoozed((s) => ({
                      ...s,
                      [due.id]: hhmm(new Date(Date.now() + 15 * 60_000)),
                    }))
                  }
                >
                  {C.inFifteen}
                </Button>
              )}
            </>
          }
        />
      ) : null}

      {done ? (
        <div
          role="status"
          className="rounded-pw-cascade bg-pw-band text-pw-on-band flex items-center gap-3.5 px-[18px] py-4"
        >
          <span className="bg-pw-accent text-pw-on-accent grid size-[52px] shrink-0 place-items-center rounded-full">
            <CheckIcon className="size-[22px]" strokeWidth={3} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg leading-[23px] font-semibold">
              {C.done(SLOT_WORDS[done.slot], done.takenAt ?? done.time)}
            </span>
            <span className="text-pw-on-band-2 block text-[15px] font-medium">
              {next ? C.next(SLOT_WORDS[next.slot], next.time) : C.allDone}
            </span>
          </span>
          {done.takeId ? (
            <Button
              tone="glass"
              size="s"
              busy={undoing}
              aria-label={C.undoLabel(SLOT_WORDS[done.slot])}
              onClick={() => {
                if (done.takeId) undo(done.takeId);
                setJustTaken(null);
              }}
            >
              {C.undo}
            </Button>
          ) : null}
        </div>
      ) : null}

      {weekTotal ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">{C.week}</h2>
            <span className="text-pw-accent-text text-[13px] font-semibold">
              {C.weekDoses(weekTaken, weekTotal)}
            </span>
          </div>
          <ol className="flex justify-between">
            {week.map((n, i) => {
              const isToday = i === week.length - 1;
              const of = weekTotals[i] ?? 0;
              return (
                <li key={i} className="flex flex-col items-center gap-1.5">
                  <span className="sr-only">
                    {C.dayLabel(isToday ? C.today : (days[i]?.name ?? ""), n, of)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[34px] place-items-center rounded-full text-xs font-bold",
                      isToday
                        ? "bg-pw-surface text-pw-ink ring-pw-ink ring-2"
                        : of && n >= of
                          ? "bg-pw-accent text-pw-on-accent"
                          : n > 0
                            ? "bg-pw-accent-soft text-pw-on-accent"
                            : "bg-pw-surface-2 text-pw-ink-3",
                    )}
                  >
                    {n}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "text-xs font-semibold",
                      isToday ? "text-pw-ink" : "text-pw-ink-3",
                    )}
                  >
                    {days[i]?.letter}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}

      {given ? <GivenSection given={given} say={say} /> : null}

      <section aria-labelledby="my-medicines" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <SectionHead id="my-medicines" title={C.mine} />
          <span className="text-pw-ink-3 text-[13px] font-semibold">
            {C.active(mine.filter((m) => m.state === "active").length)}
          </span>
        </div>
        {!mine.length && !adding ? <p className="text-pw-ink-2 text-[17px]">{C.empty}</p> : null}
        <ul className="grid gap-3 min-[761px]:grid-cols-2">
          {mine.map((m) => (
            <li key={m.id}>
              <MedicineCard
                m={m}
                onSaved={(text) => {
                  say(text);
                  router.refresh();
                }}
              />
            </li>
          ))}
        </ul>
        {adding ? (
          <Card className="flex flex-col gap-3">
            <h3 className="text-[17px] font-semibold">{C.add}</h3>
            <AddMedicineForm
              onCancel={() => setAdding(false)}
              onDone={(text) => {
                setAdding(false);
                say(text);
              }}
            />
          </Card>
        ) : (
          <Button tone="soft" onClick={() => setAdding(true)} className="self-start">
            <PlusIcon className="size-5" {...ICON} />
            {C.add}
          </Button>
        )}
      </section>

      <p className="text-pw-ink-3 text-center text-[13px] font-medium">
        {C.prescribed} {PATIENT_WEB_COPY.whoSeesLog}
      </p>
      {toast}
    </div>
  );
}

/** One medicine: its times in words, and Pause, Resume or Stop. Stop asks first, in a centred dialog (S17). */
function MedicineCard({ m, onSaved }: { m: MyMedicine; onSaved: (text: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  const paused = m.state === "paused";
  const set = (state: "active" | "paused" | "ended") =>
    start(async () => {
      const r = await setMedicationStateAction(m.id, state);
      setConfirm(false);
      onSaved(
        !r.ok
          ? C.saveFailed
          : state === "ended"
            ? C.stopped(m.name)
            : state === "paused"
              ? C.pausedToast(m.name)
              : C.resumed(m.name),
      );
    });
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <IconDisc className="text-pw-area-medicines bg-pw-surface-2">
          <PillIcon className="size-5" {...ICON} />
        </IconDisc>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-[22px] font-bold break-words">{m.name}</p>
          <p className="text-pw-ink-2 text-[13px] font-medium">
            {paused ? C.paused : ""}
            {m.when}
            {m.instructions ? ` · ${m.instructions}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button
          tone="soft"
          size="s"
          busy={busy && !confirm}
          aria-label={`${paused ? C.resume : C.pause} ${m.name}`}
          onClick={() => set(flipState(m.state))}
        >
          {paused ? C.resume : C.pause}
        </Button>
        <Button
          tone="outline"
          size="s"
          aria-label={`${C.stop} ${m.name}`}
          onClick={() => setConfirm(true)}
        >
          {C.stop}
        </Button>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={C.stopTitle(m.name)}
        footer={
          <>
            <Button tone="soft" onClick={() => setConfirm(false)}>
              {C.keep}
            </Button>
            <Button tone="outline" busy={busy} onClick={() => set("ended")}>
              {C.yesStop}
            </Button>
          </>
        }
      >
        <p className="text-[17px] leading-[25px]">{C.stopBody}</p>
      </Dialog>
    </Card>
  );
}

/** "What you were given": names, the hand-over line and the refill line (signed); amounts stay on the label. */
function GivenSection({ given, say }: { given: Given; say: (text: string) => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const report = (act: typeof reportBoughtOutside, lineId: string) =>
    start(async () => {
      const r = await act({ clientKey: crypto.randomUUID(), lineId });
      if (r.ok) router.refresh();
      else say(r.error ?? PATIENT_WEB_COPY.offline);
    });
  return (
    <section aria-labelledby="given" className="flex flex-col gap-3">
      <SectionHead id="given" title={given.section} />
      {given.groups.map((g) => (
        <Card key={g.handoverId} className="flex flex-col gap-2">
          <p className="text-pw-ink-2 text-[15px] font-medium">{g.head}</p>
          <ul className="flex flex-col">
            {g.medicines.map((m) => (
              <li
                key={m.lineId}
                className="border-pw-line flex flex-col gap-0.5 border-t py-2.5 first:border-t-0"
              >
                <span className="text-[17px] font-semibold">{m.medicine}</span>
                {m.refill ? (
                  <span className="text-pw-ink-2 text-[13px] font-medium">{m.refill}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <Note>{C.onTheLabel}</Note>
        </Card>
      ))}
      {given.notGiven.length ? (
        <ul aria-label={given.notGivenSection} className="flex flex-col gap-3">
          {given.notGiven.map((l) => (
            <li key={l.lineId}>
              <Card flat className="flex flex-col gap-2">
                <p className="text-[17px] font-semibold">{l.medicine}</p>
                <p className="text-[15px] font-semibold">{l.lead}</p>
                <p className="text-pw-ink-2 text-[15px]">{l.text}</p>
                {l.couldNotGet ? (
                  <p className="text-pw-ink-2 text-[13px]">{given.saidCouldNotGet}</p>
                ) : l.canReport ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="s"
                      busy={busy}
                      onClick={() => report(reportBoughtOutside, l.lineId)}
                    >
                      {given.boughtIt}
                    </Button>
                    <Button
                      size="s"
                      tone="outline"
                      busy={busy}
                      onClick={() => report(reportCouldNotGet, l.lineId)}
                    >
                      {given.couldNotGet}
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
