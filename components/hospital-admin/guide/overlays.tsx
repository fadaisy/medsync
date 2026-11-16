"use client";

/**
 * The guide's two overlays (ADR 0522): the welcome and a walkthrough step (a box-shadow spotlight round the target,
 * the words beside, below or above it, and a curved arrow to its edge), and the demo's cursor and caption bar.
 * Presentational: the provider decides what shows. Motion is 400 ms on the system curve and none under
 * prefers-reduced-motion; the dim and the moving spotlight carry meaning (where to look next).
 */
import type { Cursor, DemoState, TourState } from "./guide-provider";
import type { Spot } from "@/lib/hospital-admin/guide/placement";
import { useEffect, useRef } from "react";

import { k } from "@/components/clinics-schedule/shared";
import desk from "@/components/reception/desk.module.css";
import { DEMOS, GUIDE, WALKS } from "@/content/hospital-admin/guide";
import { fill } from "@/content/lab-workspace-v2";
import {
  placeText,
  spotBox,
  TEXT_H,
  TEXT_W,
  textWidth,
  transitionFor,
} from "@/lib/hospital-admin/guide/placement";
import g from "./guide.module.css";

/** Keeps Tab inside the overlay: from the last control to the first, and back. */
function trapTab(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const all = [
    ...e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input"),
  ];
  if (!all.length) return;
  const first = all[0]!;
  const last = all[all.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function TourOverlay({
  welcome,
  tour,
  spot,
  reduced,
  hasDemo,
  onStart,
  onSkip,
  onNext,
  onBack,
  onPick,
  onWatch,
}: {
  welcome: boolean;
  tour: TourState | null;
  spot: Spot | null;
  reduced: boolean;
  hasDemo: boolean;
  onStart: () => void;
  onSkip: () => void;
  onNext: () => void;
  onBack: () => void;
  onPick: (i: number) => void;
  onWatch: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const stepKey = welcome ? "welcome" : tour ? `${tour.walk}:${tour.step}` : "";

  // Focus goes to the first action: Show me around, or Next.
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, [stepKey]);

  const W = welcome ? GUIDE.welcome : null;
  const walk = tour ? (WALKS.find((w) => w.key === tour.walk) ?? WALKS[0]!) : null;
  const st = walk && tour ? walk.steps[tour.step] : null;
  const n = walk?.steps.length ?? 0;

  const tw = spot ? textWidth(spot.W) : TEXT_W;
  const place = placeText(spot, tw, TEXT_H);
  const box = spot ? spotBox(spot) : null;
  const move = transitionFor(["left", "top", "width", "height"], reduced);
  const label = W ? W.label : (walk?.title ?? GUIDE.welcome.label);
  const last = !!tour && tour.step === n - 1;

  return (
    <div
      className={`${desk.tokens} ${g.ov}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={trapTab}
    >
      {W ? (
        <>
          <span className={g.dim} aria-hidden="true" />
          <div className={g.wel}>
            <span className={g.cap}>{W.cap}</span>
            <h2>{W.title}</h2>
            <p>{W.body}</p>
            <ol className={g.first}>
              {W.list.map(([b, s]) => (
                <li key={b}>
                  <b>{b}</b>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <div className={g.btns}>
              <button ref={first} type="button" className={k("btn", "k")} onClick={onStart}>
                {W.start}
              </button>
              <button type="button" className={`${k("btn")} ${g.ghost}`} onClick={onSkip}>
                {W.skip}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {tour && walk && st ? (
        <>
          {box ? (
            <span
              className={g.spot}
              aria-hidden="true"
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
                borderRadius: box.radius,
                transition: move,
              }}
            />
          ) : (
            <span className={g.dim} aria-hidden="true" />
          )}
          {place.arrow ? (
            <svg className={g.line} aria-hidden="true">
              <path d={place.arrow.d} />
              <path d={place.arrow.head} />
            </svg>
          ) : null}
          <div
            className={`${g.text} ${place.side === "mid" ? g.mid : ""} ${place.side === "card" ? g.card : ""}`}
            style={
              place.side === "mid"
                ? undefined
                : {
                    left: place.x,
                    top: place.y,
                    width: tw,
                    transition: transitionFor(["left", "top"], reduced),
                  }
            }
            aria-live="polite"
          >
            <span className={g.count}>
              {fill(GUIDE.tour.count, { walk: walk.title, n: tour.step + 1, m: n })}
            </span>
            <h2>{`${tour.step + 1}. ${st[2]}`}</h2>
            <p>{st[3]}</p>
            <div className={g.btns}>
              <button ref={first} type="button" className={k("btn", "k")} onClick={onNext}>
                {last
                  ? walk.key === "menu"
                    ? GUIDE.tour.startSetup
                    : GUIDE.tour.done
                  : GUIDE.tour.next}
              </button>
              {tour.step > 0 ? (
                <button type="button" className={`${k("btn")} ${g.ghost}`} onClick={onBack}>
                  {GUIDE.tour.back}
                </button>
              ) : null}
              {hasDemo ? (
                <button type="button" className={`${k("btn")} ${g.ghost}`} onClick={onWatch}>
                  {GUIDE.tour.watch}
                </button>
              ) : null}
              <button type="button" className={g.skip} onClick={onSkip}>
                {GUIDE.tour.skip}
              </button>
            </div>
            <div className={g.dots} role="group" aria-label={GUIDE.tour.dots}>
              {walk.steps.map((s, i) => (
                <button
                  key={`${s[0]}-${i}`}
                  type="button"
                  className={i === tour.step ? g.on : i < tour.step ? g.past : undefined}
                  aria-label={fill(GUIDE.tour.dot, { n: i + 1 })}
                  aria-current={i === tour.step ? "step" : undefined}
                  onClick={() => onPick(i)}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function DemoOverlay({
  demo,
  cursor,
  mid,
  reduced,
  onPause,
  onPlay,
  onReplay,
  onClose,
  onTry,
}: {
  demo: DemoState;
  cursor: Cursor | null;
  mid: boolean;
  reduced: boolean;
  onPause: () => void;
  onPlay: () => void;
  onReplay: () => void;
  onClose: () => void;
  onTry: () => void;
}) {
  const D = GUIDE.demo;
  const d = DEMOS.find((x) => x.key === demo.key) ?? DEMOS[0]!;
  const st = d.steps[demo.i] ?? d.steps[0]!;
  const cap = demo.done ? D.doneCap : st.cap;
  const shown = demo.done ? d.steps.length : demo.i + 1;
  const playing = !demo.paused && !demo.done;
  const ctl = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ctl.current?.focus({ preventScroll: true });
  }, [demo.done]);

  return (
    <div className={`${desk.tokens} ${g.demo}`}>
      {cursor && !demo.done ? (
        <span
          className={`${g.cur} ${cursor.click && !reduced ? g.click : ""}`}
          style={{
            left: cursor.x,
            top: cursor.y,
            transition: transitionFor(["left", "top"], reduced),
          }}
          aria-hidden="true"
        >
          <i />
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path d="M4 2.5l14.5 8.6-6.4 1.4 3.6 7-2.9 1.4-3.6-7L4 18z" />
          </svg>
        </span>
      ) : null}
      {mid && !demo.done ? (
        <div className={g.dmid} aria-hidden="true">
          {cap}
        </div>
      ) : null}
      <div
        className={g.bar}
        role="region"
        aria-label={fill(D.label, { title: d.title })}
        aria-live="polite"
      >
        <span className={g.badge}>{D.badge}</span>
        <div className={g.dtx}>
          <small>
            {d.title} ·{" "}
            {demo.done ? D.doneCount : fill(D.count, { n: demo.i + 1, m: d.steps.length })} ·{" "}
            {D.note}
          </small>
          <b>{cap}</b>
          <span className={g.prog} aria-hidden="true">
            <i
              style={{
                width: `${Math.round((shown / d.steps.length) * 100)}%`,
                transition: transitionFor(["width"], reduced),
              }}
            />
          </span>
        </div>
        <div className={g.ctl}>
          {playing ? (
            <button
              ref={ctl}
              type="button"
              className={`${k("btn", "sm")} ${g.lite}`}
              onClick={onPause}
            >
              {D.pause}
            </button>
          ) : null}
          {demo.paused && !demo.done ? (
            <button ref={ctl} type="button" className={k("btn", "sm", "k")} onClick={onPlay}>
              {D.play}
            </button>
          ) : null}
          {demo.done ? (
            <button ref={ctl} type="button" className={k("btn", "sm", "k")} onClick={onTry}>
              {D.tryIt}
            </button>
          ) : null}
          <button type="button" className={`${k("btn", "sm")} ${g.lite}`} onClick={onReplay}>
            {D.replay}
          </button>
          <button type="button" className={`${k("btn", "sm", "q")} ${g.lite}`} onClick={onClose}>
            {D.close}
          </button>
        </div>
      </div>
    </div>
  );
}
