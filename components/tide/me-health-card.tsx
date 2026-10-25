"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { ME_COPY } from "@/content/patient/me";
import { cn } from "@/lib/utils";

const W = ME_COPY.card;

/**
 * The health card (the phone's components/tide/health-card.tsx, §8.6, ADR 0414): a bank-card-sized navy
 * front and a light back for whoever finds the card or treats the holder. A button: click, Enter or Space
 * turns it (400 ms, the system's ease); under reduce motion the faces swap with no turn. Everything comes in
 * as props; conditions arrive already filtered (S18, `cardLines` never passes a private entry) or null when
 * the holder keeps them off the card. No QR and no blood group: the record holds neither truthfully.
 */
export interface HealthCardData {
  holder: string;
  /** Spaced code, or "Given at your first visit". */
  number: string;
  facility: string | null;
  age: string | null;
  /** Null when the patient keeps them off the card (the default, PRD Q6). */
  conditions: string | null;
  allergies: string;
  /** "On file at Mulago" or "None given"; null: unknown. */
  nextOfKin: string | null;
  ifFound: string;
}

const Micro = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span
    className={cn(
      "block text-[11px] leading-[14px] font-semibold tracking-[0.1em] uppercase",
      className,
    )}
  >
    {children}
  </span>
);

export function MeHealthCard({ data }: { data: HealthCardData }) {
  const [back, setBack] = useState(false);
  const coded = /\d/.test(data.number);
  return (
    <button
      type="button"
      aria-pressed={back}
      aria-label={W.label(back)}
      onClick={() => setBack((b) => !b)}
      className="rounded-pw-card focus-visible:outline-pw-focus block w-full max-w-[460px] text-left perspective-[1100px] focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <span
        className={cn(
          "grid aspect-[1.586] transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] transform-3d motion-reduce:transition-none",
          back && "rotate-y-180 motion-reduce:rotate-y-0",
        )}
      >
        <span
          aria-hidden={back}
          className={cn(
            "rounded-pw-card bg-pw-band text-pw-on-band shadow-pw-float relative flex flex-col justify-between overflow-hidden px-5 py-4 [grid-area:1/1] backface-hidden",
            back && "motion-reduce:invisible",
          )}
        >
          <span
            aria-hidden
            className="bg-pw-on-band/5 absolute -top-24 -right-16 size-60 rounded-full"
          />
          <span
            aria-hidden
            className="bg-pw-accent/10 absolute -right-6 -bottom-28 size-44 rounded-full"
          />
          <span className="relative flex justify-between gap-2">
            <span>
              <span className="block text-[17px] font-extrabold">
                Med<span className="text-pw-accent">Sync</span>
              </span>
              <Micro className="text-pw-on-band-2">{W.brand}</Micro>
            </span>
            <span className="min-w-0 text-right">
              <span className="block truncate text-[13px] font-semibold">
                {data.facility ?? W.noFacility}
              </span>
              <span className="text-pw-on-band-2 block text-xs">{W.facility}</span>
            </span>
          </span>
          <span className="relative flex items-center gap-3">
            <span
              aria-hidden
              className="bg-pw-band-glass ring-pw-on-band-2/40 flex h-[30px] w-10 shrink-0 items-center rounded-[7px] ring-1"
            >
              <span className="border-pw-on-band-2/40 block h-3.5 w-full border-y" />
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                coded
                  ? "font-pw-mono text-[20px] font-semibold tracking-[0.13em] max-[400px]:text-[17px]"
                  : "text-pw-on-band-2 text-[15px] font-semibold",
              )}
            >
              {data.number}
            </span>
          </span>
          <span className="relative flex items-end justify-between gap-2.5">
            <span className="min-w-0">
              <Micro className="text-pw-on-band-2">{W.holder}</Micro>
              <span className="block truncate text-[15px] font-bold tracking-[0.02em]">
                {data.holder.toUpperCase()}
              </span>
            </span>
            {data.age ? (
              <span className="shrink-0 text-right">
                <Micro className="text-pw-on-band-2">{W.age}</Micro>
                <span className="text-pw-on-band-accent block text-[15px] font-semibold">
                  {data.age}
                </span>
              </span>
            ) : null}
          </span>
        </span>

        <span
          aria-hidden={!back}
          className={cn(
            "rounded-pw-card bg-pw-surface text-pw-ink ring-pw-line shadow-pw-float flex rotate-y-180 flex-col gap-1.5 overflow-hidden px-4 pt-3 pb-2.5 ring-1 [grid-area:1/1] backface-hidden motion-reduce:rotate-y-0",
            !back && "motion-reduce:invisible",
          )}
        >
          <span className="flex items-center gap-2">
            <Micro className="text-pw-accent-text flex-1">{W.emergency}</Micro>
            <span className="text-xs font-extrabold">
              Med<span className="text-pw-accent-text">Sync</span>
            </span>
          </span>
          <span className="bg-pw-surface-2 block rounded-lg px-2.5 py-1.5">
            <Micro className="text-pw-ink-3">{W.number}</Micro>
            <span
              className={cn(
                "block truncate",
                coded
                  ? "font-pw-mono text-[20px] font-semibold tracking-[0.11em] max-[400px]:text-[17px]"
                  : "text-pw-ink-2 text-sm font-semibold",
              )}
            >
              {data.number}
            </span>
          </span>
          <Row k={W.allergies} v={data.allergies} />
          <Row k={W.conditions} v={data.conditions ?? W.hidden} />
          {data.nextOfKin ? <Row k={W.nok} v={data.nextOfKin} /> : null}
          <span className="flex-1" />
          <span className="line-clamp-2 text-[13px] leading-[17px] font-semibold">
            {data.ifFound}
          </span>
          <span className="text-pw-ink-3 block truncate text-[11px]">{W.written}</span>
        </span>
      </span>
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex justify-between gap-2.5 text-[13px] leading-[18px]">
      <span className="text-pw-ink-3 shrink-0 font-medium">{k}</span>
      <span className="min-w-0 truncate text-right font-bold">{v}</span>
    </span>
  );
}
