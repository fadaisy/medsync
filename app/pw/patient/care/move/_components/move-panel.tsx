"use client";

import type { Activity, Effort } from "@patient-core/care-move";
import type { LogRow } from "@patient-core/log";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { lastSevenDays } from "@patient-core/care-day";
import {
  ACTIVITIES,
  costOf,
  exercisesOn,
  exerciseUnit,
  hasEffort,
  kcalFor,
  WEEK_GOAL,
} from "@patient-core/care-move";
import { DAY_GOAL, lastDays, minutesOn, STEP_AIM, stepsOn } from "@patient-core/log";
import {
  ActivityIcon,
  AlertTriangleIcon,
  DropletIcon,
  FootprintsIcon,
  HeartIcon,
  HomeIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  SunIcon,
  WindIcon,
} from "lucide-react";

import { Ring } from "@/components/tide/care-ring";
import { Chip, ChipRow, Dialog, NumberField, Segments } from "@/components/tide/controls";
import {
  Band,
  Button,
  ButtonLink,
  Card,
  ICON,
  IconDisc,
  Note,
  Overline,
} from "@/components/tide/kit";
import { CARE_COPY } from "@/content/patient/care";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { logExerciseAction } from "@/lib/patient-web/care-actions";
import { cn } from "@/lib/utils";

const C = CARE_COPY.move;
const D = C.dialog;
const ICONS: Record<Activity["icon"], typeof HeartIcon> = {
  walk: FootprintsIcon,
  footprints: FootprintsIcon,
  activity: ActivityIcon,
  heart: HeartIcon,
  sun: SunIcon,
  home: HomeIcon,
  wind: WindIcon,
  droplet: DropletIcon,
};
const SIGN_ICONS = [HeartIcon, WindIcon, AlertTriangleIcon, DropletIcon];
const n = (v: number) => v.toLocaleString("en-GB");

/**
 * Move (the phone's features/care-more/move-panel.tsx). Steps are the ones the phone app synced; a browser
 * has no step counter, so with none the ring shows active minutes and says where steps come from (§3).
 * The safety card is unchanged and carries the one red "Get help" (L3).
 */
export function MovePanel({
  now,
  rows,
  weightKg,
  onToast,
}: {
  now: Date;
  rows: LogRow[];
  weightKg: number | null;
  onToast: (text: string) => void;
}) {
  const days = lastSevenDays(now);
  const dates = lastDays(now);
  const weekMinutes = minutesOn(rows, dates);
  const minutesToday = weekMinutes[weekMinutes.length - 1] ?? 0;
  const weekSteps = stepsOn(rows, dates);
  const synced = weekSteps.some((s) => s > 0);
  const stepsToday = synced ? (weekSteps[weekSteps.length - 1] ?? 0) : null;
  const today = exercisesOn(rows, now);
  const kcalToday = today.reduce((t, e) => t + (e.kcal ?? 0), 0);
  const [view, setView] = useState<"steps" | "minutes">(synced ? "steps" : "minutes");
  const [dialog, setDialog] = useState<"live" | "log" | null>(null);
  const bars = view === "steps" ? weekSteps : weekMinutes;
  const goal = view === "steps" ? STEP_AIM : DAY_GOAL;
  const weekTotal = weekMinutes.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-5">
      <Band className="rounded-pw-cascade flex items-center gap-5">
        <Ring
          value={stepsToday !== null ? stepsToday / STEP_AIM : minutesToday / DAY_GOAL}
          size={112}
          stroke={12}
          track="stroke-pw-band-glass"
          label={
            stepsToday !== null
              ? C.stepsRing(n(stepsToday), n(STEP_AIM))
              : C.minutesRing(minutesToday, DAY_GOAL)
          }
        >
          {stepsToday !== null ? (
            <FootprintsIcon className="size-7" {...ICON} />
          ) : (
            <ActivityIcon className="size-7" {...ICON} />
          )}
        </Ring>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-pw-on-band-accent text-xs leading-4 font-semibold tracking-[0.06em] uppercase">
            {stepsToday !== null ? C.stepsToday : C.activeToday}
          </span>
          <span className="text-2xl leading-7 font-semibold tabular-nums">
            {stepsToday !== null ? n(stepsToday) : C.minutesShown(minutesToday)}
          </span>
          <span className="text-pw-on-band-2 text-[15px] font-medium">
            {C.activeLine(minutesToday, kcalToday)}
          </span>
          <span className="text-pw-on-band-2 text-[13px] font-medium">
            {stepsToday !== null
              ? PATIENT_WEB_COPY.stepsFromPhone
              : PATIENT_WEB_COPY.stepsNeedPhone}
          </span>
        </div>
      </Band>

      <div className="flex flex-wrap gap-2">
        <Button tone="accent" size="m" className="flex-1" onClick={() => setDialog("live")}>
          <PlayIcon className="size-5" {...ICON} />
          {C.start}
        </Button>
        <Button tone="soft" size="m" className="flex-1" onClick={() => setDialog("log")}>
          <PlusIcon className="size-5" {...ICON} />
          {C.logOne}
        </Button>
      </div>

      {today.length ? (
        <Card className="flex flex-col gap-2.5">
          <h2 className="text-[17px] font-semibold">{C.today}</h2>
          <ul className="flex flex-col gap-2.5">
            {today.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5">
                <IconDisc tone="accent" className="size-8">
                  <ActivityIcon className="size-4" {...ICON} />
                </IconDisc>
                <span className="min-w-0 flex-1 text-[17px]">{e.label}</span>
                <span className="text-pw-ink-2 text-[13px] font-semibold">
                  {C.exerciseLine(e.minutes, e.kcal)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <Segments
          label={C.viewLabel}
          options={[
            { value: "steps", label: C.views.steps },
            { value: "minutes", label: C.views.minutes },
          ]}
          value={view}
          onChange={setView}
          className="self-start"
        />
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold">
            {view === "steps" ? C.stepsWeek : C.minutesWeek}
          </h2>
          <span className="text-pw-accent-text text-[13px] font-semibold">
            {view === "steps"
              ? C.perDay(n(Math.round(weekSteps.reduce((a, b) => a + b, 0) / 7)))
              : C.ofGoal(weekTotal, WEEK_GOAL)}
          </span>
        </div>
        <div
          role="img"
          aria-label={C.weekLabel(
            view === "steps" ? C.views.steps : C.views.minutes,
            bars
              .map((m, i) => `${i === 6 ? C.today.toLowerCase() : (days[i]?.name ?? "")} ${m}`)
              .join(", "),
          )}
          className="flex h-24 items-end gap-2"
        >
          {bars.map((m, i) => {
            const isToday = i === bars.length - 1;
            return (
              <span key={i} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={cn(
                    "w-full rounded-lg",
                    isToday ? "bg-pw-accent" : m >= goal ? "bg-pw-act" : "bg-pw-line-strong",
                  )}
                  style={{ height: Math.max(4, Math.round((Math.min(m, goal) / goal) * 76)) }}
                />
                <span
                  className={cn(
                    "text-[11px]",
                    isToday ? "text-pw-ink font-semibold" : "text-pw-ink-2",
                  )}
                >
                  {days[i]?.letter}
                </span>
              </span>
            );
          })}
        </div>
        <p className="text-pw-ink-2 text-[15px]">
          {view === "steps" ? C.stepsAim(n(STEP_AIM)) : C.minutesAim(WEEK_GOAL)}
        </p>
      </Card>

      <SafetyCard />

      <ActivityDialog
        mode={dialog}
        weightKg={weightKg}
        onClose={() => setDialog(null)}
        onSaved={(text) => {
          setDialog(null);
          onToast(text);
        }}
      />
    </div>
  );
}

/** The amber safety card: signs, steps, and the one red "Get help" (a clinical Note, L4; Help, L3). */
function SafetyCard() {
  const S = C.safety;
  return (
    <section aria-label={S.label}>
      <Note tone="caution" className="rounded-pw-card">
        <div className="flex flex-col gap-3">
          <div>
            <Overline>{S.overline}</Overline>
            <h2 className="text-pw-ink text-[17px] leading-[22px] font-semibold">{S.title}</h2>
          </div>
          <ul className="grid gap-2 min-[480px]:grid-cols-2">
            {S.signs.map((text, i) => {
              const Icon = SIGN_ICONS[i] ?? AlertTriangleIcon;
              return (
                <li
                  key={text}
                  className="bg-pw-surface rounded-pw-row text-pw-ink flex items-center gap-2 px-3 py-2.5 text-[15px]"
                >
                  <Icon className="size-[18px] shrink-0" {...ICON} />
                  {text}
                </li>
              );
            })}
          </ul>
          <div className="bg-pw-surface rounded-pw-row text-pw-ink flex flex-col gap-1.5 p-3">
            <p className="text-[15px] font-semibold">{S.whatToDo}</p>
            {S.steps.map((s) => (
              <p key={s} className="text-[15px] leading-[21px] font-medium">
                {s}
              </p>
            ))}
          </div>
          <ButtonLink href="/help" tone="danger" className="w-full">
            <PhoneIcon className="size-5" {...ICON} />
            {S.help}
          </ButtonLink>
        </div>
      </Note>
    </section>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Pick the activity and effort, then either time it live or say how long it was (a centred dialog, W1). */
function ActivityDialog({
  mode,
  weightKg,
  onClose,
  onSaved,
}: {
  mode: "live" | "log" | null;
  weightKg: number | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const router = useRouter();
  const [activity, setActivity] = useState<Activity>(ACTIVITIES[0]!);
  const [effort, setEffort] = useState<Effort>("moderate");
  const [minutes, setMinutes] = useState("30");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [banked, setBanked] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const elapsed = banked + (startedAt ? Math.max(0, tick - startedAt) : 0);
  const liveMinutes = Math.round(elapsed / 60_000);
  const mins = mode === "live" ? liveMinutes : Math.round(Number(minutes) || 0);
  const { met } = costOf(activity, effort);
  const kcal = kcalFor(met, weightKg, mins);

  const reset = () => {
    setStartedAt(null);
    setBanked(0);
    setMinutes("30");
  };
  const close = () => {
    reset();
    onClose();
  };
  const save = () =>
    start(async () => {
      if (mins <= 0) return;
      const r = await logExerciseAction({
        unit: exerciseUnit(activity, effort),
        minutes: mins,
        kcal,
      });
      reset();
      router.refresh();
      onSaved(r.ok ? D.saved(activity.label, mins, kcal) : r.error || D.saveFailed);
    });
  const Icon = ICONS[activity.icon];

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(o) => (o ? null : close())}
      title={mode === "live" ? D.liveTitle : D.logTitle}
      width="wide"
    >
      <div className="flex flex-col gap-4">
        <Overline>{mode === "live" ? D.liveOverline : D.logOverline}</Overline>
        <ChipRow label={D.activityLabel}>
          {ACTIVITIES.map((a) => (
            <Chip key={a.key} selected={a.key === activity.key} onClick={() => setActivity(a)}>
              {a.label}
            </Chip>
          ))}
        </ChipRow>
        {hasEffort(activity) ? (
          <ChipRow label={D.effortLabel}>
            {(["easy", "moderate", "hard"] as const).map((e) => (
              <Chip key={e} selected={effort === e} onClick={() => setEffort(e)}>
                {D.efforts[e]}
              </Chip>
            ))}
          </ChipRow>
        ) : null}

        {mode === "live" ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <Icon className="text-pw-accent-text size-8" {...ICON} />
            <p
              aria-live="polite"
              className="font-pw-mono text-5xl leading-[54px] font-bold tabular-nums"
            >
              {clock(elapsed)}
            </p>
            <p className="text-pw-ink-2 text-[15px] font-medium">
              {kcal ? D.kcalSoFar(kcal) : weightKg ? D.keepGoing : D.needWeight}
            </p>
            <div className="flex w-full flex-wrap items-start gap-2">
              {startedAt ? (
                <Button
                  tone="soft"
                  className="flex-1"
                  onClick={() => {
                    setBanked(elapsed);
                    setStartedAt(null);
                  }}
                >
                  {D.pause}
                </Button>
              ) : (
                <Button
                  tone="accent"
                  className="flex-1"
                  onClick={() => {
                    setTick(Date.now());
                    setStartedAt(Date.now());
                  }}
                >
                  <PlayIcon className="size-5" {...ICON} />
                  {elapsed ? D.carryOn : D.startTimer}
                </Button>
              )}
              <Button
                className="flex-1"
                busy={busy}
                disabledReason={liveMinutes < 1 ? D.atLeastMinute : undefined}
                onClick={save}
              >
                {D.finish}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <NumberField
              label={D.howLong}
              unit={D.minutesUnit}
              value={minutes}
              onChange={setMinutes}
              step={5}
              min={1}
              max={600}
            />
            <p className="text-pw-ink-2 text-[15px] font-medium">
              {kcal ? D.kcalFrom(kcal) : D.needWeightLog}
            </p>
            <Button
              busy={busy}
              disabledReason={mins <= 0 ? D.sayHowLong : undefined}
              onClick={save}
            >
              {D.save}
            </Button>
          </div>
        )}
        <p className="text-pw-ink-3 text-center text-[13px]">{D.source}</p>
      </div>
    </Dialog>
  );
}
