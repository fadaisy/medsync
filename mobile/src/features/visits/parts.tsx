import { Text, View } from "react-native";

import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/** Small pieces the visit and booking screens share. */

/** A coloured dot that marks a kind of day (visit, lab, care team). Always beside its word. */
export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
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
