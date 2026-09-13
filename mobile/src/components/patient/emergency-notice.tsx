import type { Palette } from "@/theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * ⚠ PROVISIONAL — PENDING CLINICAL SAFETY OFFICER SIGN-OFF. ⚠
 *
 * The red-flag symptoms of ADR 0084 §3, now on the Emergency tab and nowhere
 * else (ADR 0085 §5). This list is
 * clinical content, governed exactly like a drug dose: it is **CSO-authored
 * and CSO-signed, not engineer-authored**. What is written here came from the
 * ADR, which states plainly that it gives "the shape and the register, not the
 * ratified content". Nothing has been added to it, reworded, reordered or
 * "improved" since.
 *
 * It lives in one exported constant so the review that ratifies it is a single
 * edit in a single place. If you are that reviewer: replace the array, leave
 * the component alone.
 *
 * Two properties of this list are load-bearing and survive any revision:
 *   1. Each entry NAMES a symptom in plain words a frightened relative can
 *      recognise. The patient is never asked to rate their own urgency — every
 *      accuracy figure in the corpus (47.3–62.4%, kappa 0.166 / 0.07) measures
 *      exactly that instrument, and the one platform that did well "asked
 *      clinical questions rather than asking the patient to rate urgency".
 *   2. Nothing branches on an entry. The list is read, never evaluated: no
 *      checklist, no checkbox, no input, no score. An instruction that makes no
 *      decision cannot under-triage anyone, which is what keeps this block a
 *      static notice rather than a red-flag engine.
 *
 * Mirrored byte-for-byte from `app/patient/_components/emergency-notice.tsx`
 * (the web app) — the same list, the same words, the same sign-off state. When
 * the CSO ratifies one, ratify the other in the same change.
 */
export const EMERGENCY_SYMPTOMS: readonly string[] = [
  "chest pain or pressure",
  "trouble breathing",
  "weakness on one side",
  "a fit",
  "bleeding that will not stop",
  "a child who will not wake",
];

/**
 * The emergency block: named symptoms, one destination, one number, no
 * question (ADR 0084 §3). It sits above both doors, first thing on the screen,
 * on the home and at the head of each door screen — a patient mid-stroke may
 * be on the booking screen.
 *
 * What it deliberately is not:
 *
 *   - **Not a question.** No heading asks "Very unwell right now?" — that is
 *     the self-rating instrument the evidence indicts. The symptoms are named
 *     and the patient recognises one, or does not.
 *   - **Not a router.** It takes no input, holds no state, writes nothing,
 *     branches nowhere, and files nothing. One unconditional statement, named
 *     examples, one destination.
 *   - **Not red.** Red on a MedSync surface means a clinician has declared a
 *     life threat. A permanent red band on a patient's home screen trains the
 *     patient to discount red exactly where red must keep meaning something,
 *     so this is an amber ring on the plain ground and the words carry the
 *     weight.
 *   - **Not a promise about the emergency department.** "They see the sickest
 *     people first" stands; "no one waits in line" is deleted and must not
 *     reappear — MedSync holds no data about that queue, and a daughter who
 *     takes her father there on the app's word, finds thirty people waiting,
 *     and concludes the app lied will take him home.
 *
 * It fetches nothing and takes what it shows as props, so the home can draw
 * it before the profile has loaded: the instruction needs no data, and on the
 * connections this app is built for the profile can take seconds.
 *
 * It renders with a hospital name or without one. Unaffiliated is not a
 * lesser case to be gated out: it is the least-set-up patient, on the screen
 * with the least on it, and the instruction is unconditional by design.
 */
export function EmergencyNotice({
  hospitalName,
  emergencyPhone,
}: {
  /**
   * Names whose emergency line the number belongs to, for a screen reader.
   * It is never substituted into the body copy — "the hospital's emergency
   * entrance" is the ratified wording, with a name or without one.
   */
  hospitalName?: string | null;
  /**
   * `hospitals.emergency_phone` — nullable, no default, populated per hospital
   * during activation (ADR 0084 §3). Displayed exactly as the hospital verified
   * it; only the `tel:` target is normalised.
   *
   * **Until a number is verified for a given hospital, pass nothing.** The
   * block then shows the destination alone, which is the correct failure: an
   * invented, guessed or hardcoded number here would be the most dangerous
   * fabricated datum in the product.
   */
  emergencyPhone?: string | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  // Rendered verbatim, never reformatted — the hospital verified this string.
  // A value with no digit in it is not a number anyone can ring, so it shows
  // nothing rather than a dead control.
  // ponytail: digit-presence is the whole check. Format validation belongs at
  // activation, where a human verifies the number, not on the read path.
  const phone = emergencyPhone?.trim();
  const dialable = phone && /\d/.test(phone) ? phone : null;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Decorative. The words carry the meaning, so the glyph is hidden from
            screen readers rather than given a name that repeats the sentence. */}
        <View
          style={styles.disc}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="warning-outline" size={18} color={colors.status.cautionFg} />
        </View>

        <View style={styles.body}>
          {/* ADR 0084 §2 and §3. The words are the decision. Do not paraphrase,
              do not translate into another register, do not add a promise. */}
          <Text style={styles.lead}>
            If you are very sick now, do not use this page. Go to the hospital&rsquo;s emergency
            entrance. They see the sickest people first.
          </Text>

          {/* Not muted: the symptom names are the payload of this block, and a
              man with forty minutes of crushing chest pain has to be able to
              read them. */}
          <Text style={styles.symptoms}>
            Very sick means things like: {EMERGENCY_SYMPTOMS.join(" · ")}.
          </Text>
        </View>
      </View>

      {dialable ? (
        <Button
          variant="secondary"
          label={`Call ${dialable}`}
          // The web's sr-only suffix: a screen-reader user hears whose line
          // this is, without the visible label growing.
          accessibilityLabel={hospitalName ? `Call ${dialable}, ${hospitalName}` : undefined}
          // One tap, no data. Caught rejection: a device with no dialler
          // (a tablet, a simulator) has nothing useful to be told, and an
          // unhandled promise is a redbox in dev.
          onPress={() => {
            Linking.openURL(`tel:${dialable.replace(/[^\d+]/g, "")}`).catch(() => {});
          }}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    // Amber ring on the page's own ground, never a fill and never red. The
    // web's `ring-status-caution-fg/40` would vanish on a dark ground, so the
    // ring is the full caution token at 1px in either theme.
    card: {
      gap: space[3],
      padding: space[4],
      borderRadius: radius["2xl"],
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    // The mark beside the words; the Call control spans the card beneath them
    // so the one tap a relative has to make is the full width of the thumb.
    row: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
    // The design system's own caution pair, retoned per theme exactly as the
    // web retones it, so the mark is the same colour here as there.
    disc: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: c.status.cautionBg,
      alignItems: "center",
      justifyContent: "center",
    },
    body: { flex: 1, gap: space[2] },
    lead: {
      fontFamily: font.bodyMedium,
      fontSize: 15,
      lineHeight: 22,
      color: c.foreground,
    },
    symptoms: {
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 22,
      color: c.foreground,
    },
  });
