"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ClockAlertIcon, CloudOffIcon, LogInIcon, WifiOffIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";

/*
 * Resus Desk v2 — the banners under the header: offline, device clock, and
 * the writes the server refused. Amber, never red; always words.
 */

const container = "mx-auto w-full max-w-screen-2xl px-4 sm:px-6";

const bannerBox =
  "text-body-s mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200";

function Banner({ icon: Icon, children }: { icon: typeof WifiOffIcon; children: ReactNode }) {
  return (
    <p className={cn(bannerBox, "items-center")}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </p>
  );
}

/** Offline and device-clock warnings (GATE A §9) — amber, never red. */
export function DeskBanners() {
  const { store, initial } = useDeskCtx();
  const n = store.pending.length;
  const deskPath = `${initial.basePath}/${store.episode.id}`;
  return (
    <div className={cn(container, "flex flex-col")}>
      <div role="status" className="flex flex-col">
        {store.online ? null : (
          <Banner icon={WifiOffIcon}>
            {n > 0
              ? `Offline — ${n} ${n === 1 ? "entry" : "entries"} waiting`
              : "Offline — new entries will wait here and send when the connection returns"}
          </Banner>
        )}
        {store.signedOut ? (
          // R2: the queue keeps retrying; signing in elsewhere never drops this page's entries.
          <p className={cn(bannerBox, "flex-wrap items-center")}>
            <LogInIcon aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Signed out — sign in again in a new tab; entries are kept
            </span>
            <Link
              href={`/sign-in?redirect=${encodeURIComponent(deskPath)}`}
              target="_blank"
              className={bannerBtn}
            >
              Sign in (new tab)
            </Link>
          </p>
        ) : null}
        {store.clockWarning ? (
          <Banner icon={ClockAlertIcon}>
            This device&apos;s clock is more than 30 s off — entries are timed by the server clock.
          </Banner>
        ) : null}
      </div>
      <NotSaved />
    </div>
  );
}

const bannerBtn =
  "tap text-body-s inline-flex min-h-11 shrink-0 items-center rounded-md border border-current/40 px-3 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40";

/**
 * Writes the server refused. They no longer drive the desk (use-desk-queue.ts
 * activeView), so they stay here — persistent, amber — until retried or
 * discarded. The alert toast (desk.tsx) is the announcement; this is not a
 * live region, so nothing is read twice.
 */
function NotSaved() {
  const { store } = useDeskCtx();
  const failed = store.pending.filter((p) => p.status === "failed");
  if (failed.length === 0) return null;
  const n = failed.length;
  return (
    <section aria-labelledby="desk-not-saved" className={cn(bannerBox, "flex-col")}>
      <h2 id="desk-not-saved" className="text-body-s flex items-center gap-2 font-medium">
        <CloudOffIcon aria-hidden className="size-4 shrink-0" />
        {n === 1
          ? "1 entry was not saved — the desk does not count it until it is."
          : `${n} entries were not saved — the desk does not count them until they are.`}
      </h2>
      <ul className="flex flex-col gap-2">
        {failed.map((p) => (
          <li key={p.clientEventId} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 font-normal">
              {p.label}
              {p.error ? ` — ${p.error}` : ""}
            </span>
            <button
              type="button"
              onClick={() => store.retry(p.clientEventId)}
              className={bannerBtn}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => store.discard(p.clientEventId)}
              className={bannerBtn}
            >
              Discard
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
