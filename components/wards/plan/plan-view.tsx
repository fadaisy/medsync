"use client";

import type { ItemRef } from "@/lib/wards/editor";
import type {
  BedState,
  LayoutBed,
  LayoutDivider,
  LayoutDoor,
  LayoutFixture,
  LayoutRoom,
  Rect,
  WardLayout,
} from "@/supabase/functions/_shared/ward-layout";
import type { PointerEvent, Ref } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";
import {
  bedRect,
  bedSize,
  bedStateMeta,
  DOOR_CELLS,
  fixtureRect,
  headSideOf,
  PLAN_GLYPH_CODES,
  serviceByCode,
} from "@/supabase/functions/_shared/ward-layout";

/** SVG units per grid cell (0.5 m). The plan scales with its viewBox, so text sizes are in these units. */
export const CELL = 20;

export type Lens = "none" | "o2" | "suction" | "monitor" | "out";

export interface PlanGhost {
  rects: Rect[];
  /** Which way the heads of ghost beds face, when the ghost is a row of beds. */
  face?: "top" | "right" | "bottom" | "left";
  line?: { x1: number; y1: number; x2: number; y2: number } | null;
  point?: { x: number; y: number } | null;
}

export interface PlanViewProps {
  doc: WardLayout;
  mode: "build" | "live";
  /** The accessible name of the plan. */
  label: string;
  grid?: boolean;
  lens?: Lens;
  selected?: ItemRef | null;
  /** Live mode: each bed's state, by bed key. */
  states?: Record<string, BedState>;
  ghost?: PlanGhost | null;
  /** Build mode: show the resize handle on a selected room and the end handles on a selected divider. */
  handles?: boolean;
  /** Placing with a palette tool: a crosshair, and items don't look draggable. */
  placing?: boolean;
  svgRef?: Ref<SVGSVGElement>;
  onPointerDown?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerLeave?: (e: PointerEvent<SVGSVGElement>) => void;
  className?: string;
}

const refKey = (r: ItemRef) => `${r.kind}:${r.key}`;

/**
 * The ward's floor plan, drawn once for both modes (ADRs 0191, 0194). Pure: everything comes in as
 * props; pointer handling belongs to the caller, which reads `data-ref` and `data-handle` from the
 * event target. Colour never carries state alone: every bed on the live board shows its state word.
 */
export function PlanView({
  doc,
  mode,
  label,
  grid = true,
  lens = "none",
  selected = null,
  states,
  ghost,
  handles = false,
  placing = false,
  svgRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  className,
}: PlanViewProps) {
  const uid = useId().replace(/:/g, "");
  const W = doc.floor.w * CELL;
  const H = doc.floor.h * CELL;
  const live = mode === "live";
  const lensOn = !live && lens !== "none";
  const isSel = (r: ItemRef) => !!selected && refKey(selected) === refKey(r);
  const hatch = `ward-hatch-${uid}`;
  const gridId = `ward-grid-${uid}`;
  const interactive = !live && !placing;

  return (
    <svg
      ref={svgRef}
      role="group"
      aria-label={label}
      viewBox={`-6 -6 ${W + 12} ${H + 12}`}
      className={cn(
        "block h-auto w-full touch-none select-none",
        placing && "cursor-crosshair",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <defs>
        <pattern
          id={hatch}
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" className="fill-card" />
          <line x1="0" y1="0" x2="0" y2="8" className="stroke-ink-200" strokeWidth="5" />
        </pattern>
        <pattern id={gridId} patternUnits="userSpaceOnUse" width={CELL} height={CELL}>
          <path
            d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
            fill="none"
            className="stroke-ink-100"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect x="0" y="0" width={W} height={H} className="fill-card stroke-border" strokeWidth="1" />
      {grid ? (
        <rect x="0" y="0" width={W} height={H} fill={`url(#${gridId})`} pointerEvents="none" />
      ) : null}

      {doc.rooms.map((r) => (
        <RoomShape
          key={r.key}
          r={r}
          selected={isSel({ kind: "room", key: r.key })}
          dim={lensOn}
          interactive={interactive}
        />
      ))}
      {doc.fixtures.map((f) => (
        <FixtureShape
          key={f.key}
          f={f}
          selected={isSel({ kind: "fixture", key: f.key })}
          dim={lensOn || live}
          interactive={interactive}
        />
      ))}
      {doc.dividers.map((l) => (
        <DividerShape
          key={l.key}
          l={l}
          selected={isSel({ kind: "divider", key: l.key })}
          interactive={interactive}
        />
      ))}
      {doc.doors.map((o) => (
        <DoorShape
          key={o.key}
          o={o}
          floor={doc.floor}
          selected={isSel({ kind: "door", key: o.key })}
          interactive={interactive}
        />
      ))}
      {doc.beds.map((b) => (
        <BedShape
          key={b.key}
          b={b}
          hatch={hatch}
          live={live}
          state={states?.[b.key]}
          lens={lens}
          selected={isSel({ kind: "bed", key: b.key })}
          interactive={interactive || live}
        />
      ))}

      {ghost ? <Ghost ghost={ghost} /> : null}
      {handles && selected ? <Handles doc={doc} selected={selected} /> : null}
    </svg>
  );
}

/* ─── rooms ─────────────────────────────────────────────────────────── */

function RoomShape({
  r,
  selected,
  dim,
  interactive,
}: {
  r: LayoutRoom;
  selected: boolean;
  dim: boolean;
  interactive: boolean;
}) {
  const x = r.x * CELL;
  const y = r.y * CELL;
  const w = r.w * CELL;
  const h = r.h * CELL;
  const bay = r.kind === "bay";
  const gap = DOOR_CELLS * CELL;
  const door =
    r.door === "top"
      ? { x: x + CELL, y: y - 4, w: gap, h: 8 }
      : r.door === "bottom"
        ? { x: x + CELL, y: y + h - 4, w: gap, h: 8 }
        : r.door === "left"
          ? { x: x - 4, y: y + CELL, w: 8, h: gap }
          : { x: x + w - 4, y: y + CELL, w: 8, h: gap };
  // The kind after the name, unless the name already says it ("Isolation 4", "Private 1").
  const kindName =
    r.kind === "isolation" ? "isolation" : r.kind === "side" ? "side room" : "private";
  const kindWord =
    r.kind === "bay" || r.name.toLowerCase().includes(kindName.split(" ")[0]!)
      ? ""
      : ` · ${kindName}`;
  return (
    <g
      data-ref={`room:${r.key}`}
      className={cn(interactive && "cursor-move", dim && "opacity-60")}
      aria-label={`${r.name}${kindWord}`}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        className={cn(bay ? "stroke-ink-500 fill-transparent" : "fill-ink-50 stroke-ink-700")}
        strokeWidth={bay ? 2 : 5}
        strokeDasharray={bay ? "8 5" : undefined}
      />
      {r.kind === "isolation" ? (
        <rect
          x={x + 7}
          y={y + 7}
          width={Math.max(0, w - 14)}
          height={Math.max(0, h - 14)}
          fill="none"
          className="stroke-ink-700"
          strokeWidth="1.5"
        />
      ) : null}
      {!bay ? <rect {...door} width={door.w} height={door.h} className="fill-card" /> : null}
      <text
        x={x + 10}
        y={r.door === "top" ? y + h - 10 : y + 20}
        className="fill-ink-600"
        fontSize="11"
        fontWeight="600"
        pointerEvents="none"
      >
        {r.name}
        {kindWord}
      </text>
      {selected ? (
        <rect
          x={x - 4}
          y={y - 4}
          width={w + 8}
          height={h + 8}
          fill="none"
          className="stroke-teal-600"
          strokeWidth="2.5"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

/* ─── fixtures ──────────────────────────────────────────────────────── */

/** The fixture's words, trimmed to what fits (the label is the admin's; the plan shows it short). */
export function planFixtureLabel(f: LayoutFixture): string {
  if (f.kind === "sink") return "HW";
  if (f.kind === "resus_trolley" && f.label === "Resus trolley") return "Resus";
  const r = fixtureRect(f);
  const fits = Math.max(2, Math.floor((r.w * CELL - 6) / 6));
  return f.label.length > fits ? `${f.label.slice(0, fits - 1)}…` : f.label;
}

function FixtureShape({
  f,
  selected,
  dim,
  interactive,
}: {
  f: LayoutFixture;
  selected: boolean;
  dim: boolean;
  interactive: boolean;
}) {
  const r = fixtureRect(f);
  const x = r.x * CELL;
  const y = r.y * CELL;
  const w = r.w * CELL;
  const h = r.h * CELL;
  const sink = f.kind === "sink";
  return (
    <g
      data-ref={`fixture:${f.key}`}
      className={cn(interactive && "cursor-move", dim && "opacity-60")}
      aria-label={f.label}
    >
      {sink ? (
        <circle
          cx={x + w / 2}
          cy={y + h / 2}
          r={w / 2 - 1}
          className="fill-ink-100 stroke-ink-400"
          strokeWidth="1"
        />
      ) : (
        <rect
          x={x + 1}
          y={y + 1}
          width={w - 2}
          height={h - 2}
          rx="4"
          className="fill-ink-100 stroke-ink-300"
          strokeWidth="1"
        />
      )}
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ink-700"
        fontSize={sink ? 7 : 10}
        fontWeight="500"
        pointerEvents="none"
      >
        {planFixtureLabel(f)}
      </text>
      {selected ? (
        <rect
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          rx="5"
          fill="none"
          className="stroke-teal-600"
          strokeWidth="2.5"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

/* ─── dividers and doors ────────────────────────────────────────────── */

function DividerShape({
  l,
  selected,
  interactive,
}: {
  l: LayoutDivider;
  selected: boolean;
  interactive: boolean;
}) {
  const across = l.y1 === l.y2;
  const x1 = Math.min(l.x1, l.x2) * CELL;
  const x2 = Math.max(l.x1, l.x2) * CELL;
  const y1 = Math.min(l.y1, l.y2) * CELL;
  const y2 = Math.max(l.y1, l.y2) * CELL;
  const band = (t: number, extend: number, cls: string, extra?: object) =>
    across ? (
      <rect
        x={x1 - extend}
        y={y1 - t / 2}
        width={x2 - x1 + 2 * extend}
        height={t}
        className={cls}
        {...extra}
      />
    ) : (
      <rect
        x={x1 - t / 2}
        y={y1 - extend}
        width={t}
        height={y2 - y1 + 2 * extend}
        className={cls}
        {...extra}
      />
    );
  let body;
  if (l.kind === "wall") body = band(6, 3, "fill-ink-700");
  else if (l.kind === "window")
    body = band(6, 0, "fill-ink-100 stroke-ink-700", { strokeWidth: 1.5 });
  else if (l.kind === "glass")
    body = (
      <>
        {band(5, 0, "fill-ink-50")}
        <line
          x1={across ? x1 : x1 - 2.5}
          y1={across ? y1 - 2.5 : y1}
          x2={across ? x2 : x1 - 2.5}
          y2={across ? y1 - 2.5 : y2}
          className="stroke-ink-500"
          strokeWidth="1.5"
        />
        <line
          x1={across ? x1 : x1 + 2.5}
          y1={across ? y1 + 2.5 : y1}
          x2={across ? x2 : x1 + 2.5}
          y2={across ? y1 + 2.5 : y2}
          className="stroke-ink-500"
          strokeWidth="1.5"
        />
      </>
    );
  else
    body = (
      <line
        x1={x1}
        y1={y1}
        x2={across ? x2 : x1}
        y2={across ? y1 : y2}
        className="stroke-ink-500"
        strokeWidth="3"
        strokeDasharray="7 5"
      />
    );
  return (
    <g
      data-ref={`divider:${l.key}`}
      className={cn(interactive && "cursor-move")}
      aria-label={l.kind}
    >
      {selected ? band(14, 4, "fill-teal-tint", { pointerEvents: "none" }) : null}
      {body}
      {/* A wide, invisible hit line: dividers are thin to see but easy to take hold of. */}
      <line
        x1={x1}
        y1={y1}
        x2={across ? x2 : x1}
        y2={across ? y1 : y2}
        stroke="transparent"
        strokeWidth="14"
        pointerEvents="stroke"
      />
    </g>
  );
}

function DoorShape({
  o,
  floor,
  selected,
  interactive,
}: {
  o: LayoutDoor;
  floor: { w: number; h: number };
  selected: boolean;
  interactive: boolean;
}) {
  const L = DOOR_CELLS * CELL;
  const x = o.x * CELL;
  const y = o.y * CELL;
  // The leaf opens into the floor, away from the nearer edge.
  const s = o.orient === "h" ? (o.y < floor.h / 2 ? 1 : -1) : o.x < floor.w / 2 ? 1 : -1;
  const across = o.orient === "h";
  const leafEnd = across ? { x, y: y + s * L } : { x: x + s * L, y };
  const openEnd = across ? { x: x + L, y } : { x, y: y + L };
  const sweep = across ? (s === 1 ? 0 : 1) : s === 1 ? 1 : 0;
  const box = across
    ? { x, y: Math.min(y, y + s * L), w: L, h: L }
    : { x: Math.min(x, x + s * L), y, w: L, h: L };
  return (
    <g data-ref={`door:${o.key}`} className={cn(interactive && "cursor-move")} aria-label="Door">
      {selected ? (
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="4" className="fill-teal-tint" />
      ) : null}
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" />
      {across ? (
        <rect x={x} y={y - 4} width={L} height={8} className="fill-card" />
      ) : (
        <rect x={x - 4} y={y} width={8} height={L} className="fill-card" />
      )}
      <line
        x1={x}
        y1={y}
        x2={leafEnd.x}
        y2={leafEnd.y}
        className="stroke-ink-700"
        strokeWidth="2"
      />
      <path
        d={`M ${leafEnd.x} ${leafEnd.y} A ${L} ${L} 0 0 ${sweep} ${openEnd.x} ${openEnd.y}`}
        fill="none"
        className="stroke-ink-400"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
    </g>
  );
}

/* ─── beds ──────────────────────────────────────────────────────────── */

/** Live-state paint (ADR 0194 §5). Never colour alone: the word is always drawn on the bed. */
const STATE_PAINT: Record<
  BedState,
  { fill: string; stroke: string; text: string; dashed?: boolean }
> = {
  occupied: { fill: "fill-teal-tint", stroke: "stroke-teal-700", text: "fill-teal-text" },
  free: { fill: "fill-card", stroke: "stroke-ink-700", text: "fill-foreground" },
  cleaning: { fill: "fill-sky-tint", stroke: "stroke-sky-icon", text: "fill-sky-text" },
  reserved: { fill: "fill-ink-100", stroke: "stroke-ink-600", text: "fill-ink-700", dashed: true },
  out: { fill: "", stroke: "stroke-ink-400", text: "fill-ink-700" },
};

function BedShape({
  b,
  hatch,
  live,
  state,
  lens,
  selected,
  interactive,
}: {
  b: LayoutBed;
  hatch: string;
  live: boolean;
  state?: BedState;
  lens: Lens;
  selected: boolean;
  interactive: boolean;
}) {
  const r = bedRect(b);
  const x = r.x * CELL;
  const y = r.y * CELL;
  const w = r.w * CELL;
  const h = r.h * CELL;
  const head = headSideOf(b.rot);
  const out = b.status === "out";
  const lensOn = !live && lens !== "none";
  const lit = lensOn && (lens === "out" ? out : b.services.includes(lens));
  const paint = live && state ? STATE_PAINT[state] : null;
  const hs = 7;
  const headBand =
    head === "top"
      ? { x, y, width: w, height: hs }
      : head === "bottom"
        ? { x, y: y + h - hs, width: w, height: hs }
        : head === "left"
          ? { x, y, width: hs, height: h }
          : { x: x + w - hs, y, width: hs, height: h };
  const pillow =
    head === "top"
      ? { x: x + 5, y: y + 10, width: w - 10, height: 9 }
      : head === "bottom"
        ? { x: x + 5, y: y + h - 19, width: w - 10, height: 9 }
        : head === "left"
          ? { x: x + 10, y: y + 5, width: 9, height: h - 10 }
          : { x: x + w - 19, y: y + 5, width: 9, height: h - 10 };
  // Words sit at the foot end (the far side from the head).
  const footY = head === "bottom" ? y + 13 : head === "top" ? y + h - 7 : y + h - 7;
  const glyphs = PLAN_GLYPH_CODES.filter((c) => b.services.includes(c))
    .map((c) => serviceByCode(c)!.glyph)
    .join(" ");
  const fillClass = live
    ? state === "out"
      ? ""
      : paint!.fill
    : out
      ? ""
      : lit
        ? "fill-teal-tint"
        : b.type === "icu"
          ? "fill-ink-50"
          : "fill-card";
  const hatched = (live && state === "out") || (!live && out);
  const strokeClass = live ? paint!.stroke : lit ? "stroke-teal-700" : "stroke-ink-700";
  const dashed = (live && paint?.dashed) || b.type === "couch";
  const word = live && state ? bedStateMeta(state).short : null;
  const typeLabel = bedSize(b.type).label;
  return (
    <g
      data-ref={`bed:${b.key}`}
      className={cn(
        interactive && (live ? "cursor-pointer" : "cursor-move"),
        lensOn && !lit && "opacity-45",
      )}
      aria-label={`Bed ${b.label}, ${typeLabel}${word ? `, ${bedStateMeta(state!).label}` : out ? ", out of service" : ""}`}
    >
      <rect
        x={x + 0.75}
        y={y + 0.75}
        width={w - 1.5}
        height={h - 1.5}
        rx={b.type === "cot" ? 8 : 3}
        className={cn(fillClass, strokeClass)}
        fill={hatched ? `url(#${hatch})` : undefined}
        strokeWidth={lit ? 2.5 : 1.5}
        strokeDasharray={dashed ? "5 3" : undefined}
      />
      <rect {...headBand} className="fill-ink-700" pointerEvents="none" />
      <rect {...pillow} rx="3" className="fill-ink-200" pointerEvents="none" />
      <text
        x={x + w / 2}
        y={y + h / 2 + (head === "top" ? 4 : head === "bottom" ? -4 : 0)}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-mono"
        fontSize="12"
        fontWeight="600"
        pointerEvents="none"
      >
        {b.label}
      </text>
      {word ? (
        <text
          x={x + w / 2}
          y={footY}
          textAnchor="middle"
          dominantBaseline="central"
          className={paint!.text}
          fontSize="10"
          fontWeight="600"
          pointerEvents="none"
        >
          {word}
        </text>
      ) : !live && out ? (
        <text
          x={x + w / 2}
          y={footY}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-ink-700"
          fontSize="10"
          fontWeight="600"
          pointerEvents="none"
        >
          Out
        </text>
      ) : !live && glyphs ? (
        <text
          x={x + w / 2}
          y={footY}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-ink-600"
          fontSize="8.5"
          fontWeight="600"
          pointerEvents="none"
        >
          {glyphs}
        </text>
      ) : null}
      {selected ? (
        <rect
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          rx="5"
          fill="none"
          className="stroke-teal-600"
          strokeWidth="3"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

/* ─── ghost and handles ─────────────────────────────────────────────── */

function Ghost({ ghost }: { ghost: PlanGhost }) {
  return (
    <g pointerEvents="none">
      {ghost.rects.map((r, i) => (
        <g key={i}>
          <rect
            x={r.x * CELL + 1}
            y={r.y * CELL + 1}
            width={r.w * CELL - 2}
            height={r.h * CELL - 2}
            rx="3"
            className="fill-teal-tint stroke-teal-600"
            fillOpacity="0.7"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          {ghost.face ? (
            <rect
              x={ghost.face === "right" ? (r.x + r.w) * CELL - 7 : r.x * CELL}
              y={ghost.face === "bottom" ? (r.y + r.h) * CELL - 7 : r.y * CELL}
              width={ghost.face === "left" || ghost.face === "right" ? 7 : r.w * CELL}
              height={ghost.face === "top" || ghost.face === "bottom" ? 7 : r.h * CELL}
              className="fill-teal-600"
            />
          ) : null}
        </g>
      ))}
      {ghost.line ? (
        <line
          x1={ghost.line.x1 * CELL}
          y1={ghost.line.y1 * CELL}
          x2={ghost.line.x2 * CELL}
          y2={ghost.line.y2 * CELL}
          className="stroke-teal-600"
          strokeWidth="5"
          strokeOpacity="0.8"
        />
      ) : null}
      {ghost.point ? (
        <circle
          cx={ghost.point.x * CELL}
          cy={ghost.point.y * CELL}
          r="5"
          className="fill-teal-600"
        />
      ) : null}
    </g>
  );
}

function Handles({ doc, selected }: { doc: WardLayout; selected: ItemRef }) {
  const box = (x: number, y: number, handle: string, title: string, cursor: string) => (
    <rect
      key={handle}
      data-handle={handle}
      x={x - 7}
      y={y - 7}
      width="14"
      height="14"
      rx="3"
      className="fill-card stroke-teal-600"
      strokeWidth="2"
      style={{ cursor }}
    >
      <title>{title}</title>
    </rect>
  );
  if (selected.kind === "room") {
    const r = doc.rooms.find((x) => x.key === selected.key);
    if (!r) return null;
    return (
      <g>
        {box((r.x + r.w) * CELL, (r.y + r.h) * CELL, "resize", "Drag to resize", "nwse-resize")}
      </g>
    );
  }
  if (selected.kind === "divider") {
    const l = doc.dividers.find((x) => x.key === selected.key);
    if (!l) return null;
    const cursor = l.y1 === l.y2 ? "ew-resize" : "ns-resize";
    return (
      <g>
        {box(l.x1 * CELL, l.y1 * CELL, "end1", "Drag to stretch", cursor)}
        {box(l.x2 * CELL, l.y2 * CELL, "end2", "Drag to stretch", cursor)}
      </g>
    );
  }
  return null;
}
