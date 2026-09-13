import type { Palette } from "@/theme/tokens";
import type { TextStyle, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The status chip on an appointment.
 *
 * Two rules govern it, and they are not stylistic.
 *
 * 1. **Never colour alone.** Every chip carries a word a patient can read, and
 *    the word is the whole message — the tone only sorts it into "on track",
 *    "waiting", "settled" or "needs your attention". A patient who cannot see
 *    the difference between the green and the amber loses nothing.
 * 2. **No red.** `status.criticalBg/Fg` exists in the token set and is
 *    deliberately unused here. Red on a MedSync surface means a clinician has
 *    declared a life threat; a clinic declining a booking request is a
 *    scheduling outcome, and spending red on it is how a patient learns to
 *    ignore red where it matters. The web retoned `declined` from critical to
 *    caution for exactly this reason (`lib/patient/appointments.ts`).
 *
 * The words are lifted verbatim from that same file's `STATUS_LABEL`, so a
 * patient who books on the phone and then opens the web app reads the same
 * sentence about the same appointment.
 */
type Tone = "stable" | "caution" | "pending" | "neutral";

/**
 * The ten `appointments.status` values (`db/schema/scheduling.ts`).
 *
 * The tones are the web's, collapsed where this app has no token for them:
 * `arrived` / `in_progress` are `admitted` (teal) on the web and `completed`
 * is `discharged` (violet), and `theme/tokens.ts` mirrors neither ramp. They
 * fold into the nearest honest neighbour — "this is going ahead" and "this is
 * over" — and the word keeps the distinction the colour drops.
 */
const STATUS: Record<string, { tone: Tone; word: string }> = {
  requested: { tone: "pending", word: "Requested" },
  pending_approval: { tone: "pending", word: "Awaiting approval" },
  confirmed: { tone: "stable", word: "Confirmed" },
  arrived: { tone: "stable", word: "You've arrived" },
  in_progress: { tone: "stable", word: "In progress" },
  completed: { tone: "neutral", word: "Completed" },
  cancelled: { tone: "neutral", word: "Cancelled" },
  no_show: { tone: "caution", word: "Missed" },
  rescheduled: { tone: "neutral", word: "Rescheduled" },
  declined: { tone: "caution", word: "Declined" },
};

export function Pill({ status }: { status: string }) {
  const entry = STATUS[status];
  // A value outside the ten renders nothing rather than printing the raw enum
  // at a patient. The column has a CHECK constraint, so this is insurance
  // against a future status shipped on the server before it ships here — and
  // a missing chip is recoverable, `no_show` spelt at someone is not.
  const styles = useStyles(makeStyles);
  if (!entry) return null;

  const fill: Record<Tone, ViewStyle> = {
    stable: styles.stableFill,
    caution: styles.cautionFill,
    pending: styles.pendingFill,
    neutral: styles.neutralFill,
  };
  const ink: Record<Tone, TextStyle> = {
    stable: styles.stableInk,
    caution: styles.cautionInk,
    pending: styles.pendingInk,
    neutral: styles.neutralInk,
  };

  return (
    <View style={[styles.pill, fill[entry.tone]]}>
      <Text style={[styles.word, ink[entry.tone]]}>{entry.word}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    pill: {
      alignSelf: "flex-start",
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: radius.full,
    },
    word: { fontFamily: font.bodyMedium, fontSize: 12.5, letterSpacing: 0.2 },

    // The design system's own clinical pairs, retoned per theme exactly as the
    // web retones them, so a status is the same colour here as there.
    stableFill: { backgroundColor: c.status.stableBg },
    stableInk: { color: c.status.stableFg },
    // Caution is the one pair whose ink fails on its own fill (2.9:1 in
    // light), so it takes the caution well's recipe instead: the amber is the
    // frame, the word is in the page's own ink.
    cautionFill: {
      backgroundColor: c.status.cautionBg,
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    cautionInk: { color: c.foreground },
    // A live request is a brand-tinted chip; a settled visit is a quiet one.
    pendingFill: { backgroundColor: c.accent },
    pendingInk: { color: c.accentForeground },
    neutralFill: { backgroundColor: c.status.pendingBg },
    neutralInk: { color: c.status.pendingFg },
  });
