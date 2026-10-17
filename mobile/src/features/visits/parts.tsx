import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

import { Card, StatusPill } from "@/components/tide";
import { MAP_ART, TRAVEL } from "@/data/visits";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** Small pieces the visit and booking screens share. */

/** A coloured dot that marks a kind of day (visit, lab, care team). Always beside its word. */
export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
  );
}

/** "Demo": on a single row of fixture data inside a screen of real data (law L1). */
export function DemoTag() {
  return <StatusPill tone="pending" label="Demo" />;
}

/** The drawn route, home (lagoon) to hospital (navy). Art: colours from the fixture. */
export function RouteMap({ room }: { room?: string }) {
  const t = useTide();
  return (
    <View>
      <Svg
        width="100%"
        height={140}
        viewBox="0 0 350 140"
        preserveAspectRatio="xMidYMid slice"
        accessibilityRole="image"
        accessibilityLabel="Map with the route to the hospital"
      >
        <Rect width={350} height={140} fill={MAP_ART.land} />
        <G stroke={MAP_ART.road} strokeWidth={7} fill="none" strokeLinecap="round">
          <Path d="M0 36 H350" />
          <Path d="M0 102 H350" />
          <Path d="M70 0 V140" />
          <Path d="M190 0 V140" />
          <Path d="M290 0 V140" />
          <Path d="M0 140 L120 26" />
        </G>
        <Path
          d="M40 112 C 70 104, 72 72, 105 66 S 160 92, 190 68 S 230 30, 262 40 S 300 64, 312 52"
          stroke={MAP_ART.route}
          strokeWidth={3.5}
          fill="none"
          strokeLinecap="round"
        />
        <Circle cx={40} cy={112} r={7} fill={MAP_ART.start} stroke={MAP_ART.ring} strokeWidth={3} />
        <Circle cx={312} cy={52} r={9} fill={MAP_ART.end} stroke={MAP_ART.ring} strokeWidth={3} />
      </Svg>
      {room ? (
        <View
          style={{
            position: "absolute",
            right: tSpace[2.5],
            top: tSpace[2.5],
            minHeight: 26,
            paddingHorizontal: tSpace[2.5],
            borderRadius: tRadius.pill,
            justifyContent: "center",
            backgroundColor: t.band,
          }}
        >
          <Text style={[tType.micro, { fontFamily: tFont.semibold, color: t.onBand }]}>{room}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Distance, boda and taxi times over the drawn map. Illustrative: no location is read. */
export function TravelCard({ room, footer }: { room?: string; footer?: ReactNode }) {
  const t = useTide();
  const stat = (label: string, value: string) => (
    <View>
      <Text style={[tType.bodyS, { color: t.ink2 }]}>{label}</Text>
      <Text style={[tType.heading, { color: t.ink, fontVariant: ["tabular-nums"] }]}>{value}</Text>
    </View>
  );
  return (
    <Card padding={0} style={{ overflow: "hidden", gap: 0 }}>
      <View
        style={{
          flexDirection: "row",
          gap: tSpace[6],
          paddingHorizontal: tSpace[4],
          paddingVertical: tSpace[3],
        }}
      >
        {stat("Distance", TRAVEL.distance)}
        {stat("By boda", TRAVEL.boda)}
        {stat("By taxi", TRAVEL.taxi)}
      </View>
      <RouteMap room={room} />
      {footer ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tSpace[2.5],
            padding: tSpace[3],
            paddingHorizontal: tSpace[4],
          }}
        >
          {footer}
        </View>
      ) : null}
    </Card>
  );
}

/** A selectable row or tile: lagoon ring and foam fill when chosen (the boards' selected look). */
export function pickStyle(t: ReturnType<typeof useTide>, on: boolean) {
  return {
    backgroundColor: on ? t.accentTint : t.surface,
    borderWidth: on ? 2 : 1,
    borderColor: on ? t.accent : t.line,
  } as const;
}

/** "1 · Who is this visit for?": a numbered question. */
export function StepTitle({ n, children }: { n?: number; children: string }) {
  const t = useTide();
  return (
    <Text accessibilityRole="header" style={[tType.label, { color: t.ink }]}>
      {n ? <Text style={{ color: t.ink3 }}>{`${n} · `}</Text> : null}
      {children}
    </Text>
  );
}

/** The honesty sentence (law L8), bold, with what follows it. */
export const HONEST = "We save your place in line. We cannot tell you the hour.";

export function HonestNote({ after }: { after?: string }) {
  const t = useTide();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: tSpace[2.5],
        padding: tSpace[3.5],
        borderRadius: tRadius.card,
        backgroundColor: t.info.tint,
      }}
    >
      <Text style={[tType.bodyM, { flex: 1, color: t.ink }]}>
        <Text style={{ fontFamily: tFont.bold }}>{HONEST}</Text>
        {after ? ` ${after}` : ""}
      </Text>
    </View>
  );
}
