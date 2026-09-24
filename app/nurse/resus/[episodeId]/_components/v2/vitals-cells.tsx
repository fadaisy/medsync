"use client";

import type { ClinicalDirection, VitalBand, VitalTrend } from "@/lib/resus/vital-trend";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { vitalTrendLabel } from "@/lib/resus/vital-trend";
import { cn } from "@/lib/utils";
import { VitalTrendGraph } from "./vitals-cells-graph";

export { VitalTrendGraph };

/**
 * The vitals cell, its trend arrow and its tap/hover trend graph — moved out of
 * the v1 desk (../resus-desk.tsx) so the v1 band and the v2 strip share ONE
 * implementation. Every class string that differs between them is a skin: v1
 * passes its own (unchanged, so it renders byte-identically); v2 uses V2_SKIN —
 * token type sizes only, amber for deteriorating, red only for a critical value
 * (Law 5).
 */

export type VitalTone = VitalBand;

export interface GraphPoints {
  t: string;
  value: number;
}

export interface VitalCellSkin {
  cellBase: string;
  /** Cell box colour from the band tone + the trend. */
  cellTone: (tone: VitalTone, trend: VitalTrend | null) => string;
  label: string;
  value: (tone: VitalTone) => string;
  /** Unit beside the value (v2); undefined → no unit (v1). */
  unit?: string;
  prev: string;
  arrowDir: Record<ClinicalDirection, string>;
  popover: string;
  graphNote: string;
  graphMeta: string;
  graphFooter: string;
  dangerLine: string;
  /** Captions on a critical cell's tint (v2): muted-foreground is < 4.5:1 there. */
  criticalCaption?: string;
}

const V2_BAND: Record<VitalTone, string> = {
  normal: "border-border bg-card text-foreground",
  borderline:
    "border-amber-300/80 bg-amber-50/70 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/25 dark:text-amber-100",
  abnormal:
    "border-amber-300/80 bg-amber-50/70 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/25 dark:text-amber-100",
  critical:
    "border-rose-600 bg-rose-50 text-rose-700 ring-1 ring-rose-500/40 dark:border-rose-500/70 dark:bg-rose-950/30 dark:text-rose-200",
  missing: "border-dashed border-border bg-transparent text-muted-foreground",
};

/**
 * v2: the band decides the colour (critical red, borderline / abnormal amber);
 * a value back in the normal band after being out of it gets a calm teal tint.
 * Direction alone never turns a cell red — the arrow carries it.
 */
export const V2_SKIN: VitalCellSkin = {
  cellBase: "flex min-h-19 min-w-24 flex-col justify-between gap-1 rounded-lg border px-2.5 py-1.5",
  cellTone: (tone, trend) =>
    // The teal ramp flips in .dark, so no dark: overrides.
    tone === "normal" && trend?.clinicalDirection === "improving"
      ? "border-teal-300/70 bg-teal-50/60 text-foreground"
      : V2_BAND[tone],
  label: "text-caption text-muted-foreground whitespace-nowrap",
  value: (tone) =>
    cn(
      "text-heading-m font-mono leading-none tabular-nums",
      tone === "critical" ? "font-bold" : "font-medium",
    ),
  unit: "text-caption text-muted-foreground",
  prev: "text-caption text-muted-foreground font-mono tabular-nums whitespace-nowrap",
  arrowDir: {
    improving: "text-teal-700",
    deteriorating: "text-amber-700 dark:text-amber-300",
    neutral: "text-muted-foreground",
  },
  popover:
    "border-border bg-popover text-popover-foreground shadow-popover z-50 w-56 rounded-xl border p-2",
  graphNote: "text-caption text-muted-foreground px-1 py-2 text-center",
  graphMeta: "text-caption text-muted-foreground font-mono",
  graphFooter:
    "text-caption text-muted-foreground flex items-center justify-between font-mono tabular-nums",
  dangerLine: "stroke-amber-500/60",
  // gray flips in .dark like muted-foreground: #525252 light, #a3a3a3 dark.
  criticalCaption: "text-gray-600",
};

const TREND_GLYPH: Record<"up" | "down" | "same", string> = { up: "↑", down: "↓", same: "→" };

/** The at-a-glance trend arrow — glyph = raw direction, colour = clinical
 *  meaning (improving/deteriorating/neutral). Never colour alone. */
export function TrendArrow({
  trend,
  decimals,
  skin = V2_SKIN,
}: {
  trend: VitalTrend;
  decimals?: number;
  skin?: VitalCellSkin;
}) {
  if (!trend.hasTrend || trend.rawDirection == null || trend.clinicalDirection == null) return null;
  const deltaText =
    trend.delta != null && trend.delta !== 0
      ? decimals != null
        ? Math.abs(trend.delta).toFixed(decimals)
        : Math.abs(trend.delta)
      : "";
  return (
    <span
      className={cn(
        "text-caption font-mono leading-none font-semibold",
        skin.arrowDir[trend.clinicalDirection],
      )}
      aria-hidden
    >
      {TREND_GLYPH[trend.rawDirection]}
      {deltaText}
    </span>
  );
}
/**
 * A vitals-strip cell — current + previous (secondary) + the clinically-coloured
 * trend arrow; on HOVER (desktop) or TAP (touch) it reveals the trend graph.
 *
 * v2 extras (all optional; v1 passes none): `display` replaces the value text
 * (BP "70/60"), `sub` replaces the "was …" line (null hides it), and `menu` adds
 * actions under the graph — the popover then opens on tap / Enter only and
 * closes on an outside tap; closing from inside it refocuses the cell.
 */
export function VitalCell({
  tile,
  value,
  tone,
  trend,
  points,
  secondary,
  decimals,
  skin = V2_SKIN,
  display,
  sub,
  menu,
  ariaLabel,
}: {
  tile: { key: string; label: string; unit: string };
  value: number | null | undefined;
  tone: VitalTone;
  trend: VitalTrend | null;
  points: GraphPoints[];
  secondary?: { label: string; points: GraphPoints[] } | null;
  /** Decimal places for fine-grained metrics (e.g. shock index → 2). */
  decimals?: number;
  skin?: VitalCellSkin;
  display?: string;
  sub?: string | null;
  menu?: (close: () => void) => ReactNode;
  ariaLabel?: string;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef(false);
  const leaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wasOpen = useRef(false);
  const [open, setOpen] = useState(false);
  // The popover is position:FIXED (anchored to the cell rect) so no ancestor's
  // overflow can clip it.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const hasMenu = menu != null;
  const canGraph = points.length >= 2 || (secondary?.points.length ?? 0) >= 2;
  const canOpen = canGraph || hasMenu;
  const fmt = (n: number) => (decimals != null ? n.toFixed(decimals) : String(n));
  const valueText = display ?? (value == null ? "—" : fmt(value));
  const prevText = trend?.hasTrend && trend.previous != null ? `was ${fmt(trend.previous)}` : null;
  const cap = tone === "critical" ? skin.criticalCaption : undefined;

  function show() {
    if (!canOpen) return;
    const r = cellRef.current?.getBoundingClientRect();
    if (r) {
      const width = 224; // w-56
      setPos({
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      });
    }
    setOpen(true);
  }
  const hide = () => setOpen(false);
  // A hover graph closes a beat after the pointer leaves the cell OR the graph,
  // so the pointer can cross onto it (WCAG 1.4.13).
  const cancelLeave = () => clearTimeout(leaveRef.current);
  const leave = () => {
    if (touchRef.current || hasMenu) return;
    cancelLeave();
    leaveRef.current = setTimeout(hide, 150);
  };

  // A menu popover that closed with focus inside it (Escape, Save, Cancel)
  // leaves focus on <body>: hand it back to the cell (R3).
  useEffect(() => {
    if (hasMenu && wasOpen.current && !open && document.activeElement === document.body)
      cellRef.current?.focus();
    wasOpen.current = open;
  }, [open, hasMenu]);

  // Close on Escape / scroll (a scroll leaves the fixed popover out of place).
  // With a menu, only a scroll of an ancestor of the cell closes it — a phone
  // keyboard scrolling the page must not close a half-typed reason.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => {
      const t = e.target;
      if (!hasMenu || (t instanceof Element && cellRef.current && t.contains(cellRef.current)))
        setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!cellRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    if (hasMenu) document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, hasMenu]);

  return (
    <div className="shrink-0">
      <div
        ref={cellRef}
        className={cn(skin.cellBase, skin.cellTone(tone, trend), canOpen && "cursor-pointer")}
        // "group" so the label (with its band word: critical, out of range) is
        // read on a cell that does not open (R4).
        role={canOpen ? "button" : "group"}
        tabIndex={canOpen ? 0 : undefined}
        aria-expanded={hasMenu ? open : undefined}
        aria-label={
          ariaLabel ??
          (trend ? vitalTrendLabel(tile.label, tile.unit, trend) : `${tile.label} not recorded`)
        }
        onTouchStart={() => {
          touchRef.current = true;
        }}
        onMouseEnter={() => {
          if (touchRef.current || hasMenu) return;
          cancelLeave();
          show();
        }}
        onMouseLeave={leave}
        onClick={() => (open ? hide() : show())}
        onKeyDown={(e) => {
          if (canOpen && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            if (open) hide();
            else show();
          }
        }}
      >
        <span className={cn(skin.label, cap)}>{tile.label}</span>
        <span className="flex items-baseline gap-1">
          <span className={skin.value(tone)}>{valueText}</span>
          {skin.unit && value != null && tile.unit ? (
            <span className={cn(skin.unit, cap)}>{tile.unit}</span>
          ) : null}
          {trend ? <TrendArrow trend={trend} decimals={decimals} skin={skin} /> : null}
        </span>
        {(sub === undefined ? prevText : sub) ? (
          <span className={cn(skin.prev, cap)}>{sub === undefined ? prevText : sub}</span>
        ) : null}
      </div>
      {canOpen && open && pos ? (
        <div
          ref={popRef}
          role={hasMenu ? "dialog" : undefined}
          aria-label={hasMenu ? `${tile.label} trend` : undefined}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className={skin.popover}
          onMouseEnter={cancelLeave}
          onMouseLeave={leave}
        >
          <VitalTrendGraph
            seriesKey={tile.key}
            label={tile.label}
            unit={tile.unit}
            points={points}
            secondary={secondary}
            skin={skin}
          />
          {menu?.(hide)}
        </div>
      ) : null}
    </div>
  );
}
