"use client";

import type { DragSource, DropTarget } from "@/lib/clerking/impression/relations";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Drag and drop on the Impression board (dx-relations-design §4), with no library: pointer events
 * for mouse, pen and touch (a long-press of 500 ms lifts on touch; the grip has touch-action none
 * so the page still scrolls everywhere else), and the WAI-ARIA keyboard pattern on the same grip
 * (Space lifts, the arrow keys move between targets, Enter drops, Escape cancels). A lifted card
 * follows the pointer with a transform and no transition (nothing decorative); the target under it
 * says in words what a drop would do. Drop targets carry `data-drop` (see `dropKey`).
 */

export const dropKey = (t: DropTarget) => ("id" in t ? `${t.kind}:${t.id}` : t.kind);
const parseKey = (k: string): DropTarget => {
  const [kind, id] = k.split(/:(.*)/s) as [string, string | undefined];
  return id ? ({ kind, id } as DropTarget) : ({ kind } as DropTarget);
};
export const sameTarget = (a: DropTarget | null, b: DropTarget) => !!a && dropKey(a) === dropKey(b);

const LONG_PRESS_MS = 500;
const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;

export interface BoardDrag {
  /** The card being moved, and the target it is over. */
  src: DragSource | null;
  over: DropTarget | null;
  /** Props for a card's grip button. */
  grip: (
    src: DragSource,
    name: string,
  ) => {
    "data-grip": string;
    "aria-label": string;
    "aria-roledescription": string;
    "aria-describedby": string;
    "aria-pressed": boolean;
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  };
  /** Props for a drop target. */
  target: (t: DropTarget) => { "data-drop": string; "data-over"?: "true" };
}

export function useBoardDrag(o: {
  enabled: boolean;
  helpId: string;
  /** The keyboard's targets for a source, in board order. */
  targets: (src: DragSource) => DropTarget[];
  /** What dropping here would do, in words ("Drop to link under Malaria, severe"). */
  describe: (src: DragSource, t: DropTarget) => string;
  onDrop: (src: DragSource, t: DropTarget) => void;
  announce: (words: string) => void;
}): BoardDrag {
  const [src, setSrc] = useState<DragSource | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  const opts = useRef(o);
  useEffect(() => {
    opts.current = o;
  });
  const live = useRef<{ src: DragSource; over: DropTarget | null } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const lift = (s: DragSource, first: DropTarget | null) => {
    live.current = { src: s, over: first };
    setSrc(s);
    setOver(first);
  };
  const end = () => {
    live.current = null;
    setSrc(null);
    setOver(null);
  };
  const point = (t: DropTarget | null) => {
    if (!live.current) return;
    live.current.over = t;
    setOver(t);
  };

  const onPointerDown = (s: DragSource) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!opts.current.enabled || e.button !== 0 || live.current) return;
    const card = (e.currentTarget.closest("[data-card]") as HTMLElement | null) ?? e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const touch = e.pointerType === "touch";
    let lifted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const up = () => {
      card.style.transform = "";
      card.style.pointerEvents = "";
      card.removeAttribute("data-dragging");
    };
    const go = () => {
      lifted = true;
      card.setAttribute("data-dragging", "true");
      card.style.pointerEvents = "none";
      lift(s, null);
      opts.current.announce("Lifted. Move over a diagnosis and let go to link it; Escape cancels.");
    };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!lifted) {
        if (Math.hypot(dx, dy) > (touch ? TOUCH_SLOP : MOUSE_SLOP)) {
          if (touch) return finish();
          go();
        } else return;
      }
      ev.preventDefault();
      card.style.transform = `translate(${dx}px, ${dy}px)`;
      const el = document.elementFromPoint?.(ev.clientX, ev.clientY);
      const k = (el?.closest("[data-drop]") as HTMLElement | null)?.dataset.drop;
      point(k ? parseKey(k) : null);
    };
    const release = () => {
      const at = live.current;
      finish();
      if (lifted && at) {
        if (at.over) opts.current.onDrop(at.src, at.over);
        else opts.current.announce("Move cancelled.");
      }
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !lifted) return;
      ev.preventDefault();
      finish();
      opts.current.announce("Move cancelled.");
    };
    function finish() {
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", key, true);
      stop.current = null;
      up();
      if (lifted) end();
    }
    if (touch) timer = setTimeout(go, LONG_PRESS_MS);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", key, true);
    stop.current = finish;
  };

  const onKeyDown = (s: DragSource, name: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!opts.current.enabled) return;
    const cur = live.current;
    const say = (t: DropTarget | null) =>
      opts.current.announce(t ? opts.current.describe(s, t) : "No place to drop it.");
    if (!cur) {
      if (e.key !== " ") return;
      e.preventDefault();
      const ts = opts.current.targets(s);
      lift(s, ts[0] ?? null);
      opts.current.announce(
        `${name} lifted. Arrow keys choose where to drop it, Enter drops, Escape cancels.`,
      );
      say(ts[0] ?? null);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      end();
      opts.current.announce("Move cancelled.");
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      end();
      if (cur.over) opts.current.onDrop(cur.src, cur.over);
      else opts.current.announce("Move cancelled.");
    } else if (/^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      e.preventDefault();
      const ts = opts.current.targets(s);
      if (!ts.length) return say(null);
      const i = cur.over ? ts.findIndex((t) => sameTarget(cur.over, t)) : -1;
      const step = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
      const next = ts[(i + step + ts.length) % ts.length]!;
      point(next);
      say(next);
    }
  };

  return {
    src,
    over,
    grip: (s, name) => ({
      "data-grip": dropKey(s),
      "aria-label": `Move ${name}`,
      "aria-roledescription": "draggable",
      "aria-describedby": o.helpId,
      "aria-pressed": !!src && dropKey(src) === dropKey(s),
      onPointerDown: onPointerDown(s),
      onKeyDown: onKeyDown(s, name),
    }),
    target: (t) => ({
      "data-drop": dropKey(t),
      ...(sameTarget(over, t) ? { "data-over": "true" as const } : {}),
    }),
  };
}
