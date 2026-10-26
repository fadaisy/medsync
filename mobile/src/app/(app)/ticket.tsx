import type { IconName } from "@/components/tide";
import type { LiveIntake, PatientProfile } from "@/lib/booking";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { Band, Button, Card, Icon, Note, Screen, TextLink } from "@/components/tide";
import { cancelIntake, fetchLiveIntake, fetchPatientProfile, STAGE_WORD } from "@/lib/booking";
import { useSession } from "@/lib/session";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The ticket: the one screen a patient holds while they wait.
 *
 * Status surface, in words and never colour alone: declared → arrived →
 * awaiting_triage → triaged. Terminal rows (completed / cancelled) do not come
 * back from the live-intake read, so "nothing saved today" covers them.
 *
 * **No "N ahead of you" here — and not by oversight (ADR 0084 §6).** The
 * number is honest only when counted against this patient's own row among
 * present patients in this department. Under RLS a patient can SELECT their
 * own intakes and nobody else's (`patient_intakes_select_scoped`), so a count
 * run from the phone returns 0 whatever the room looks like, and "No one is
 * ahead of you" would be a fabricated datum on the highest-anxiety screen in
 * the product. The web computes it server-side over a direct connection. Until
 * an Edge Function or a SECURITY DEFINER RPC serves the count to the patient,
 * this screen says where they stand and what happens next, and no number.
 *
 * Refresh is on focus and on demand (§15), never on a timer: the patient owns
 * the spend, and a screen that reloads itself every 30 seconds for a
 * five-hour wait is a data charge with nothing to show for it.
 *
 * Self-cancel only while `declared` (ADR 0034 §5): once reception has
 * registered the patient, the desk owns the row.
 */
export default function TicketScreen() {
  const router = useRouter();
  const t = useTide();
  const { session } = useSession();
  // §2: the confirmation names the ACCOUNT HOLDER, because the person holding
  // the phone is routinely not the person who will arrive. `full_name` is what
  // signup wrote to auth metadata — the same value `users.full_name` mirrors
  // and the web's `scope.fullName` reads.
  const fullName = session?.user.user_metadata?.full_name;
  const firstName = typeof fullName === "string" ? fullName.split(" ")[0] : undefined;

  // The hospital the hero names, and the patient code reception matches
  // against at the desk (§11) — the one fact on the hero a patient may be
  // asked to read out.
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  // `undefined` = not loaded yet. `null` = nothing live today.
  const [intake, setIntake] = useState<LiveIntake | null | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set by this screen's own cancel, so the patient sees that it went through
  // rather than an empty state that could mean anything.
  const [removed, setRemoved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setChecking(true);
    try {
      const p = await fetchPatientProfile();
      // Both doors need a hospital; the home owns telling the patient so.
      // dismissTo pops to the anchor (tabs); replace would stack a second one.
      if (!p?.hospitalId) {
        router.dismissTo("/(app)/(tabs)");
        return;
      }
      const live = await fetchLiveIntake(p.hospitalId);
      setProfile(p);
      setIntake(live);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your place in line.");
    } finally {
      setChecking(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onCancel = useCallback(async () => {
    if (!intake || busy) return;
    setBusy(true);
    setError(null);
    const res = await cancelIntake(intake.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRemoved(true);
    setIntake(null);
  }, [intake, busy]);

  // Back is `router.back()`, the Tide back link's default; Help is the Screen's red disc.
  const chrome = { back: {}, helpSource: "ticket" };

  if (loadError) {
    return (
      <Screen {...chrome}>
        <View style={{ gap: tSpace[3] }}>
          <Note tone="plain">
            {"Couldn't load your place in line. Check your connection and try again."}
          </Note>
          <Button variant="outline" label="Try again" onPress={() => void load()} />
        </View>
      </Screen>
    );
  }

  // `profile` is set in the same tick as `intake`, so past this line it is in.
  if (intake === undefined || !profile) {
    return (
      <Screen {...chrome}>
        <ActivityIndicator color={t.ink} accessibilityLabel="Loading" />
      </Screen>
    );
  }

  if (removed) {
    return (
      <Screen {...chrome} title="We removed your place.">
        <Card padding={tSpace[4]}>
          <Text style={[tType.label, { color: t.ink }]}>Nothing is saved for you today.</Text>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>
            You can tell us again any time you are coming in today.
          </Text>
        </Card>
        <CenteredLink
          label="Coming to the hospital today"
          onPress={() => router.replace("/(app)/today")}
        />
      </Screen>
    );
  }

  if (!intake) {
    return (
      <Screen {...chrome}>
        <View style={{ gap: tSpace[3] }}>
          <Note tone="plain">
            Nothing is saved for you today. If you are coming to the hospital today, we can save
            your place in line.
          </Note>
          <Button
            label="Coming to the hospital today"
            onPress={() => router.replace("/(app)/today")}
          />
        </View>
      </Screen>
    );
  }

  const stage = STAGES[intake.status] ?? STAGES.declared;
  const step = STEP_OF[intake.status] ?? 0;
  const hospitalName = profile.hospitalName ?? "your hospital";
  const tiles: { icon: IconName; label: string; value: string }[] = [
    { icon: "card", label: "Patient code", value: profile.patientCode },
    { icon: "footprints", label: "Stage", value: (STEPS[step] ?? STEPS[0]).word },
  ];

  return (
    <Screen
      {...chrome}
      title={headlineFor(intake.status, firstName)}
      footer={
        <Button
          variant="outline"
          label="Check for an update"
          onPress={() => void load()}
          busy={checking}
        />
      }
    >
      {/* The place, and the two facts about it that are true: the code the
          desk matches on, and the stage. Never a position (§6), never an
          hour (§10). */}
      <Band>
        <View style={{ gap: 2 }}>
          <Text style={[tType.overline, { color: t.onBand2 }]}>Your place today</Text>
          <Text style={[tType.title, { color: t.onBand }]}>
            {intake.departmentName ?? hospitalName}
          </Text>
          {intake.departmentName ? (
            <Text style={[tType.bodyM, { color: t.onBand2 }]}>{hospitalName}</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: tSpace[2] }}>
          {tiles.map((tile) => (
            <View
              key={tile.label}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: tSpace[2],
                padding: tSpace[2.5],
                borderRadius: tRadius.md,
                backgroundColor: t.bandGlass,
              }}
            >
              {/* Decorative: the label beside it names the fact. */}
              <Icon name={tile.icon} size={18} color={t.onBand} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.onBand2 }]}>
                  {tile.label}
                </Text>
                <Text style={[tType.labelS, { color: t.onBand }]} numberOfLines={2}>
                  {tile.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Band>

      <Card padding={tSpace[4]}>
        {/* The line as a timeline. State is a shape and a word — a tick for
            done, a ring and weight for now — never the tint alone. */}
        <View>
          {STEPS.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <View
                key={s.word}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: tSpace[3] }}
              >
                <View style={{ alignItems: "center" }}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: done ? t.primary : t.surface,
                      borderWidth: done ? 0 : current ? 2 : 1,
                      borderColor: current ? t.primary : t.lineStrong,
                    }}
                  >
                    {done ? (
                      <Icon name="check" size={14} color={t.onPrimary} strokeWidth={2.6} />
                    ) : null}
                  </View>
                  {i < STEPS.length - 1 ? (
                    <View style={{ width: 1, height: tSpace[5], backgroundColor: t.line }} />
                  ) : null}
                </View>
                <Text
                  style={[
                    tType.bodyM,
                    { lineHeight: 24 },
                    current ? { fontFamily: tFont.semibold, color: t.ink } : { color: t.ink3 },
                  ]}
                >
                  {s.word}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={{ height: 1, backgroundColor: t.line, marginVertical: tSpace[1] }} />

        <Text style={[tType.label, { color: t.ink }]}>{stage.lead}</Text>
        <Text style={[tType.bodyM, { color: t.ink2 }]}>{stage.body}</Text>
      </Card>

      {intake.status === "declared" ? (
        confirming ? (
          <Card padding={tSpace[4]}>
            <Text style={[tType.label, { color: t.ink }]}>
              Take your place out of today’s line? You can tell us again any time today.
            </Text>
            {/* Amber, not red: a cancel that did not go through is not a clinical
                emergency. The amber is the frame and the glyph; the words carry the
                meaning. */}
            {error ? (
              <View accessibilityLiveRegion="polite">
                <Note tone="caution" icon="alert">
                  {error}
                </Note>
              </View>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: tSpace[2],
                marginTop: tSpace[1],
              }}
            >
              <Button
                variant="soft"
                size="md"
                label="Keep my place"
                onPress={() => setConfirming(false)}
                disabled={busy}
              />
              <Button
                variant="outline"
                size="md"
                label="Yes, remove my place"
                onPress={() => void onCancel()}
                busy={busy}
              />
            </View>
          </Card>
        ) : (
          <CenteredLink label="I am not coming today" onPress={() => setConfirming(true)} />
        )
      ) : null}
    </Screen>
  );
}

/** A text link on its own line, centred. */
function CenteredLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={{ alignItems: "center" }}>
      <TextLink label={label} onPress={onPress} />
    </View>
  );
}

/* ─── copy — the web ticket's words, verbatim ───────────────────── */

interface Stage {
  /** One line naming where the patient stands. */
  lead: string;
  /** What happens next — and nothing about when. */
  body: string;
}

const STAGES: Record<string, Stage> = {
  declared: {
    lead: "Go to the hospital when you can.",
    body: "Reception will register you at the desk when you arrive. You will be seen in turn. We cannot tell you the hour.",
  },
  arrived: {
    lead: "You will be seen in turn.",
    body: "We cannot tell you the hour. A nurse will see you first for a quick check.",
  },
  awaiting_triage: {
    lead: "You will be seen in turn.",
    body: "We cannot tell you the hour. A nurse will see you first for a quick check.",
  },
  triaged: {
    lead: "Follow the directions the team gave you.",
    body: "If you are not sure where to go, ask at the desk.",
  },
};

/**
 * The line as three steps, each named with the headline's own words. `arrived`
 * and `awaiting_triage` are one step to the patient — both mean "at the desk,
 * not yet seen" — so the four statuses fold to three.
 */
const STEPS = [
  { word: STAGE_WORD.declared },
  { word: STAGE_WORD.arrived },
  { word: STAGE_WORD.triaged },
] as const;

const STEP_OF: Record<string, number> = {
  declared: 0,
  arrived: 1,
  awaiting_triage: 1,
  triaged: 2,
};

function headlineFor(intakeStatus: string, firstName: string | undefined): string {
  switch (intakeStatus) {
    case "declared":
      return firstName ? `We saved a place for ${firstName}.` : "We saved your place.";
    case "arrived":
    case "awaiting_triage":
      return "You are in the line.";
    case "triaged":
      return "The nurse has seen you.";
    default:
      return "Your place in line.";
  }
}
