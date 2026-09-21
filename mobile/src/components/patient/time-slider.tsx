import type { SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

import { formatTime } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The reference's picker: the chosen time large, its length under it, and
 * one slider whose knob steps through the day's open times — filled up to
 * the knob, the rest of the track quiet. A pan on the track snaps the knob to
 * the nearest open time; for a screen reader it is an adjustable control
 * whose increment and decrement step the same list, and the value it reads
 * is the time. Same component, same name, on the web.
 */
export function TimeSlider({
  slots,
  value,
  onChange,
}: {
  slots: readonly SlotOffer[];
  value: string | null;
  onChange: (slot: SlotOffer) => void;
}) {
  const styles = useStyles(makeStyles);
  const sorted = useMemo(
    () => [...slots].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso)),
    [slots],
  );
  const [trackW, setTrackW] = useState(0);
  // The latest list, width and handler for the responder, which is created
  // once; written in an effect (never during render) and read on a gesture.
  const live = useRef({ sorted, trackW, onChange });
  useEffect(() => {
    live.current = { sorted, trackW, onChange };
  });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => snapTo(live.current, e.nativeEvent.locationX),
        onPanResponderMove: (e) => snapTo(live.current, e.nativeEvent.locationX),
      }),
    [],
  );

  if (sorted.length === 0) return null;
  const index = Math.max(
    0,
    sorted.findIndex((s) => s.startsAtIso === value),
  );
  const chosen = value ? (sorted[index] ?? null) : null;
  const shown = chosen ?? sorted[0]!;
  const minutes = Math.round(
    (new Date(shown.endsAtIso).getTime() - new Date(shown.startsAtIso).getTime()) / 60_000,
  );
  const [hh, mm] = splitTime(shown.startsAtIso);
  const usable = Math.max(0, trackW - KNOB);
  const knobX = chosen && sorted.length > 1 ? (index / (sorted.length - 1)) * usable : 0;

  return (
    <View style={styles.card}>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        <View style={styles.clock}>
          <Text style={[styles.digits, !chosen && styles.digitsMuted]}>{hh}</Text>
          <Text style={styles.colon}>:</Text>
          <Text style={[styles.digits, !chosen && styles.digitsMuted]}>{mm}</Text>
        </View>
        <Text style={styles.under}>
          {chosen
            ? `${minutes} min · ${formatTime(chosen.startsAtIso)} – ${formatTime(chosen.endsAtIso)}`
            : `${sorted.length} ${sorted.length === 1 ? "time" : "times"} open — slide to choose`}
        </Text>
      </View>

      <View
        {...pan.panHandlers}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Time"
        accessibilityValue={{
          min: 0,
          max: sorted.length - 1,
          now: chosen ? index : 0,
          text: `${formatTime(shown.startsAtIso)} to ${formatTime(shown.endsAtIso)}`,
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const next = sorted[index + (e.nativeEvent.actionName === "increment" ? 1 : -1)];
          if (next) onChange(next);
        }}
        style={styles.track}
      >
        <View style={[styles.fill, { width: chosen ? knobX + KNOB : 0 }]} />
        {chosen ? <View style={[styles.knob, { left: knobX }]} /> : null}
      </View>

      <View style={styles.ends}>
        <Text style={styles.end}>{formatTime(sorted[0]!.startsAtIso)}</Text>
        <Text style={styles.end}>{formatTime(sorted[sorted.length - 1]!.startsAtIso)}</Text>
      </View>
    </View>
  );
}

const KNOB = 28;

/** The nearest open time to a point on the track, handed to the caller. */
function snapTo(
  state: { sorted: readonly SlotOffer[]; trackW: number; onChange: (slot: SlotOffer) => void },
  x: number,
) {
  const { sorted: list, trackW: w, onChange: pick } = state;
  if (list.length === 0 || w <= 0) return;
  const usable = w - KNOB;
  const i = Math.round((Math.min(Math.max(x - KNOB / 2, 0), usable) / usable) * (list.length - 1));
  pick(list[i]!);
}

/** "9:30 AM" → ["09", "30"]. */
function splitTime(iso: string): [string, string] {
  const t = formatTime(iso);
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return [t, ""];
  return [m[1]!.padStart(2, "0"), m[2]!];
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: space[4],
      padding: space[5],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    readout: { alignItems: "center", gap: space[1] },
    clock: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: space[2],
      paddingHorizontal: space[5],
      paddingVertical: space[2],
      borderRadius: radius.xl,
      backgroundColor: c.muted,
    },
    digits: { fontFamily: font.mono, fontSize: 34, lineHeight: 40, color: c.foreground },
    digitsMuted: { color: c.mutedForeground },
    colon: { fontFamily: font.mono, fontSize: 28, lineHeight: 40, color: c.mutedForeground },
    under: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    track: {
      height: KNOB,
      borderRadius: KNOB / 2,
      backgroundColor: c.muted,
      justifyContent: "center",
    },
    fill: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: KNOB / 2,
      backgroundColor: c.primary,
    },
    knob: {
      position: "absolute",
      top: 0,
      width: KNOB,
      height: KNOB,
      borderRadius: KNOB / 2,
      backgroundColor: c.primary,
      borderWidth: 3,
      borderColor: c.card,
    },
    ends: { flexDirection: "row", justifyContent: "space-between" },
    end: { fontFamily: font.mono, fontSize: 11, color: c.mutedForeground },
  });
