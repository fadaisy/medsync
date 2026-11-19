/**
 * The small week chart on Home's trend card (patient app v2, 19 Nov 2026; the owner's approved prototype). One
 * lane for a single number, two for blood pressure: the top number above and the bottom number below, each
 * with its own scale, so a few points of change can be seen, and its own target line.
 *
 * A day with a reading is a dot; the line joins the days that have one, as on Health trends. A day with none
 * is an empty ring on the axis, so a gap is seen as a gap and never filled in. A day outside its target is a
 * hollow amber ring, so the shape says it as well as the colour. Tapping a day picks it; the card reads it.
 *
 * The chart holds no clinical number or word of its own: the lanes, the targets and each day's spoken
 * sentence are given to it. The drawing is hidden from screen readers, which hear the days.
 */
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect } from "react-native-svg";

import { Press } from "@/components/tide/press";
import { useTide } from "@/theme/theme";
import { tFont, tType } from "@/theme/tide";

export interface TrendLane {
  /** "Top number": written over the lane when there are two. */
  label?: string;
  /** One per day, oldest first; null where there was no reading. */
  values: (number | null)[];
  /** The target line, where the lane has one. */
  line?: number | null;
  /** The target band, where the lane has one. */
  band?: { lo: number; hi: number } | null;
}

export interface TrendDay {
  key: string;
  /** "M": under the column. */
  letter: string;
  /** The whole day for a screen reader: "16 Nov: … In target", or "15 Nov: No reading yet". */
  spoken: string;
  /** Outside the target: an amber ring. Always said in `spoken` too. */
  outside: boolean;
}

interface Plot {
  /** Where the lane's words sit. */
  label: number;
  top: number;
  bottom: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Where each lane is drawn, in points. Two lanes are the prototype's, with 4 pt more under the axis so the ring
 * of a day with no reading clears the day's letter; one lane is a little shorter.
 */
export function trendFrame(lanes: number): { height: number; axis: number; plots: Plot[] } {
  return lanes > 1
    ? {
        height: 128,
        axis: 100,
        plots: [
          { label: 0, top: 18, bottom: 50 },
          { label: 54, top: 70, bottom: 96 },
        ],
      }
    : { height: 116, axis: 88, plots: [{ label: 0, top: 20, bottom: 82 }] };
}

/** A lane's own scale: its readings and its target, with a little room above and below. */
export function laneScale(lane: TrendLane, plot: Plot): (v: number) => number {
  const xs = lane.values.filter((v): v is number => v !== null);
  if (lane.line !== null && lane.line !== undefined) xs.push(lane.line);
  if (lane.band) xs.push(lane.band.lo, lane.band.hi);
  let lo = xs.length ? Math.min(...xs) : 0;
  let hi = xs.length ? Math.max(...xs) : 1;
  const pad = (hi - lo || 1) * 0.12;
  lo -= pad;
  hi += pad;
  return (v) => r1(plot.top + ((hi - v) * (plot.bottom - plot.top)) / (hi - lo));
}

type Pt = { x: number; y: number };

/** A smooth curve through the days that have a reading. */
function smooth(ps: Pt[]): string {
  return ps
    .map((q, k) => {
      if (k === 0) return `M${q.x},${q.y}`;
      const p1 = ps[k - 1]!;
      const p0 = ps[k - 2] ?? p1;
      const p3 = ps[k + 1] ?? q;
      const c1 = `${r1(p1.x + (q.x - p0.x) / 6)},${r1(p1.y + (q.y - p0.y) / 6)}`;
      const c2 = `${r1(q.x - (p3.x - p1.x) / 6)},${r1(q.y - (p3.y - p1.y) / 6)}`;
      return `C${c1} ${c2} ${q.x},${q.y}`;
    })
    .join(" ");
}

export function TrendLanes({
  lanes,
  days,
  selected,
  onSelect,
  targetWord,
}: {
  lanes: TrendLane[];
  days: TrendDay[];
  selected: number;
  onSelect: (index: number) => void;
  /** "Target": beside the sample of the target mark, when a lane has one. */
  targetWord: string;
}) {
  const t = useTide();
  const [w, setW] = useState(310);
  const f = trendFrame(lanes.length);
  const col = w / Math.max(days.length, 1);
  const x = (i: number) => r1((i + 0.5) * col);
  const half = Math.min(19, col / 2);
  const lined = lanes.some((l) => l.line !== null && l.line !== undefined);
  const banded = lanes.some((l) => l.band);
  const words = [tType.caption, { lineHeight: 14, color: t.ink2 }];

  return (
    <View
      style={{ height: f.height }}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        if (width > 0 && Math.abs(width - w) > 0.5) setW(width);
      }}
    >
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={StyleSheet.absoluteFill}
      >
        <Svg width={w} height={f.height}>
          <Rect
            x={x(selected) - half}
            y={16}
            width={half * 2}
            height={f.height - 18}
            rx={14}
            fill={t.surface2}
          />
          {lanes.map((lane, k) => {
            const plot = f.plots[k];
            if (!plot) return null;
            const y = laneScale(lane, plot);
            const pts = lane.values.flatMap((v, i) => (v === null ? [] : [{ x: x(i), y: y(v) }]));
            const first = pts[0];
            const last = pts[pts.length - 1];
            return (
              <G key={k}>
                {lane.band ? (
                  <Rect
                    x={4}
                    width={Math.max(0, w - 8)}
                    y={y(lane.band.hi)}
                    height={Math.max(0, y(lane.band.lo) - y(lane.band.hi))}
                    rx={6}
                    fill={t.stable.tint}
                  />
                ) : null}
                {lane.line !== null && lane.line !== undefined ? (
                  <Line
                    x1={4}
                    x2={w - 4}
                    y1={y(lane.line)}
                    y2={y(lane.line)}
                    stroke={t.stable.text}
                    strokeWidth={1.5}
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                  />
                ) : null}
                {first && last && pts.length > 1 ? (
                  <>
                    {/* The soft fill under the line; left out over a target band, which is a fill itself. */}
                    {lane.band ? null : (
                      <Path
                        d={`${smooth(pts)} L${last.x},${plot.bottom} L${first.x},${plot.bottom} Z`}
                        fill={t.area.readings}
                        fillOpacity={0.12}
                      />
                    )}
                    <Path
                      d={smooth(pts)}
                      fill="none"
                      stroke={t.area.readings}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                ) : null}
                {lane.values.map((v, i) => {
                  if (v === null) return null;
                  const on = i === selected;
                  const outside = days[i]?.outside ?? false;
                  const tone = outside ? t.caution.text : t.area.readings;
                  return (
                    <G key={i}>
                      {on ? (
                        <Circle cx={x(i)} cy={y(v)} r={9} fill={tone} fillOpacity={0.2} />
                      ) : null}
                      <Circle
                        cx={x(i)}
                        cy={y(v)}
                        r={on ? 5 : 3.5}
                        fill={outside ? t.surface : tone}
                        stroke={outside ? tone : t.surface}
                        strokeWidth={outside ? 2 : 1.5}
                      />
                    </G>
                  );
                })}
              </G>
            );
          })}
          {days.map((d, i) =>
            lanes.every((l) => (l.values[i] ?? null) === null) ? (
              <Circle
                key={d.key}
                cx={x(i)}
                cy={f.axis}
                r={3.5}
                fill={t.surface}
                stroke={t.lineStrong}
                strokeWidth={1.5}
              />
            ) : null,
          )}
        </Svg>
        {lanes.map((lane, k) =>
          lane.label && f.plots[k] ? (
            <Text
              key={lane.label}
              style={[words, { position: "absolute", left: 4, top: f.plots[k].label }]}
            >
              {lane.label}
            </Text>
          ) : null,
        )}
        {lined || banded ? (
          <View
            style={{
              position: "absolute",
              right: 4,
              top: 0,
              height: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            {lined ? (
              <Svg width={18} height={4}>
                <Line
                  x1={1}
                  x2={17}
                  y1={2}
                  y2={2}
                  stroke={t.stable.text}
                  strokeWidth={1.5}
                  strokeDasharray="2 5"
                  strokeLinecap="round"
                />
              </Svg>
            ) : (
              <View
                style={{ width: 14, height: 8, borderRadius: 3, backgroundColor: t.stable.tint }}
              />
            )}
            <Text style={[words, { color: t.stable.text }]}>{targetWord}</Text>
          </View>
        ) : null}
      </View>
      <View style={[StyleSheet.absoluteFill, { flexDirection: "row" }]}>
        {days.map((d, i) => {
          const on = i === selected;
          const empty = lanes.every((l) => (l.values[i] ?? null) === null);
          return (
            <Press
              key={d.key}
              haptic={false}
              onPress={() => onSelect(i)}
              accessibilityLabel={d.spoken}
              accessibilityState={{ selected: on }}
              style={{
                flex: 1,
                height: f.height,
                alignItems: "center",
                justifyContent: "flex-end",
                paddingBottom: 4,
              }}
            >
              <Text
                style={[
                  tType.bodyS,
                  { lineHeight: 17, color: on ? t.ink : empty ? t.ink3 : t.ink2 },
                  on ? { fontFamily: tFont.bold } : null,
                ]}
              >
                {d.letter}
              </Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}
