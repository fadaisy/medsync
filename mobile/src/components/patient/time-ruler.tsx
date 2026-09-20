import type { SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@shared/slots";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatTime } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The reference's "Select Time": a ruler of tick marks with a label every
 * half hour and a raised bar over the chosen appointment. Every open time is
 * a tick you can press; the marks between them are only the ruler. The
 * chosen range is written out under it — the bar alone is colour and shape.
 * Same component, same name, on the web.
 */
export function TimeRuler({
  slots,
  value,
  onChange,
}: {
  slots: readonly SlotOffer[];
  value: string | null;
  onChange: (slot: SlotOffer) => void;
}) {
  const styles = useStyles(makeStyles);
  const model = useMemo(() => layout(slots), [slots]);
  const scrollRef = useRef<ScrollView>(null);

  // Bring the chosen tick into view when the day or the seed changes it.
  useEffect(() => {
    if (!model || !value) return;
    const i = model.ticks.findIndex((t) => t.slot?.startsAtIso === value);
    if (i < 0) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, i * TICK_W - 120), animated: true });
  }, [model, value]);

  if (!model) return null;
  const { ticks, slotMinutes } = model;
  const chosen = slots.find((s) => s.startsAtIso === value) ?? null;
  const chosenIndex = chosen
    ? ticks.findIndex((t) => t.slot?.startsAtIso === chosen.startsAtIso)
    : -1;

  return (
    <View style={styles.stack}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.track}
        accessibilityRole="radiogroup"
        accessibilityLabel="Available times"
      >
        {chosenIndex >= 0 ? (
          <View
            style={[
              styles.bar,
              {
                left: chosenIndex * TICK_W,
                width: Math.max(TICK_W, (slotMinutes / TICK_MINUTES) * TICK_W),
              },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}

        {ticks.map((t) =>
          t.slot ? (
            <Pressable
              key={t.index}
              accessibilityRole="radio"
              accessibilityState={{ checked: t.slot.startsAtIso === value }}
              accessibilityLabel={`${formatTime(t.slot.startsAtIso)} to ${formatTime(t.slot.endsAtIso)}`}
              onPress={() => onChange(t.slot!)}
              hitSlop={{ top: 12, bottom: 12 }}
              style={styles.tick}
            >
              <View
                style={[
                  styles.mark,
                  styles.markOpen,
                  t.slot.startsAtIso === value && styles.markChosen,
                ]}
              />
              <Text
                style={[styles.label, t.slot.startsAtIso === value && styles.labelChosen]}
                numberOfLines={1}
              >
                {t.label ?? " "}
              </Text>
            </Pressable>
          ) : (
            <View key={t.index} style={styles.tick} accessibilityElementsHidden>
              <View
                style={[styles.mark, t.label !== null ? styles.markHalf : styles.markQuarter]}
              />
              <Text style={styles.label} numberOfLines={1}>
                {t.label ?? " "}
              </Text>
            </View>
          ),
        )}
      </ScrollView>

      <Text style={styles.words} accessibilityLiveRegion="polite">
        {chosen ? (
          <>
            <Text style={styles.wordsStrong}>
              {formatTime(chosen.startsAtIso)} – {formatTime(chosen.endsAtIso)}
            </Text>
            {` · ${slotMinutes} min`}
          </>
        ) : (
          `${slots.length} ${slots.length === 1 ? "time" : "times"} open — tap a mark`
        )}
      </Text>
    </View>
  );
}

/* ─── The ruler's geometry ─────────────────────────────────────── */

const TICK_MINUTES = 15;
const TICK_W = 24;

interface Tick {
  index: number;
  label: string | null;
  slot: SlotOffer | null;
}

/** The open times on a quarter-hour ruler, in the hospital's clock. */
function layout(slots: readonly SlotOffer[]) {
  if (slots.length === 0) return null;
  const minutesOf = (iso: string) =>
    localWeekdayAndMinutes(new Date(iso), DEFAULT_TIME_ZONE).minutesOfDay;
  const sorted = [...slots].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const slotMinutes = Math.max(
    TICK_MINUTES,
    Math.round(
      (new Date(first.endsAtIso).getTime() - new Date(first.startsAtIso).getTime()) / 60_000,
    ),
  );
  const startMin = Math.floor(minutesOf(first.startsAtIso) / TICK_MINUTES) * TICK_MINUTES;
  const endMin = Math.ceil(minutesOf(last.endsAtIso) / TICK_MINUTES) * TICK_MINUTES;
  const byMark = new Map<number, SlotOffer>();
  for (const s of sorted) {
    const mark = Math.round(minutesOf(s.startsAtIso) / TICK_MINUTES) * TICK_MINUTES;
    if (!byMark.has(mark)) byMark.set(mark, s);
  }
  const firstMs = new Date(first.startsAtIso).getTime();
  const firstMin = minutesOf(first.startsAtIso);
  const ticks: Tick[] = [];
  for (let m = startMin, i = 0; m <= endMin; m += TICK_MINUTES, i++) {
    ticks.push({
      index: i,
      label:
        m % 30 === 0 ? formatTime(new Date(firstMs + (m - firstMin) * 60_000).toISOString()) : null,
      slot: byMark.get(m) ?? null,
    });
  }
  return { ticks, slotMinutes };
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: { gap: space[2] },
    track: { paddingTop: space[4], paddingBottom: space[1], alignItems: "flex-end" },
    bar: {
      position: "absolute",
      top: space[1],
      height: 6,
      borderRadius: radius.full,
      backgroundColor: c.primary,
    },
    tick: { width: TICK_W, alignItems: "center", justifyContent: "flex-end", height: 56 },
    mark: { width: 1, borderRadius: 1, backgroundColor: c.border },
    markQuarter: { height: 10 },
    markHalf: { height: 16 },
    markOpen: { width: 2, height: 24, backgroundColor: c.accentForeground },
    markChosen: { height: 32, backgroundColor: c.primary },
    label: {
      marginTop: 6,
      height: 16,
      fontFamily: font.mono,
      fontSize: 10,
      color: c.mutedForeground,
    },
    labelChosen: { color: c.foreground, fontFamily: font.bodyMedium },
    words: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground },
    wordsStrong: { fontFamily: font.bodyMedium, color: c.foreground },
  });
