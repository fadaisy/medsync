"use client";

import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZoomInIcon, ZoomOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clampZoom,
  fitSize,
  wheelZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomStep,
  zoomWord,
} from "@/lib/wards/zoom";

type At = { clientX: number; clientY: number };

export interface PlanZoom {
  zoom: number;
  /** In (1), out (-1), or the whole floor (0), about the middle of the view. */
  step: (dir: 1 | -1 | 0) => void;
  /** A wheel or pinch delta, about the pointer. */
  zoomBy: (deltaY: number, at: At) => void;
  /** Scroll the view by whole steps (the arrows with nothing selected). */
  pan: (dx: number, dy: number) => void;
  frameRef: RefObject<HTMLDivElement | null>;
  boxRef: RefObject<HTMLDivElement | null>;
}

const PAN_PX = 80;

/**
 * The zoom of one floor plan. Whatever changes the zoom, the point under the pointer (or the middle
 * of the view, for the buttons and keys) stays where it was: the frame scrolls to hold it.
 */
export function usePlanZoom(): PlanZoom {
  const frameRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  const zoomTo = useCallback((next: (z: number) => number, at?: At) => {
    const frame = frameRef.current;
    const box = boxRef.current;
    if (frame && box) {
      const f = frame.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const x = at?.clientX ?? f.left + f.width / 2;
      const y = at?.clientY ?? f.top + f.height / 2;
      anchor.current = {
        fx: b.width ? (x - b.left) / b.width : 0.5,
        fy: b.height ? (y - b.top) / b.height : 0.5,
        x,
        y,
      };
    }
    setZoom((z) => clampZoom(next(z)));
  }, []);

  useLayoutEffect(() => {
    const a = anchor.current;
    const frame = frameRef.current;
    const box = boxRef.current;
    anchor.current = null;
    if (!a || !frame || !box) return;
    const b = box.getBoundingClientRect();
    frame.scrollLeft += b.left + a.fx * b.width - a.x;
    frame.scrollTop += b.top + a.fy * b.height - a.y;
  }, [zoom]);

  const step = useCallback(
    (dir: 1 | -1 | 0) => zoomTo((z) => (dir === 0 ? ZOOM_MIN : zoomStep(z, dir))),
    [zoomTo],
  );
  const zoomBy = useCallback(
    (deltaY: number, at: At) => zoomTo((z) => wheelZoom(z, deltaY), at),
    [zoomTo],
  );
  const pan = useCallback((dx: number, dy: number) => {
    frameRef.current?.scrollBy({ left: dx * PAN_PX, top: dy * PAN_PX });
  }, []);

  return { zoom, step, zoomBy, pan, frameRef, boxRef };
}

/**
 * The plan's frame: at 100 % the whole floor fits; zoomed in, the plan grows past the frame and the
 * frame scrolls (a trackpad or wheel pans it). Ctrl or Cmd with the wheel, or a pinch, zooms about the
 * pointer; the page's own zoom is left alone everywhere else. The controls (`PlanZoomControls`) sit
 * in the page's toolbar, never over the plan.
 */
export function PlanZoomFrame({
  z,
  aspect,
  className,
  children,
}: {
  z: PlanZoom;
  /** The plan's width over its height. */
  aspect: number;
  className?: string;
  children: ReactNode;
}) {
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const { zoom, zoomBy, frameRef, boxRef } = z;
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomBy(e.deltaY, e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(([entry]) => {
            const r = entry!.contentRect;
            setFrame({ w: r.width, h: r.height });
          });
    ro?.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      ro?.disconnect();
    };
  }, [frameRef, zoomBy]);

  const fit = fitSize(frame, aspect);
  const box = fit.w ? { width: fit.w * zoom, height: fit.h * zoom } : null;

  return (
    <div className={cn("relative min-h-0", className)}>
      <div ref={frameRef} className="absolute inset-0 overflow-auto overscroll-contain">
        <div
          className="flex min-h-full min-w-full items-center justify-center"
          style={box ?? { width: "100%", height: "100%" }}
        >
          <div
            ref={boxRef}
            className={cn("shrink-0", !box && "h-full w-full")}
            style={box ?? undefined}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** −, the zoom, +, Fit. `keysHint` names the plan's keys (the editor's plan takes + - 0). */
export function PlanZoomControls({
  z,
  keysHint = false,
  wheelHint,
}: {
  z: PlanZoom;
  keysHint?: boolean;
  /** "Ctrl + scroll" or "⌘ + scroll", for the titles. */
  wheelHint?: string;
}) {
  const { zoom, step } = z;
  const also = wheelHint ? `, or ${wheelHint}` : "";
  return (
    <div
      role="group"
      aria-label="Zoom"
      className="bg-ink-100 flex items-center gap-0.5 rounded-md p-0.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        aria-label="Zoom out"
        title={`Zoom out${keysHint ? " (−)" : ""}${also}`}
        disabled={zoom <= ZOOM_MIN}
        onClick={() => step(-1)}
      >
        <ZoomOutIcon aria-hidden />
      </Button>
      <span
        className="text-caption text-ink-600 w-10 text-center font-mono font-normal tabular-nums"
        aria-live="polite"
      >
        {zoomWord(zoom)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        aria-label="Zoom in"
        title={`Zoom in${keysHint ? " (+)" : ""}${also}`}
        disabled={zoom >= ZOOM_MAX}
        onClick={() => step(1)}
      >
        <ZoomInIcon aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-[26px] px-2"
        title={`Show the whole floor${keysHint ? " (0)" : ""}`}
        disabled={zoom <= ZOOM_MIN}
        onClick={() => step(0)}
      >
        Fit
      </Button>
    </div>
  );
}
