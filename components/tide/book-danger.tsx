"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useEffectEvent } from "react";
import { AlertTriangleIcon, CheckIcon, PhoneIcon } from "lucide-react";

import { WRONG_COPY as W } from "@/content/patient/book";
import { cn } from "@/lib/utils";
import { buttonClass, ICON } from "./kit";

/**
 * The red parts of "Something is wrong" (mobile/src/features/symptoms/danger.tsx; the colour law L3): the
 * "Any of these, right now?" card, the in-place Help panel a sign or an answer opens, and the "This needs help
 * now" result. Red is always paired with words. A self-harm item opens the calm grey panel instead: no red, no
 * vibration, and its next step is someone to talk to (PRD §5.5). The page around these is forced light (L11).
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

export function DangerSigns({
  signs,
  selected,
  onToggle,
  children,
}: {
  signs: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  /** The in-place Help panel, when an answer points to an emergency. */
  children?: ReactNode;
}) {
  return (
    <section className="rounded-pw-card bg-pw-surface ring-pw-critical-tint flex flex-col gap-2 p-3.5 ring-2 ring-inset">
      <h2 className="flex items-center gap-2 text-[17px] leading-[22px] font-semibold">
        <AlertTriangleIcon className="text-pw-critical-text size-5" {...ICON} />
        {W.anyNow}
      </h2>
      {signs.map((s) => {
        const on = selected.includes(s.key);
        return (
          <button
            key={s.key}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(s.key)}
            className={cn(
              "rounded-pw-row bg-pw-critical-tint flex min-h-[52px] w-full items-center gap-2.5 px-3 py-2.5 text-left",
              FOCUS,
            )}
          >
            <span className="flex-1 text-base leading-[21px] font-semibold">{s.label}</span>
            {on ? (
              <CheckIcon
                className="text-pw-critical-text size-[18px]"
                strokeWidth={3}
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
      {children}
    </section>
  );
}

/**
 * Opened in place the moment an answer points to an emergency (PRD §5.4): the item's own words, a call to the
 * hospital's registered number when one is known (ADR 0084 §3; never typed in code, W5), Help, and the one way
 * back, "This is not happening now", logged as `declined`. Each is reported best effort (`onEvent`).
 */
export function HelpPanel({
  itemKey,
  itemLabel,
  calm,
  hospitalName,
  emergencyPhone,
  onEvent,
  onNotNow,
}: {
  itemKey: string;
  itemLabel: string;
  calm: boolean;
  hospitalName: string | null;
  emergencyPhone: string | null;
  onEvent: (event: "interrupt_shown" | "declined" | "call_tapped", itemKey: string) => void;
  onNotNow: () => void;
}) {
  const shown = useEffectEvent(() => onEvent("interrupt_shown", itemKey));
  useEffect(() => {
    // Once as it appears, where the browser supports it (§3); never for the calm panel.
    if (!calm) navigator.vibrate?.(400);
    shown();
  }, [itemKey, calm]);

  const notNow = (
    <button
      type="button"
      className={buttonClass("outline", "m")}
      onClick={() => {
        onEvent("declined", itemKey);
        onNotNow();
      }}
    >
      {W.notNow}
    </button>
  );

  if (calm)
    return (
      <div
        aria-live="polite"
        className="rounded-pw-row bg-pw-surface-2 flex flex-col gap-2.5 p-3.5"
      >
        <p className="text-[17px] leading-[22px] font-semibold">{W.calmTitle}</p>
        <p className="text-pw-ink-2 text-[15px] leading-[21px]">{W.calmLine}</p>
        <Link href="/emergency/crisis" className={buttonClass("primary")}>
          {W.someoneToTalk}
        </Link>
        {notNow}
      </div>
    );

  const hospital = hospitalName ?? W.theHospital;
  return (
    <div role="alert" className="rounded-pw-row bg-pw-critical-tint flex flex-col gap-2.5 p-3.5">
      <p className="text-[17px] leading-[22px] font-semibold">{W.dangerTitle}</p>
      <p className="text-pw-ink-2 text-[15px] leading-[21px]">{W.becauseYouChose(itemLabel)}</p>
      {emergencyPhone ? (
        <>
          <a
            href={`tel:${emergencyPhone.replace(/[^\d+]/g, "")}`}
            aria-label={W.callLabel(hospital, emergencyPhone)}
            onClick={() => onEvent("call_tapped", itemKey)}
            className={buttonClass("danger")}
          >
            <PhoneIcon className="size-5" {...ICON} />
            {W.call(hospital)}
          </a>
          <p className="text-pw-ink text-[15px] font-semibold tabular-nums max-[760px]:hidden">
            {W.dialFromPhone(emergencyPhone)}
          </p>
        </>
      ) : null}
      <Link href="/emergency" className={buttonClass(emergencyPhone ? "outline" : "danger")}>
        <PhoneIcon className="size-5" {...ICON} />
        {W.getHelpNow}
      </Link>
      {notNow}
    </div>
  );
}

/** Step 3 when the answers point to an emergency. `tag` is the catalogue's own tier word (W2). */
export function DangerResult({ tag, because }: { tag: string; because: string[] }) {
  return (
    <section className="rounded-pw-card bg-pw-critical-tint flex flex-col gap-2.5 p-5">
      <p className="text-pw-critical-text text-xs font-semibold tracking-[0.06em] uppercase">
        {tag}
      </p>
      <h2 className="text-[26px] leading-[30px] font-semibold tracking-[-0.02em]">
        {W.dangerResultTitle}
      </h2>
      <p className="text-pw-ink-2 text-[17px] leading-[25px]">
        {W.dangerResultLine}
        {because.length ? W.dangerBecause(because) : ""}
      </p>
    </section>
  );
}

/** The red "Get help now" door at the foot of step 3 when the result is an emergency. */
export function GetHelpLink() {
  return (
    <Link href="/emergency" className={buttonClass("danger")}>
      <PhoneIcon className="size-5" {...ICON} />
      {W.getHelpNow}
    </Link>
  );
}
