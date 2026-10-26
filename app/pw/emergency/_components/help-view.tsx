"use client";

import type { LatLng } from "@/lib/emergency/nearest";
import type { PreAlertFacility } from "@/lib/emergency/queries";
import type { ActiveShare, MedicCard } from "@/lib/patient-web/help-data";
import type { SosEvent, SosState } from "@patient-core/help-sos";
import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { callClock, formatLatLng, sosIdle, sosNext } from "@patient-core/help-sos";
import {
  Building2Icon,
  CheckIcon,
  ChevronRightIcon,
  HeartIcon,
  LocateFixedIcon,
  MessageCircleIcon,
  PhoneIcon,
  ShieldIcon,
  UserRoundIcon,
} from "lucide-react";

import { CloseLink } from "@/app/emergency/_components/close-link";
import { telHref } from "@/app/emergency/_lib/client";
import { emergencyEventAction } from "@/app/emergency/actions";
import { Ring } from "@/components/tide/care-ring";
import { Chip, ChipRow } from "@/components/tide/controls";
import { ShareBanner, ShareDialog, useLiveShare } from "@/components/tide/help-share";
import { Band, Card, ICON, IconDisc, Note, Pill } from "@/components/tide/kit";
import { HELP_COPY } from "@/content/patient/help";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { orderFacilities } from "@/lib/emergency/nearest";
import { canDial } from "@/lib/patient-web/help-device";
import { cn } from "@/lib/utils";
import {
  EMERGENCY_NUMBERS,
  SOS_COUNTDOWN_S,
  SOS_DIAL,
  SYMPTOMS,
} from "@/mobile/src/features/safety/config";

/**
 * Help · SOS (the phone's app/help.tsx). Forced light by the layout (L11) and the one page without the Help
 * pill. SOS counts down 3 s with "Cancel, I'm okay"; nothing is dialled or sent until the count ends (S21,
 * `sosNext`). Then a phone opens `tel:`, and a computer shows the number large with the dial-from-a-phone line
 * (D-PW-03, S24). "We have told" ticks only what really happened. Signed out, nothing personal shows (S23).
 */

const C = HELP_COPY;
const noSubscribe = () => () => {};
type Key = (typeof SYMPTOMS)[number]["key"];

/** The phone's useSos, over the shared step function. */
function useSos(dialler: boolean | null) {
  const [s, setS] = useState(() => sosIdle(SOS_COUNTDOWN_S));
  const ref = useRef<SosState>(s);
  const [calledAt, setCalledAt] = useState<number | null>(null);
  const [dialled, setDialled] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const dial = () => {
    if (dialler) {
      window.location.href = telHref(SOS_DIAL);
      setCalledAt(Date.now());
    }
    setDialled(Boolean(dialler));
    // Audit (contact id only, no PHI), after the call is handed over: it never waits on the network.
    void emergencyEventAction({ event: "call_tapped", contact_id: "config:general" }).catch(
      () => {},
    );
  };

  const send = (e: SosEvent) => {
    const r = sosNext(ref.current, e, SOS_COUNTDOWN_S);
    ref.current = r.state;
    setS(r.state);
    if (r.state.phase !== "counting") stop();
    else if (!timer.current) timer.current = setInterval(() => send("tick"), 1000);
    if (e === "end") {
      setCalledAt(null);
      setDialled(null);
    }
    if (r.dial) dial();
  };
  return { ...s, calledAt, dialled, send };
}

/** Where the browser is, ONLY if location is already allowed (L9: Help never asks mid-emergency). */
function useGrantedLocation(): LatLng | null {
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    let off = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state !== "granted" || off) return;
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            !off && setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          () => {},
          { maximumAge: Infinity, timeout: 10_000 },
        );
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  return here;
}

function useClock(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export function HelpView({
  serverDial,
  medic,
  facilities,
  share,
}: {
  /** From the request's user agent; null when it sent none (the browser decides). */
  serverDial: boolean | null;
  /** Signed in as a patient: the medic card. Null signed out (S23). */
  medic: MedicCard | null;
  facilities: PreAlertFacility[];
  share: ActiveShare | null;
}) {
  // The server's answer; with none, the browser's own user agent (no mismatch on hydration).
  const dialler = useSyncExternalStore(
    noSubscribe,
    () => serverDial ?? canDial(navigator.userAgent),
    () => serverDial ?? false,
  );
  const sos = useSos(dialler);
  const now = useClock(sos.calledAt !== null);
  const here = useGrantedLocation();
  const live = useLiveShare(share);
  const [sharing, setSharing] = useState(false);
  const [syms, setSyms] = useState<Key[]>([]);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const signedIn = medic !== null;

  useEffect(() => {
    if (sos.phase === "counting") cancelRef.current?.focus();
  }, [sos.phase]);

  const toggle = (k: Key) => setSyms((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const reported = SYMPTOMS.filter((s) => syms.includes(s.key)).map((s) => s.label.toLowerCase());
  const nearest = orderFacilities(facilities, here, null)[0] ?? null;
  const callEvent = (contactId: string) =>
    void emergencyEventAction({ event: "call_tapped", contact_id: contactId }).catch(() => {});

  const hero =
    sos.phase === "idle" ? (
      <>
        <h1 className="text-center text-[28px] leading-8 font-semibold tracking-[-0.02em]">
          {C.sos.idleTitle}
        </h1>
        <button
          type="button"
          onClick={() => sos.send("start")}
          aria-label={C.sos.buttonLabel(SOS_DIAL, SOS_COUNTDOWN_S)}
          className={cn(
            "bg-pw-on-emergency text-pw-emergency-band shadow-pw-float grid size-[200px] place-items-center rounded-full",
            "transition-[scale] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none",
            "focus-visible:outline-pw-on-emergency focus-visible:outline-4 focus-visible:outline-offset-4",
          )}
        >
          <span className="flex flex-col items-center gap-1.5">
            <PhoneIcon className="size-[34px]" strokeWidth={2} aria-hidden />
            <span className="text-[22px] leading-none font-extrabold">{C.sos.button}</span>
            <span className="text-[13px] leading-4 font-medium">{C.sos.tapToCall(SOS_DIAL)}</span>
          </span>
        </button>
        <p className="text-pw-critical-tint max-w-[290px] text-center text-[15px] leading-[21px]">
          {C.sos.idleLine(SOS_DIAL, SOS_COUNTDOWN_S)}
        </p>
      </>
    ) : sos.phase === "counting" ? (
      <>
        <h1
          aria-live="assertive"
          className="text-center text-[28px] leading-8 font-semibold tracking-[-0.02em]"
        >
          {C.sos.counting(sos.secs)}
        </h1>
        <Ring
          value={sos.secs / SOS_COUNTDOWN_S}
          size={220}
          stroke={6}
          arc="stroke-pw-on-emergency"
          track="stroke-pw-band-glass"
        >
          <span className="bg-pw-on-emergency text-pw-emergency-band font-pw-mono grid size-[196px] place-items-center rounded-full text-[72px] leading-[80px] font-bold">
            {sos.secs}
          </span>
        </Ring>
        <button
          ref={cancelRef}
          type="button"
          onClick={() => sos.send("cancel")}
          className={cn(
            "border-pw-on-emergency bg-pw-band-glass min-h-[52px] rounded-full border-2 px-[30px] text-[17px] font-bold",
            "focus-visible:outline-pw-on-emergency focus-visible:outline-2 focus-visible:outline-offset-2",
          )}
        >
          {C.sos.cancel}
        </button>
      </>
    ) : (
      <>
        <Pill tone="glass">
          {sos.dialled ? (
            <span aria-hidden className="bg-pw-on-emergency size-2 rounded-full" />
          ) : null}
          {sos.dialled && sos.calledAt !== null
            ? C.sos.onCall(callClock(sos.calledAt, now))
            : C.sos.didNotStart}
        </Pill>
        <h1 className="text-center text-[30px] leading-[34px] font-semibold tracking-[-0.02em]">
          {C.sos.callingTitle}
        </h1>
        <p className="text-pw-critical-tint max-w-md text-center text-[17px] leading-[25px]">
          {C.sos.callingLine}
        </p>
        {dialler ? (
          <a
            href={telHref(SOS_DIAL)}
            onClick={() => callEvent("config:general")}
            className="inline-flex min-h-12 items-center text-[17px] font-semibold underline underline-offset-4"
          >
            {C.sos.callAgain(SOS_DIAL)}
          </a>
        ) : (
          <div className="flex flex-col items-center gap-1 text-center" data-desktop-call>
            <p className="text-pw-critical-tint text-[15px] font-semibold">{C.sos.dialThis}</p>
            <p className="font-pw-mono text-[64px] leading-[72px] font-bold tracking-[0.06em]">
              {SOS_DIAL}
            </p>
            <p className="max-w-md text-[17px] leading-[25px] font-semibold">
              {PATIENT_WEB_COPY.desktopCall.replace("{number}", SOS_DIAL)}
            </p>
          </div>
        )}
      </>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <section
        aria-label={C.sos.button}
        className="bg-pw-emergency-band text-pw-on-emergency rounded-pw-card flex flex-col items-center gap-[18px] rounded-b-[40px] px-5 pt-3 pb-8"
      >
        <div className="flex w-full items-center justify-between gap-3">
          <CloseLink className="-ml-2 inline-flex min-h-12 items-center px-2 text-[15px] font-semibold" />
          {here ? (
            <Pill tone="glass">
              <LocateFixedIcon className="size-3.5" {...ICON} />
              {C.sos.locationOn}
            </Pill>
          ) : null}
        </div>
        {hero}
      </section>

      <ShareBanner live={live} />

      {sos.phase === "calling" ? (
        <>
          <Card className="flex flex-col gap-3">
            <h2 className="text-[15px] font-bold">{C.told.title}</h2>
            <Told
              done={sos.dialled === true}
              text={C.told.line(
                SOS_DIAL,
                sos.dialled === true ? "started" : sos.dialled === false ? "failed" : "starting",
              )}
            />
            <Told
              done={false}
              text={C.told.location}
              sub={here ? C.told.readItOut(formatLatLng(here)) : undefined}
            />
            <Told done={false} text={C.told.careTeam} />
            <Told done={false} text={C.told.contact} />
          </Card>

          {medic || reported.length ? (
            <Band className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-pw-on-band-accent text-xs font-bold tracking-[0.08em] uppercase">
                  {C.medic.title}
                </p>
                {medic ? (
                  <p className="font-pw-mono text-pw-on-band-2 text-xs font-semibold">
                    {medic.number}
                  </p>
                ) : null}
              </div>
              {medic ? (
                <>
                  <p className="text-[19px] leading-6 font-bold">{medic.title}</p>
                  <p className="text-pw-on-band-2 text-[15px] leading-[21px] whitespace-pre-line">
                    {medic.lines.join("\n")}
                  </p>
                </>
              ) : null}
              {reported.length ? (
                <p className="text-[15px] leading-[21px] font-semibold">
                  {C.medic.reported(reported)}
                </p>
              ) : null}
            </Band>
          ) : null}

          <button
            type="button"
            onClick={() => sos.send("end")}
            className={cn(
              "bg-pw-surface border-pw-critical-tint text-pw-emergency-band min-h-[52px] rounded-full border-2 text-[17px] font-bold",
              "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
            )}
          >
            {C.sos.endEmergency}
          </button>
        </>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-bold">{C.what.title}</h2>
              <p className="text-pw-ink-3 text-[13px] font-medium">{C.what.hint}</p>
            </div>
            <ChipRow label={C.what.title}>
              {SYMPTOMS.map((s) => (
                <Chip key={s.key} selected={syms.includes(s.key)} onClick={() => toggle(s.key)}>
                  {s.label}
                </Chip>
              ))}
            </ChipRow>
            {syms.includes("sugar") ? <Note tone="info">{C.what.sugar}</Note> : null}
          </Card>

          <h2 className="text-pw-ink-3 px-1 text-[15px] font-semibold">{C.rows.title}</h2>
          <div className="flex flex-col gap-3">
            {signedIn ? (
              <Row
                icon={<MessageCircleIcon className="size-5" {...ICON} />}
                tint="accent"
                title={C.rows.message}
                sub={medic?.facility ?? C.rows.messageSub}
                href="/patient/care/messages"
              />
            ) : null}
            <Row
              icon={<UserRoundIcon className="size-5" {...ICON} />}
              tint="info"
              title={C.rows.contact}
              sub={signedIn ? C.rows.contactIn : C.rows.contactOut}
              href={signedIn ? "/patient/me" : undefined}
            />
            <Row
              icon={<Building2Icon className="size-5" {...ICON} />}
              tint="place"
              title={C.rows.nearest}
              sub={
                nearest
                  ? [
                      nearest.facility.name,
                      nearest.distanceKm !== null ? `${nearest.distanceKm} km` : null,
                      nearest.facility.emergencyPhone
                        ? dialler
                          ? null
                          : nearest.facility.emergencyPhone
                        : C.rows.noPhone,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : C.rows.nearestNone
              }
              tel={
                dialler && nearest?.facility.emergencyPhone
                  ? {
                      href: telHref(nearest.facility.emergencyPhone),
                      onClick: () => callEvent(`hospital:${nearest.facility.id}`),
                    }
                  : undefined
              }
            />
            {signedIn ? (
              <Row
                icon={<LocateFixedIcon className="size-5" {...ICON} />}
                tint="accent"
                title={C.rows.share}
                sub={C.rows.shareSub}
                onClick={() => setSharing(true)}
              />
            ) : null}
            <Row
              icon={<PhoneIcon className="size-5" {...ICON} />}
              tint="soft"
              title={C.rows.lines}
              sub={signedIn ? C.rows.linesIn : C.rows.linesOut}
              href="/emergency/lines"
            />
            {signedIn ? (
              <>
                <Row
                  icon={<HeartIcon className="size-5" {...ICON} />}
                  tint="info"
                  title={C.rows.crisis}
                  sub={C.rows.crisisSub}
                  href="/emergency/crisis"
                />
                <Row
                  icon={<ShieldIcon className="size-5" {...ICON} />}
                  tint="info"
                  title={C.rows.sv}
                  sub={C.rows.svSub}
                  href="/emergency/sexual-violence"
                />
              </>
            ) : null}
          </div>
          <p className="text-pw-ink-3 text-center text-xs leading-[17px]">
            {C.footnote(EMERGENCY_NUMBERS.general, EMERGENCY_NUMBERS.ambulance, SOS_DIAL)}
          </p>
        </>
      )}
      {signedIn ? <ShareDialog live={live} open={sharing} onOpenChange={setSharing} /> : null}
    </div>
  );
}

/** A line of "We have told": a ticked disc only for what really happened. */
function Told({ done, text, sub }: { done: boolean; text: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-px grid size-[22px] shrink-0 place-items-center rounded-full",
          done
            ? "bg-pw-accent-pressed text-pw-on-band"
            : "ring-pw-line-strong ring-[1.5px] ring-inset",
        )}
      >
        {done ? <CheckIcon className="size-3.5" strokeWidth={2.6} /> : null}
      </span>
      <div className="min-w-0">
        <p className={cn("text-[15px] font-semibold", done ? "text-pw-ink" : "text-pw-ink-2")}>
          {text}
        </p>
        {sub ? <p className="text-[15px] leading-[21px]">{sub}</p> : null}
      </div>
    </div>
  );
}

const TINT = {
  accent: "bg-pw-accent-tint text-pw-accent-text",
  info: "bg-pw-info-tint text-pw-info-text",
  place: "bg-pw-place-tint text-pw-place-text",
  soft: "bg-pw-surface-2 text-pw-ink",
} as const;

/** A "Not an emergency?" row: a link, a `tel:`, a button, or (with none) information only, without a chevron. */
function Row({
  icon,
  tint,
  title,
  sub,
  href,
  tel,
  onClick,
}: {
  icon: ReactNode;
  tint: keyof typeof TINT;
  title: string;
  sub: string;
  href?: string;
  tel?: { href: string; onClick: () => void };
  onClick?: () => void;
}) {
  const acts = Boolean(href || tel || onClick);
  const body = (
    <>
      <IconDisc className={TINT[tint]}>{icon}</IconDisc>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] leading-[22px] font-bold">{title}</span>
        <span className="text-pw-ink-2 text-sm leading-5 font-medium">{sub}</span>
      </span>
      {acts ? <ChevronRightIcon className="text-pw-ink-3 size-5 shrink-0" {...ICON} /> : null}
    </>
  );
  const cls = cn(
    "bg-pw-surface shadow-pw-card rounded-pw-card flex min-h-[72px] w-full items-center gap-3 px-5 py-3 text-left",
    acts &&
      "transition-[scale] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (tel)
    return (
      <a href={tel.href} onClick={tel.onClick} className={cls}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}
