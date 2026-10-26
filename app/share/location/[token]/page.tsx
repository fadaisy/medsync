import type { Metadata } from "next";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { AutoRefresh } from "./_components/auto-refresh";
import {
  agoWords,
  googleMapsUrl,
  isShareToken,
  satelliteEmbedUrl,
  ugandaClock,
} from "./_lib/share";

export const metadata: Metadata = {
  title: "Live location",
  robots: { index: false, follow: false },
  // The token is the secret: never hand this URL to the map sites as a Referer.
  referrer: "no-referrer",
};

type ShareRow = {
  lat: number | string | null;
  lng: number | string | null;
  position_at: string | null;
  ends_at: string;
};

/**
 * The family link of "Share my live location" (ADR 0402). Public: whoever
 * holds the link sees the latest position until the share ends. Read with the
 * ANON key through `location_share_view(token)`, which returns only the
 * position and the times for a live share; never a name or a patient id.
 * Ended, stopped, unknown or malformed links all get the same sentence, so
 * the page never tells whether a token existed.
 */
async function readShare(token: string): Promise<ShareRow | null> {
  if (!isShareToken(token)) return null;
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.rpc("location_share_view", { p_token: token });
  if (error || !Array.isArray(data)) return null;
  return (data[0] as ShareRow | undefined) ?? null;
}

export default async function LiveLocationPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const share = await readShare(token).catch(() => null);
  const now = new Date();

  if (!share) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
        <p className="text-body-l text-muted-foreground">
          This location is no longer being shared.
        </p>
      </main>
    );
  }

  const lat = share.lat === null ? null : Number(share.lat);
  const lng = share.lng === null ? null : Number(share.lng);
  const at = share.position_at ? new Date(share.position_at) : null;
  const hasFix = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-6">
      <AutoRefresh />
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-l">Live location</h1>
        <p className="text-body-m text-muted-foreground">
          {at ? `Last updated ${agoWords(at, now)}` : "Waiting for the first position."} · Shared
          until {ugandaClock(new Date(share.ends_at))} (Uganda time)
        </p>
      </header>

      {hasFix ? (
        <>
          <iframe
            title="Satellite map of the shared position"
            src={satelliteEmbedUrl(lat, lng)}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="border-border aspect-square w-full rounded-xl border sm:aspect-[4/3]"
          />
          <a
            href={googleMapsUrl(lat, lng)}
            target="_blank"
            rel="noreferrer noopener"
            className="bg-primary text-primary-foreground hover:bg-primary-hover text-label inline-flex min-h-11 items-center justify-center rounded-lg px-4"
          >
            Open in Google Maps
          </a>
        </>
      ) : (
        <p className="bg-card shadow-card text-body-m rounded-xl p-4">
          The phone has not sent a position yet.
        </p>
      )}

      <p className="text-body-s text-muted-foreground">
        The position updates only while the MedSync app is open on the phone. This page checks again
        every 30 seconds.
      </p>
    </main>
  );
}
