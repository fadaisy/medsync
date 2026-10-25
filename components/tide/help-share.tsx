"use client";

import type { ActiveShare } from "@/lib/patient-web/help-data";
import { useEffect, useRef, useState } from "react";
import { clockWords, leftWords, SHARE_MAX_MINUTES, shouldWrite } from "@patient-core/help-sos";
import { LocateFixedIcon, SendIcon } from "lucide-react";

import { HELP_COPY } from "@/content/patient/help";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { sendFixAction, startShareAction, stopShareAction } from "@/lib/patient-web/help-actions";
import { Chip, ChipRow, Dialog } from "./controls";
import { Band, Button, ICON, Note } from "./kit";

/**
 * "Share my live location" in a browser (§3, ADR 0402): `watchPosition` only while this page is open, started
 * from a button only (L9), at most one write every 20 s through the phone's `location_shares` row. Teal and
 * navy only: sharing is a choice, not an alarm (L3). Nothing is kept in the browser (W3): a share started
 * earlier is read back from the row, and resumes sending only when the patient presses the button again.
 */

const S = HELP_COPY.share;

export interface LiveShare {
  share: ActiveShare | null;
  watching: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  start: (minutes: number) => void;
  resume: () => void;
  stop: () => void;
  send: () => void;
}

/** The browser's location once, which asks for permission (from a press only). */
function locate(): Promise<GeolocationPosition> {
  return new Promise((ok, fail) =>
    navigator.geolocation.getCurrentPosition(ok, fail, { maximumAge: 30_000, timeout: 20_000 }),
  );
}

const geoError = (e: unknown) =>
  (e as GeolocationPositionError | null)?.code === 1 ? S.denied : S.failed;

export function useLiveShare(initial: ActiveShare | null): LiveShare {
  const [share, setShare] = useState(initial);
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastWrite = useRef<number | null>(null);

  const quiet = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    lastWrite.current = null;
    setWatching(false);
  };
  useEffect(() => quiet, []);

  // The time is up: the link already shows nothing; close the row too, as the phone does.
  const endsAt = share?.endsAt;
  const shareId = share?.id;
  useEffect(() => {
    if (!endsAt || !shareId) return;
    const t = setTimeout(
      () => {
        quiet();
        setShare(null);
        void stopShareAction(shareId);
      },
      Math.max(0, new Date(endsAt).getTime() - Date.now()),
    );
    return () => clearTimeout(t);
  }, [endsAt, shareId]);

  const follow = (s: ActiveShare) => {
    quiet();
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const nowMs = Date.now();
        if (!shouldWrite(lastWrite.current, nowMs)) return;
        lastWrite.current = nowMs;
        const at = new Date(pos.timestamp || nowMs).toISOString();
        void sendFixAction({
          id: s.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          at,
        }).then((r) => {
          if (r.ok) setShare((cur) => (cur?.id === s.id ? { ...cur, lastSentAt: at } : cur));
        });
      },
      (e) => {
        if (e.code === 1) {
          quiet();
          setError(S.denied);
        }
      },
      { maximumAge: 10_000 },
    );
    setWatching(true);
  };

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await job();
    } catch (e) {
      setError(geoError(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    share,
    watching,
    busy,
    error,
    notice,
    start: (minutes) =>
      void run(async () => {
        if (!("geolocation" in navigator)) return setError(S.noGeo);
        await locate();
        const r = await startShareAction({ minutes, purpose: "emergency" });
        if (!r.ok) return setError(r.error);
        const next = { id: r.id, token: r.token, endsAt: r.endsAt, lastSentAt: null };
        setShare(next);
        follow(next);
      }),
    resume: () =>
      void run(async () => {
        if (!share) return;
        if (!("geolocation" in navigator)) return setError(S.noGeo);
        await locate();
        follow(share);
      }),
    stop: () =>
      void run(async () => {
        if (!share) return;
        const r = await stopShareAction(share.id);
        if (!r.ok) return setError(r.error);
        quiet();
        setShare(null);
      }),
    send: () =>
      void run(async () => {
        if (!share) return;
        const link = `${window.location.origin}/share/location/${share.token}`;
        const text = S.message(` until ${clockWords(new Date(share.endsAt))}`, link);
        if (navigator.share) {
          await navigator.share({ text }).catch(() => {});
          return;
        }
        await navigator.clipboard.writeText(text);
        setNotice(S.copied);
      }),
  };
}

/** Re-renders every 15 s, for the time left. */
function useNow15(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Messages({ live }: { live: LiveShare }) {
  return (
    <>
      {live.error ? <Note>{live.error}</Note> : null}
      {live.notice ? (
        <p role="status" className="text-[15px] font-semibold">
          {live.notice}
        </p>
      ) : null}
    </>
  );
}

/** While a share runs, on Help: when it ends, the time left, Send the link and Stop (active-banner.tsx). */
export function ShareBanner({ live }: { live: LiveShare }) {
  const now = useNow15();
  if (!live.share) return null;
  const ends = new Date(live.share.endsAt);
  return (
    <Band className="flex flex-col gap-3">
      <div aria-live="polite" className="flex items-center gap-3">
        <LocateFixedIcon className="text-pw-on-band-accent size-5 shrink-0" {...ICON} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-[22px] font-bold">{S.bannerTitle(clockWords(ends))}</p>
          <p className="text-pw-on-band-2 text-sm leading-5">
            {leftWords(ends, now)} · {PATIENT_WEB_COPY.keepOpenToShare}
          </p>
        </div>
      </div>
      {live.error ? <p className="text-[15px] font-semibold">{live.error}</p> : null}
      {live.notice ? (
        <p role="status" className="text-[15px] font-semibold">
          {live.notice}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {live.watching ? null : (
          <Button tone="accent" size="m" busy={live.busy} onClick={live.resume}>
            {S.resume}
          </Button>
        )}
        <Button tone="accent" size="m" onClick={live.send}>
          {S.send}
        </Button>
        <Button tone="glass" size="m" busy={live.busy} aria-label={S.stopLabel} onClick={live.stop}>
          {S.stopShort}
        </Button>
      </div>
    </Band>
  );
}

/** The centred dialog (W1) for the phone's ShareLocationSheet: before a share, how long and the consent words. */
export function ShareDialog({
  live,
  open,
  onOpenChange,
}: {
  live: LiveShare;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const now = useNow15();
  const [length, setLength] = useState<number>(60);
  const share = live.share;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={S.title}>
      <div className="flex flex-col gap-4">
        {share ? (
          <>
            <p aria-live="polite" className="text-[17px] leading-[25px]">
              {S.until(clockWords(new Date(share.endsAt)), leftWords(new Date(share.endsAt), now))}
            </p>
            <p className="text-pw-ink-2 text-[15px] leading-[21px]">
              {share.lastSentAt ? S.lastSent(clockWords(new Date(share.lastSentAt))) : S.waiting}
            </p>
            <Note tone="info">{PATIENT_WEB_COPY.keepOpenToShare}</Note>
            <Messages live={live} />
            <div className="flex flex-wrap gap-3">
              {live.watching ? null : (
                <Button tone="accent" busy={live.busy} onClick={live.resume}>
                  <LocateFixedIcon className="size-5" {...ICON} />
                  {S.resume}
                </Button>
              )}
              <Button tone="accent" onClick={live.send}>
                <SendIcon className="size-5" {...ICON} />
                {S.send}
              </Button>
              <Button tone="outline" busy={live.busy} onClick={live.stop}>
                {S.stop}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-pw-ink-2 text-[15px] font-semibold">{S.howLong}</p>
            <ChipRow label={S.howLong}>
              {S.lengths.map((l) => {
                const minutes = l.minutes ?? SHARE_MAX_MINUTES;
                return (
                  <Chip
                    key={l.label}
                    selected={length === minutes}
                    onClick={() => setLength(minutes)}
                  >
                    {l.label}
                  </Chip>
                );
              })}
            </ChipRow>
            <p className="text-[17px] leading-[25px]">{S.consent}</p>
            <Note tone="info">{PATIENT_WEB_COPY.keepOpenToShare}</Note>
            <Messages live={live} />
            <Button
              tone="accent"
              busy={live.busy}
              onClick={() => live.start(length)}
              className="self-start"
            >
              <LocateFixedIcon className="size-5" {...ICON} />
              {S.start}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
