import type { AppointmentRow, SlotOffer } from "@/lib/booking";
import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { Easing, FadeIn } from "react-native-reanimated";

import { DayStrip } from "@/components/patient/day-strip";
import { EmergencyButton } from "@/components/patient/emergency-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Empty } from "@/components/ui/empty";
import { HeroAction, HeroCard } from "@/components/ui/hero-card";
import { StarInput } from "@/components/ui/rating";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import {
  APPOINTMENT_REASONS,
  cancelAppointment,
  CANCELLABLE,
  canRate,
  dateKey,
  dayLabel,
  fetchAppointments,
  fetchBookableClinicians,
  fetchMyRating,
  formatTime,
  MIN_REASON_CHARS,
  rateVisit,
  RESCHEDULABLE,
  rescheduleAppointment,
  STATUS_LABEL,
} from "@/lib/booking";
import { useStyles, useTheme } from "@/theme/theme";
import { font, motion, radius, space } from "@/theme/tokens";

/**
 * One visit, and the three things a patient can do to it: move it, cancel it,
 * and — once it has happened — rate it.
 *
 * Move sits BEFORE cancel, in order and in weight — the hero's white pill
 * against its translucent one — because the evidence says the order is not
 * cosmetic (ADR 0084 §13): in a 1,500-slot NHS series, reminders with no way
 * to move a visit cut no-shows but pushed short-notice cancellations from 0.6%
 * to 7.2%, and only 20 of 35 freed slots were reused for want of a clerk. A
 * patient who moves a visit stays in the system; one who cancels drops out.
 *
 * Which visits can be moved or cancelled is the Edge Functions' decision, read
 * from the data layer's `RESCHEDULABLE` / `CANCELLABLE` — the exact sets
 * `reschedule-appointment` and `cancel-appointment` accept — never guessed.
 * The same holds for the rating: `canRate` is `pt-rate-visit`'s own test (the
 * patient was there, and it is over), and the card is absent otherwise.
 *
 * The times on offer come from the same engine-backed read the doctor page
 * uses, narrowed to this visit's clinician and department (which the function
 * copies onto the new row), and are picked the same way — the day strip, then
 * one of that day's open slots as a clock time (ADR 0085 §3). Nothing here
 * derives a slot.
 */

const EASE = Easing.bezier(...motion.easing);
const REVEAL = FadeIn.duration(motion.fast).easing(EASE);

/** Statuses where the clinic has not yet answered the request. */
const AWAITING_CLINIC: ReadonlySet<string> = new Set(["requested", "pending_approval"]);

/** Why a reason is asked for, beside both reason fields. */
const REASON_HINT = "The clinic reads this, and can give your place to someone else.";
const REASON_PLACEHOLDER = "e.g. I cannot travel that day";

type Mode = "idle" | "move" | "cancel";

/** A slot the visit can move into — the engine's offer plus its day key. */
type MoveOption = SlotOffer & { dayKey: string };

/**
 * Slots this visit's clinician has open in this department, earliest first,
 * minus the one the visit already holds — a move onto its own time is not a
 * move a patient can tell apart from nothing.
 */
async function loadOptions(visit: AppointmentRow): Promise<MoveOption[]> {
  const clinicians = await fetchBookableClinicians(visit.hospitalId);
  const mine = clinicians.find(
    (c) => c.userId === visit.clinicianUserId && c.departmentId === visit.departmentId,
  );
  if (!mine) return [];
  // By instant, not by string: PostgREST and the engine spell the same moment
  // differently ("+00:00" against "Z").
  const current = new Date(visit.startsAtIso).getTime();
  return Object.keys(mine.slotsByDate)
    .sort()
    .flatMap((dayKey) =>
      (mine.slotsByDate[dayKey] ?? [])
        .filter((o) => new Date(o.startsAtIso).getTime() !== current)
        .map((o) => ({ ...o, dayKey })),
    );
}

export default function VisitScreen() {
  const router = useRouter();
  const { id, move } = useLocalSearchParams<{ id: string; move?: string }>();
  // Home's "Move it" lands here with `move=1`: the panel is open from the
  // first frame rather than after a tap the patient has already made.
  const openMove = move === "1";
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);

  const [visit, setVisit] = useState<AppointmentRow | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  const [mode, setMode] = useState<Mode>(openMove ? "move" : "idle");
  // `null` = not fetched for this visit yet. Reset after a move: the old slot
  // is free again and the new one taken, so the list is stale either way.
  const [options, setOptions] = useState<MoveOption[] | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  // `null` = the first open day, the way the doctor page seeds its own.
  const [dayPick, setDayPick] = useState<string | null>(null);
  const [chosen, setChosen] = useState<MoveOption | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The rating (ADR 0085 §2). `rated` = a row exists, so the control says
  // "Update" rather than "Send"; the stars and comment are pre-filled from it.
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSaved, setRatingSaved] = useState(false);

  const fetchOptions = useCallback(async (row: AppointmentRow) => {
    setOptionsFailed(false);
    try {
      setOptions(await loadOptions(row));
    } catch {
      setOptionsFailed(true);
    }
  }, []);

  // State is set inside the promise callbacks, never in the effect body — the
  // same shape `session.tsx` uses — so the mount effect stays a plain
  // subscription; the retry control flips back to `loading` itself.
  const load = useCallback(() => {
    // There is no single-row read; both halves in parallel cost one round
    // trip, and the id came from a list built the same way.
    const now = new Date();
    return Promise.all([fetchAppointments("upcoming", 30, now), fetchAppointments("past", 30, now)])
      .then(([upcoming, past]) => {
        const found = [...upcoming, ...past].find((r) => r.id === id) ?? null;
        setVisit(found);
        setLoadState(found ? "ready" : "missing");
        // Arrived with the panel open: now that the visit is known, fetch its
        // days — or close the panel, if the status no longer allows a move.
        if (found && openMove) {
          if (RESCHEDULABLE.has(found.status)) void fetchOptions(found);
          else setMode("idle");
        }
        // The patient's own rating, to pre-fill the card. A failed read is an
        // empty form, not an error: sending again replaces whatever the row
        // holds, so nothing is lost.
        if (found && canRate(found)) {
          void fetchMyRating(found.id).then(
            (r) => {
              if (!r) return;
              setStars(r.stars);
              setComment(r.comment ?? "");
              setRated(true);
            },
            () => {},
          );
        }
      })
      .catch(() => setLoadState("failed"));
  }, [id, openMove, fetchOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  const enter = useCallback(
    (next: Mode) => {
      setMode(next);
      setActionError(null);
      setNotice(null);
      if (next === "move" && options === null && visit) void fetchOptions(visit);
    },
    [options, visit, fetchOptions],
  );

  const keep = useCallback(() => {
    setMode("idle");
    setDayPick(null);
    setChosen(null);
    setReason("");
    setActionError(null);
  }, []);

  const pickDay = (key: string) => {
    setDayPick(key);
    setChosen(null);
  };

  /**
   * The functions want a reason of at least eight characters and refuse a
   * shorter one with zod's "Invalid input". Asked for here in a patient's
   * words, with the why beside the field; a short answer gets a prompt, not a
   * number.
   */
  const reasonReady = (): boolean => {
    if (reason.trim().length >= MIN_REASON_CHARS) return true;
    setActionError("Say a little more — one short sentence is enough.");
    return false;
  };

  const submitMove = async () => {
    if (!visit || !chosen || !reasonReady()) return;
    setBusy(true);
    setActionError(null);
    const res = await rescheduleAppointment({
      appointmentId: visit.id,
      newStartsAtIso: chosen.startsAtIso,
      newEndsAtIso: chosen.endsAtIso,
      reason,
    });
    setBusy(false);
    if (!res.ok) {
      // The server's own sentence, verbatim — it is the only useful thing a
      // refused patient is told.
      setActionError(res.error);
      return;
    }
    // What the function wrote: a new row at the slot we sent, carrying the
    // status it reported. No second round trip to read back what we already know.
    setVisit({
      ...visit,
      id: res.data.new_appointment_id,
      startsAtIso: chosen.startsAtIso,
      endsAtIso: chosen.endsAtIso,
      status: res.data.new_status,
    });
    setOptions(null);
    keep();
    setNotice("Your visit has been moved.");
  };

  const submitCancel = async () => {
    if (!visit || !reasonReady()) return;
    setBusy(true);
    setActionError(null);
    const res = await cancelAppointment(visit.id, reason);
    setBusy(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    setVisit({ ...visit, status: res.data.status });
    keep();
    setNotice("Your visit has been cancelled.");
  };

  const submitRating = async () => {
    if (!visit || stars === null) return;
    setRatingBusy(true);
    setRatingError(null);
    setRatingSaved(false);
    const res = await rateVisit({ appointmentId: visit.id, stars, comment });
    setRatingBusy(false);
    if (!res.ok) {
      // "You can rate a visit once it has happened." — the server's sentence,
      // verbatim, if the gate above ever disagrees with the function's.
      setRatingError(res.error);
      return;
    }
    setRated(true);
    setRatingSaved(true);
  };

  /* ─── states without a visit ─────────────────────────────────── */

  if (loadState !== "ready" || !visit) {
    return (
      <Screen title="Your visit" onBack={router.back} trailing={<EmergencyButton />}>
        {loadState === "loading" ? (
          <View style={styles.centre}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading this visit" />
          </View>
        ) : loadState === "failed" ? (
          <Empty
            icon="cloud-offline-outline"
            title="Couldn't load this visit."
            hint="Check your connection and try again."
            action={
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => {
                  setLoadState("loading");
                  void load();
                }}
              />
            }
          />
        ) : (
          <Empty
            icon="calendar-clear-outline"
            title="This visit isn't in your list."
            hint="Go back and pull down to refresh."
            action={<Button label="Back" variant="secondary" onPress={router.back} />}
          />
        )}
      </Screen>
    );
  }

  /* ─── the visit ──────────────────────────────────────────────── */

  const canMove = RESCHEDULABLE.has(visit.status);
  const canCancel = CANCELLABLE.has(visit.status);
  const statusWord = STATUS_LABEL[visit.status];
  const reasonTitle = APPOINTMENT_REASONS.find((r) => r.value === visit.reason)?.title ?? null;
  const awaiting = AWAITING_CLINIC.has(visit.status);
  // Never for cancelled, missed or declined: those are not in `canRate`'s set.
  const ratable = canRate(visit);

  // Options arrive grouped by day, ascending; the strip shows each day once.
  const days = options ? Array.from(new Set(options.map((o) => o.dayKey))) : [];
  const day = dayPick ?? days[0] ?? null;
  const offers = options?.filter((o) => o.dayKey === day) ?? [];
  const hasOptions = options !== null && options.length > 0;

  let footer;
  if (mode === "move") {
    footer = (
      <>
        <ActionError text={actionError} />
        {hasOptions ? (
          <Button
            label="Move this visit"
            onPress={() => void submitMove()}
            busy={busy}
            disabled={!chosen || reason.trim().length === 0}
          />
        ) : null}
        <Button label="Keep it" variant="link" onPress={keep} disabled={busy} />
      </>
    );
  } else if (mode === "cancel") {
    footer = (
      <>
        <ActionError text={actionError} />
        <Button
          label="Cancel this visit"
          variant="secondary"
          onPress={() => void submitCancel()}
          busy={busy}
          disabled={reason.trim().length === 0}
        />
        <Button label="Keep it" variant="link" onPress={keep} disabled={busy} />
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      // `padding` on iOS, `height` on Android — one behaviour for both leaves
      // the submit control under the keyboard on whichever platform loses.
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen
        title="Your visit"
        onBack={router.back}
        trailing={<EmergencyButton />}
        footer={footer}
      >
        <View style={styles.stack}>
          {notice ? (
            <Animated.Text entering={REVEAL} style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Animated.Text>
          ) : null}

          <HeroCard
            leading={
              <Avatar
                name={visit.clinicianName}
                uri={visit.clinicianPhotoUrl}
                size={56}
                tone="onPrimary"
              />
            }
            // The status as a word, here — never a pill on the hero.
            eyebrow={statusWord ? `Visit · ${statusWord}` : "Visit"}
            title={visit.clinicianName}
            subtitle={`${visit.departmentName} · ${visit.hospitalName}`}
            // The day always sits beside the time — ADR 0085 §3's one
            // mitigation for the dawn-anchored clock 0084 §10 recorded.
            tiles={[
              {
                icon: "calendar-outline",
                label: "Day",
                value: dayLabel(dateKey(new Date(visit.startsAtIso))),
              },
              { icon: "time-outline", label: "Time", value: formatTime(visit.startsAtIso) },
            ]}
            // Move before cancel — §13. The white pill is the way to stay.
            actions={
              mode === "idle" && (canMove || canCancel) ? (
                <>
                  {canMove ? (
                    <HeroAction
                      label="Move this visit"
                      variant="primary"
                      onPress={() => enter("move")}
                    />
                  ) : null}
                  {canCancel ? (
                    <HeroAction label="Cancel visit" onPress={() => enter("cancel")} />
                  ) : null}
                </>
              ) : undefined
            }
          />

          {awaiting || reasonTitle || visit.reasonNote ? (
            <View style={styles.card}>
              {awaiting ? (
                // No promise of a message: there is no transport to send one (§11).
                <Text style={styles.body}>The clinic still has to confirm this day.</Text>
              ) : null}
              {reasonTitle ? <Text style={styles.meta}>Reason · {reasonTitle}</Text> : null}
              {visit.reasonNote ? <Text style={styles.note}>{visit.reasonNote}</Text> : null}
            </View>
          ) : null}

          {ratable ? (
            <Section title="Rate this visit">
              <View style={[styles.card, styles.ratingCard]}>
                <StarInput value={stars} onChange={setStars} />
                <Field
                  label="Add a comment (optional)"
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  maxLength={500}
                />
                <ActionError text={ratingError} />
                {ratingSaved ? (
                  <Animated.Text
                    entering={REVEAL}
                    style={styles.notice}
                    accessibilityLiveRegion="polite"
                  >
                    Your rating has been saved.
                  </Animated.Text>
                ) : null}
                <Button
                  label={rated ? "Update rating" : "Send rating"}
                  variant="secondary"
                  onPress={() => void submitRating()}
                  busy={ratingBusy}
                  disabled={stars === null}
                />
              </View>
            </Section>
          ) : null}

          {mode === "move" ? (
            <Animated.View entering={REVEAL} style={styles.panel}>
              <Section title="Move this visit">
                {options === null && !optionsFailed ? (
                  <ActivityIndicator
                    color={colors.primary}
                    accessibilityLabel="Finding the days the clinic has open"
                  />
                ) : optionsFailed ? (
                  <>
                    <Well>{"Couldn't load the days the clinic has open."}</Well>
                    <Button
                      label="Try again"
                      variant="secondary"
                      onPress={() => void fetchOptions(visit)}
                    />
                  </>
                ) : !hasOptions ? (
                  // Not a disabled control: a control that cannot move anything is
                  // a fake affordance. The sentence is a real fact about this clinic.
                  <Well>
                    {visit.departmentName} has no other days open on MedSync, so this visit cannot
                    be moved here yet.
                  </Well>
                ) : (
                  <>
                    {/* ADR 0084 §8: the label names real availability, never the horizon. */}
                    <Text style={styles.legend}>Choose from the days the clinic has open.</Text>
                    <DayStrip days={days} selected={day} onSelect={pickDay} />
                  </>
                )}
              </Section>

              {hasOptions ? (
                <>
                  <Section title="Select time">
                    {/* Every chip is a slot the engine returned for this day,
                        in the hospital's clock (ADR 0085 §3). */}
                    <ChipRow>
                      {offers.map((o) => (
                        <Chip
                          key={o.startsAtIso}
                          label={formatTime(o.startsAtIso)}
                          selected={chosen?.startsAtIso === o.startsAtIso}
                          onPress={() => setChosen(o)}
                        />
                      ))}
                    </ChipRow>
                  </Section>
                  <Field
                    label="Why are you moving it?"
                    hint={REASON_HINT}
                    placeholder={REASON_PLACEHOLDER}
                    value={reason}
                    onChangeText={setReason}
                  />
                </>
              ) : null}
            </Animated.View>
          ) : null}

          {mode === "cancel" ? (
            <Animated.View entering={REVEAL} style={styles.panel}>
              <Section title="Cancel this visit?">
                <Field
                  label="Why are you cancelling?"
                  hint={REASON_HINT}
                  placeholder={REASON_PLACEHOLDER}
                  value={reason}
                  onChangeText={setReason}
                  autoFocus
                />
              </Section>
            </Animated.View>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/**
 * The server's sentence, verbatim. Amber, not red: a refused move is not a
 * clinical emergency, and red on a MedSync surface has to keep meaning one.
 */
function ActionError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Animated.View entering={REVEAL} accessibilityLiveRegion="polite">
      <Well>{text}</Well>
    </Animated.View>
  );
}

/**
 * The caution well every refusal sits in. The amber is the frame and the
 * glyph; the words are the page's own ink, because amber on a white page does
 * not pass as text.
 */
function Well({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.well}>
      <Ionicons name="alert-circle-outline" size={18} color={colors.status.cautionFg} />
      <Text style={styles.wellText}>{children}</Text>
    </View>
  );
}

/**
 * The one field shape wherever a patient types here — a reason, a comment. A
 * sunken well with the brand's edge on focus, an eyebrow label that lifts in
 * weight and ink so focus is never colour alone, and the why beside it when
 * there is one.
 */
function Field({
  label,
  hint,
  placeholder,
  value,
  onChangeText,
  autoFocus,
  multiline,
  maxLength,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  autoFocus?: boolean;
  multiline?: boolean;
  maxLength?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, focused && styles.fieldLabelFocused]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        multiline={multiline}
        maxLength={maxLength}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        // A Done key on a multiline field would only insert a newline.
        returnKeyType={multiline ? undefined : "done"}
        style={[styles.input, multiline && styles.inputMultiline, focused && styles.inputFocused]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    centre: { flex: 1, alignItems: "center", justifyContent: "center" },
    stack: { gap: space[5] },

    // The brand's ink, not the mint: in this palette mint is a fill, and as a
    // word on a white page it would not read.
    notice: {
      fontFamily: font.bodyMedium,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.primary,
    },

    // The details, on a card with its edge — a white card on a white page
    // has no other outline.
    card: {
      gap: space[2],
      padding: space[4],
      borderRadius: radius["2xl"],
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    // Controls want more air between them than lines of text do.
    ratingCard: { gap: space[3] },
    body: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.mutedForeground },
    meta: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },
    note: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: c.foreground },

    panel: { gap: space[5] },
    legend: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },

    // The same field as the two doors': an eyebrow label that lifts in weight
    // and ink on focus, so focus is never colour alone.
    field: { gap: space[2] },
    fieldLabel: {
      fontFamily: font.body,
      fontSize: 12.5,
      letterSpacing: 0.3,
      color: c.mutedForeground,
    },
    fieldLabelFocused: { fontFamily: font.bodyMedium, color: c.primary },
    // Sunken: the muted fill and no edge of its own. The border is drawn in
    // the fill's colour until focus paints it, so nothing shifts on focus.
    input: {
      minHeight: 48,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.muted,
      // The web's inputs carry `--input` (= border) as their edge; a sunken
      // fill alone is invisible on the dark page until focus, and a field a
      // patient cannot find is not a field.
      borderWidth: 1,
      borderColor: c.border,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
    },
    // Room for a few lines, and the text starts at the top on Android.
    inputMultiline: { minHeight: 96, textAlignVertical: "top" },
    inputFocused: { borderColor: c.primary },
    fieldHint: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground },

    well: {
      flexDirection: "row",
      gap: space[2],
      alignItems: "flex-start",
      padding: space[3],
      borderRadius: radius.lg,
      backgroundColor: c.status.cautionBg,
      borderWidth: 1,
      borderColor: c.status.cautionFg,
    },
    wellText: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.foreground,
    },
  });
