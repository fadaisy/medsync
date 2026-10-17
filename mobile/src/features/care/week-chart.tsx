import type { Judgement } from "@/data/trends";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { useTide } from "@/theme/theme";
import { tFont } from "@/theme/tide";

const W = 322;
const H = 170;
const X0 = 40;
const X1 = 306;
const Y0 = 10;
const Y1 = 146;

/**
 * The week chart on Health trends (board TTrends): the target band, grid,
 * one or two lines and a point for each day with a reading. A point outside
 * the target turns amber (red only for a danger reading); the legend under
 * the chart says so in words (law L4).
 */
export function WeekChart({
  a,
  b,
  lo,
  hi,
  grid,
  band,
  days,
  judged,
  label,
}: {
  a: (number | null)[];
  b?: (number | null)[];
  lo: number;
  hi: number;
  grid: number[];
  band: { lo: number; hi: number } | null;
  days: string[];
  judged: (Judgement | null)[];
  label: string;
}) {
  const t = useTide();
  const y = (v: number) => Y0 + (1 - (v - lo) / (hi - lo)) * (Y1 - Y0);
  const x = (i: number) => X0 + (i * (X1 - X0)) / (a.length - 1);
  // A day with no reading is a gap: the line joins the days that have one.
  const path = (vs: (number | null)[]) =>
    vs
      .flatMap((v, i) => (v === null ? [] : [[x(i), y(v)]]))
      .map(([px, py], k) => `${k ? "L" : "M"}${px} ${py}`)
      .join(" ");
  const flag = (j: Judgement | null) =>
    j?.tone === "critical" ? t.critical.text : j?.tone === "caution" ? t.caution.text : null;
  const bandTop = band ? y(Math.min(band.hi, hi)) : 0;
  const bandBottom = band ? y(Math.max(band.lo, lo)) : 0;
  const lastI = a.length - 1;
  const lastLogged = a.reduce<number>((n, v, i) => (v === null ? n : i), -1);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {band ? (
          <>
            <Rect
              x={30}
              y={bandTop}
              width={286}
              height={Math.max(4, bandBottom - bandTop)}
              rx={6}
              fill={t.accentTint}
              opacity={0.55}
            />
            <SvgText
              x={312}
              y={bandTop + 12}
              textAnchor="end"
              fontFamily={tFont.semibold}
              fontSize={10}
              fill={t.accentText}
            >
              Your target
            </SvgText>
          </>
        ) : null}
        {grid.map((g) => (
          <G key={`g${g}`}>
            <Line x1={30} x2={316} y1={y(g)} y2={y(g)} stroke={t.surface3} strokeWidth={1} />
            <SvgText
              x={24}
              y={y(g) + 3}
              textAnchor="end"
              fontFamily={tFont.regular}
              fontSize={10}
              fill={t.ink3}
            >
              {String(g)}
            </SvgText>
          </G>
        ))}
        {b ? (
          <Path
            d={path(b)}
            fill="none"
            stroke={t.cascade[2]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <Path
          d={path(a)}
          fill="none"
          stroke={t.ink}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {a.map((v, i) =>
          v === null ? null : (
            <Circle
              key={`a${i}`}
              cx={x(i)}
              cy={y(v)}
              r={i === lastLogged ? 6 : 4.5}
              fill={flag(judged[i]) ?? (i === lastLogged ? t.accent : t.ink)}
              stroke={t.surface}
              strokeWidth={2}
            />
          ),
        )}
        {b?.map((v, i) =>
          v === null ? null : (
            <Circle
              key={`b${i}`}
              cx={x(i)}
              cy={y(v)}
              r={3.5}
              fill={flag(judged[i]) ?? t.cascade[2]}
              stroke={t.surface}
              strokeWidth={2}
            />
          ),
        )}
        {days.map((d, i) => (
          <SvgText
            key={`d${i}`}
            x={x(i)}
            y={166}
            textAnchor="middle"
            fontFamily={i === lastI ? tFont.bold : tFont.medium}
            fontSize={11}
            fill={t.ink2}
          >
            {d}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
