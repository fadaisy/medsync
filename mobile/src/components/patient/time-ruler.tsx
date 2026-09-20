import type { SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@shared/slots";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatTime } from "@/lib/booking";
import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The reference's "Select Time": a dense ruler — a mark every five minutes,
 * taller on the quarter and half hour, a label on the half hour — with the
 * chosen appointment sitting on it as a tinted block under a brand bar, its
 * marks inked. Every open time is a press target as wide as the visit it
 * books; the mark where it starts stands taller so the open times can be
 * seen before any is chosen. The chosen range is written out under the
 * ruler. Same component, same name, on the web.
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

  useEffect(() => {
    if (!model || !value) return;
    const span = model.spans.find((s) => s.startsAtIso === value);
    if (span) scrollRef.current?.scrollTo({ x: Math.max(0, span.left - 96), animated: true });
  }, [model, value]);

  if (!model) return null;
  const { ticks, spans, slotMinutes, width } = model;
  const chosen = spans.find((s) => s.startsAtIso === value) ?? null;

  return (
    <View style={styles.card}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View
          style={[styles.track, { width }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Available times"
        >
          {chosen ? (
            <View
              style={[styles.block, { left: chosen.left, width: chosen.width }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.blockBar} />
            </View>
          ) : null}

          <View style={styles.marks} accessibilityElementsHidden>
            {ticks.map((t) => {
              const inChosen = chosen !== null && t.min >= chosen.startMin && t.min < chosen.endMin;
              return (
                <View key={t.min} style={styles.tickCell}>
                  <View
                    style={[
                      styles.mark,
                      t.min % 15 === 0 && styles.markQuarter,
                      t.min % 30 === 0 && styles.markHalf,
                      t.opens && styles.markOpen,
                      inChosen && styles.markChosen,
                    ]}
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.labels} accessibilityElementsHidden>
            {ticks
              .filter((t) => t.label)
              .map((t) => (
                <Text
                  key={t.min}
                  style={[
                    styles.label,
                    { left: t.left + TICK_W / 2 - 24 },
                    chosen &&
                      t.min >= chosen.startMin &&
                      t.min <= chosen.endMin &&
                      styles.labelChosen,
                  ]}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>
              ))}
          </View>

          {spans.map((s) => (
            <Pressable
              key={s.startsAtIso}
              accessibilityRole="radio"
              accessibilityState={{ checked: s.startsAtIso === value }}
              accessibilityLabel={`${formatTime(s.startsAtIso)} to ${formatTime(s.endsAtIso)}`}
              onPress={() => onChange(s)}
              style={[styles.target, { left: s.left, width: s.width }]}
            />
          ))}
        </View>
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
          `${slots.length} ${slots.length === 1 ? "time" : "times"} open — the tall marks. Tap one.`
        )}
      </Text>
    </View>
  );
}

/* ─── The ruler's geometry ─────────────────────────────────────── */

/** A mark every five minutes, eight points apart: a 30-minute visit is 48pt of ruler. */
const TICK_MINUTES = 5;
const TICK_W = 8;
const MARKS_H = 48;
const LABELS_H = 20;

interface Tick {
  min: number;
  left: number;
  label: string | null;
  opens: boolean;
}

interface Span {
  startsAtIso: string;
  endsAtIso: string;
  startMin: number;
  endMin: number;
  left: number;
  width: number;
}

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
  const startMin = Math.max(0, Math.floor(minutesOf(first.startsAtIso) / 30) * 30 - 30);
  const endMin = Math.min(24 * 60, Math.ceil(minutesOf(last.endsAtIso) / 30) * 30 + 30);
  const leftOf = (min: number) => ((min - startMin) / TICK_MINUTES) * TICK_W;
  const spans: Span[] = sorted.map((s) => {
    const a = minutesOf(s.startsAtIso);
    const b = Math.max(a + TICK_MINUTES, minutesOf(s.endsAtIso) || a + slotMinutes);
    return {
      startsAtIso: s.startsAtIso,
      endsAtIso: s.endsAtIso,
      startMin: a,
      endMin: b,
      left: leftOf(a),
      width: leftOf(b) - leftOf(a),
    };
  });
  const opens = new Set(spans.map((s) => Math.round(s.startMin / TICK_MINUTES) * TICK_MINUTES));
  const firstMs = new Date(first.startsAtIso).getTime();
  const firstMin = minutesOf(first.startsAtIso);
  const ticks: Tick[] = [];
  for (let m = startMin; m <= endMin; m += TICK_MINUTES) {
    ticks.push({
      min: m,
      left: leftOf(m),
      label:
        m % 30 === 0 ? formatTime(new Date(firstMs + (m - firstMin) * 60_000).toISOString()) : null,
      opens: opens.has(m),
    });
  }
  return { ticks, spans, slotMinutes, width: ticks.length * TICK_W };
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: space[3],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    scroll: { flexGrow: 1, justifyContent: "center" },
    track: { height: MARKS_H + LABELS_H },
    block: {
      position: "absolute",
      top: 0,
      height: MARKS_H,
      borderRadius: radius.lg,
      backgroundColor: c.accent,
    },
    blockBar: {
      position: "absolute",
      top: 0,
      left: 4,
      right: 4,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: c.primary,
    },
    marks: { flexDirection: "row", alignItems: "flex-end", height: MARKS_H },
    tickCell: { width: TICK_W, alignItems: "center" },
    mark: { width: 1, height: 8, borderRadius: 1, backgroundColor: c.border },
    markQuarter: { height: 12 },
    markHalf: { height: 16 },
    markOpen: { width: 2, height: 24, backgroundColor: c.primary },
    markChosen: { backgroundColor: c.accentForeground },
    labels: { height: LABELS_H },
    label: {
      position: "absolute",
      top: 4,
      width: 48,
      textAlign: "center",
      fontFamily: font.mono,
      fontSize: 10,
      color: c.mutedForeground,
    },
    labelChosen: { color: c.foreground, fontFamily: font.bodyMedium },
    target: { position: "absolute", top: 0, height: MARKS_H, borderRadius: radius.lg },
    words: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground },
    wordsStrong: { fontFamily: font.bodyMedium, color: c.foreground },
  });
