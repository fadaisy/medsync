"use client";

import type { IncomingCardActions } from "./incoming-card";
import type { IncomingPreArrival } from "@/lib/emergency/queries";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Panel } from "@/components/medsync/panel";
import { Pill } from "@/components/ui/pill";
import { createClient } from "@/lib/supabase/client";
import { BOARD_ESCALATION_MS, ETA_BAND_LABEL } from "@/supabase/functions/_shared/pre-arrival";
import { AutoRefresh } from "../../_components/auto-refresh";
import { formatClock, IncomingCard, subjectWords } from "./incoming-card";

/**
 * The Incoming board (PRD MS-PRD-SYM-001 §8.5; ADR 0098). LIVE: a Realtime
 * subscription on the facility's `emergency_pre_arrivals` rows — RLS scopes
 * what arrives — whose only job is `router.refresh()`: the row is re-read
 * through the audited server path, and nothing from the payload is ever
 * rendered. Polling every 15 s is the fallback when the socket is not there.
 * A chime (two Web Audio tones, no asset) on a NEW open row, off with one
 * switch, remembered per browser; a badge of unacknowledged rows in the
 * title; a row unacknowledged ≥ BOARD_ESCALATION_MS escalates on a 30 s tick.
 */

const CHIME_KEY = "medsync:incoming-chime";
const POLL_MS = 15_000;
const TICK_MS = 30_000;

/** The chime switch as an external store: localStorage, this tab's toggles, other tabs' `storage` events. */
const chimeListeners = new Set<() => void>();
function readChime(): boolean {
  try {
    return localStorage.getItem(CHIME_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeChime(on: boolean) {
  try {
    localStorage.setItem(CHIME_KEY, on ? "on" : "off");
  } catch {
    /* per-browser convenience only */
  }
  for (const l of chimeListeners) l();
}
function subscribeChime(l: () => void) {
  chimeListeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    chimeListeners.delete(l);
    window.removeEventListener("storage", l);
  };
}

function chime() {
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const at = ctx.currentTime;
  for (const [freq, start] of [
    [880, 0],
    [1174.66, 0.18],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at + start);
    gain.gain.exponentialRampToValueAtTime(0.3, at + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + start + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at + start);
    osc.stop(at + start + 0.18);
  }
  window.setTimeout(() => void ctx.close(), 600);
}

export function IncomingBoard({
  open,
  closed,
  facilityId,
  departments,
  actions,
  queueHref,
}: {
  open: IncomingPreArrival[];
  closed: IncomingPreArrival[];
  facilityId: string;
  departments: ReadonlyArray<{ id: string; name: string }>;
  actions: IncomingCardActions;
  queueHref: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  // Default ON; the server snapshot is ON too, so hydration never disagrees.
  const chimeOn = useSyncExternalStore(subscribeChime, readChime, () => true);
  const interacted = useRef(false);
  const seen = useRef<Set<string> | null>(null);

  // Realtime: the payload is a doorbell, never a source of what to show.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`pre-arrivals:${facilityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "emergency_pre_arrivals",
          filter: `facility_id=eq.${facilityId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [facilityId, router]);

  // Escalation clock.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  // Autoplay rules: a browser only lets a page make a sound after the user
  // has touched it. Remember the first gesture; the switch itself is one.
  useEffect(() => {
    const mark = () => {
      interacted.current = true;
    };
    window.addEventListener("pointerdown", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  // Chime on a row this board has not shown before — not on first paint.
  useEffect(() => {
    const ids = new Set(open.map((r) => r.id));
    const prev = seen.current;
    seen.current = ids;
    if (!prev || !chimeOn || !interacted.current) return;
    if ([...ids].some((id) => !prev.has(id))) chime();
  }, [open, chimeOn]);

  const toggleChime = () => {
    writeChime(!chimeOn);
    if (!chimeOn) chime();
  };

  const unacknowledged = open.filter((r) => r.acknowledgedAt === null).length;

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Incoming"
        count={unacknowledged}
        action={
          <>
            <AutoRefresh everyMs={POLL_MS} />
            <button
              type="button"
              role="switch"
              aria-checked={chimeOn}
              onClick={toggleChime}
              className="text-body-s border-border hover:bg-muted ease-expo-out tap inline-flex min-h-9 items-center gap-2 rounded-full border px-3 transition-colors duration-150"
            >
              <span
                aria-hidden
                className={
                  chimeOn ? "bg-foreground size-2 rounded-full" : "bg-border size-2 rounded-full"
                }
              />
              {chimeOn ? "Chime on" : "Chime off"}
            </button>
          </>
        }
      >
        {open.length === 0 ? (
          <p className="text-muted-foreground text-body-s px-5 py-6">
            Nobody is pre-alerted right now. A card appears here the moment a patient or bystander
            tells this hospital they are coming.
          </p>
        ) : (
          <ul className="flex flex-col gap-4 p-4">
            {open.map((r) => {
              const waited = now - new Date(r.createdAt).getTime();
              const escalatedMinutes =
                r.acknowledgedAt === null && waited >= BOARD_ESCALATION_MS
                  ? Math.floor(waited / 60_000)
                  : null;
              return (
                <li key={r.id}>
                  <IncomingCard
                    row={r}
                    escalatedMinutes={escalatedMinutes}
                    departments={departments}
                    actions={actions}
                    queueHref={queueHref}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Today, closed" count={closed.length}>
        {closed.length === 0 ? (
          <p className="text-muted-foreground text-body-s px-5 py-4">No pre-alerts closed today.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {closed.map((r) => (
              <li key={r.id} className="text-body-s flex flex-wrap items-center gap-3 px-5 py-2.5">
                <span className="text-muted-foreground font-mono tabular-nums">
                  {formatClock(r.createdAt)}
                </span>
                <span className="text-foreground">{subjectWords(r.subject)}</span>
                <span className="text-muted-foreground">ETA was {ETA_BAND_LABEL[r.etaBand]}</span>
                <Pill tone={r.status === "arrived" ? "stable" : "neutral"} className="ml-auto">
                  {r.status === "arrived"
                    ? "Arrived"
                    : r.status === "not_arriving"
                      ? "Not arriving"
                      : r.status === "hoax"
                        ? "Hoax"
                        : r.status === "cancelled"
                          ? "Cancelled by reporter"
                          : "Expired"}
                </Pill>
                {/* The card leaves the board the moment Arrived lands, so the intake's next step lives here. */}
                {r.status === "arrived" && r.arrivedIntakeId ? (
                  <Link href={queueHref} className="text-foreground underline underline-offset-4">
                    Open the queue
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
