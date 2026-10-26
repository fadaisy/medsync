"use client";

import type { ReadingInput, ReadingLevel } from "@patient-core/readings";
import { useEffect, useState } from "react";
import { checkReading, UNITS } from "@patient-core/readings";
import { AlertTriangleIcon } from "lucide-react";

import { READINGS_COPY } from "@/content/patient/readings";
import { hhmm, recheckMinutes } from "@/lib/patient-web/readings";
import { cn } from "@/lib/utils";
import { Button, ButtonLink, Card, ICON, Note, Pill, StatusPill } from "./kit";
import { HelpButton } from "./shell";

/**
 * The reading's clinical colours, in one file (L3, L4): the live check band, the chest-pain help row and the
 * dangerous-reading interrupt. Every colour sits beside its word.
 */

const BAND: Record<ReadingLevel, { box: string; dot: string }> = {
  empty: { box: "bg-pw-surface-2 text-pw-ink-2", dot: "bg-pw-line-strong" },
  ok: { box: "bg-pw-stable-tint text-pw-stable-text", dot: "bg-pw-stable-text" },
  watch: { box: "bg-pw-caution-tint text-pw-caution-text", dot: "bg-pw-caution-text" },
  danger: { box: "bg-pw-critical-tint text-pw-critical-text", dot: "bg-pw-emergency" },
};

export function CheckBand({
  level,
  text,
  selfCare,
}: {
  level: ReadingLevel;
  text: string;
  selfCare?: string;
}) {
  const c = BAND[level];
  return (
    <div
      aria-live="polite"
      className={cn(
        "rounded-pw-row flex flex-col items-center gap-0.5 px-3 py-2.5 text-center text-[15px] leading-5 font-semibold",
        c.box,
      )}
    >
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", c.dot)} />
        {text}
      </span>
      {selfCare ? <span>{selfCare}</span> : null}
    </div>
  );
}

/** Chest pain is an emergency whatever the number says. */
export function ChestPainRow() {
  return (
    <a
      href="/emergency"
      className={cn(
        "rounded-pw-row bg-pw-emergency text-pw-on-emergency flex min-h-12 items-center gap-2.5 px-3.5 py-3 text-[15px] font-semibold",
        "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
    >
      <AlertTriangleIcon className="size-5 shrink-0" {...ICON} />
      {READINGS_COPY.chestPain}
    </a>
  );
}

const D = READINGS_COPY.danger;
const fill = (s: string, k: string, v: string | number) => s.replace(`{${k}}`, String(v));

/** The dangerous-reading interrupt (phone danger.tsx, F-22). The page wraps it in forced light (L11). */
export function DangerInterrupt({ input }: { input: ReadingInput }) {
  const check = checkReading(input);
  const minutes = recheckMinutes(input);
  const total = minutes * 60_000;
  const [seenAt] = useState(() => hhmm(new Date()));
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Once on arrival, where the browser supports it (§3). Never elsewhere.
  useEffect(() => {
    navigator.vibrate?.(400);
  }, []);
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  const left = endsAt === null ? total : Math.max(0, endsAt - now);
  const done = endsAt !== null && left === 0;
  const mmss = `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}`;
  const big =
    input.kind === "bp" ? `${input.top ?? "–"}/${input.bottom ?? "–"}` : `${input.value ?? "–"}`;
  const lowSugar = input.kind === "sugar" && Boolean(check.selfCare);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Pill className="bg-pw-surface text-pw-critical-text">
          <AlertTriangleIcon className="size-3.5" {...ICON} />
          <span suppressHydrationWarning>{fill(D.pill, "time", seenAt)}</span>
        </Pill>
        <HelpButton />
      </div>

      <section role="alert" className="rounded-pw-card bg-pw-critical-tint flex flex-col gap-3 p-6">
        <p className="text-pw-critical-text flex flex-wrap items-baseline gap-2">
          <span className="text-[52px] leading-[56px] font-bold tracking-[-0.03em] tabular-nums">
            {big}
          </span>
          <span className="text-base font-semibold">{UNITS[input.kind]}</span>
        </p>
        <StatusPill tone="critical" className="bg-pw-surface self-start">
          {check.text}
        </StatusPill>
        <h1 className="text-pw-ink text-[30px] leading-[34px] font-medium tracking-[-0.03em] text-balance">
          {check.dangerWord ?? D.fallbackHeadline}
        </h1>
      </section>

      {endsAt === null ? (
        <>
          <h2 className="text-[19px] leading-6 font-semibold">{D.askSigns}</h2>
          <Card className="p-0">
            <ul className="divide-pw-line divide-y">
              {(check.signs ?? []).map((s) => (
                <li key={s} className="px-5 py-3 text-base leading-[22px]">
                  {s}
                </li>
              ))}
            </ul>
          </Card>
          {check.selfCare ? <Note tone="info">{check.selfCare}</Note> : null}
          <div className="flex flex-col gap-3 min-[761px]:flex-row">
            <ButtonLink href="/emergency" tone="danger">
              {D.yesHelp}
            </ButtonLink>
            <Button tone="outline" onClick={() => setEndsAt(Date.now() + total)}>
              {lowSugar ? D.hadSweet : D.noFine}
            </Button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-[19px] leading-6 font-semibold">
            {fill(D.sitQuietly, "n", minutes)}
          </h2>
          <section
            role="timer"
            aria-label={fill(D.left, "mmss", mmss)}
            className="rounded-pw-card bg-pw-band text-pw-on-band flex items-center gap-4 p-5"
          >
            <span aria-hidden className="text-[34px] leading-none font-semibold tabular-nums">
              {mmss}
            </span>
            <span className="text-pw-on-band-2 flex-1 text-[15px] leading-[22px] font-medium">
              {done ? D.timeUp : D.rest}
            </span>
          </section>
          <p className="text-pw-ink-2 text-[15px] leading-[22px] font-medium">{D.signsStart}</p>
          {done ? (
            <ButtonLink href={`/patient/care/readings?kind=${input.kind}`} tone="accent">
              {D.measureAgain}
            </ButtonLink>
          ) : null}
        </>
      )}

      <p className="text-pw-ink text-[15px] leading-[22px] font-semibold">{D.notAlerted}</p>
      <p className="text-pw-ink-3 text-center text-xs font-medium">{D.pending}</p>
    </div>
  );
}
