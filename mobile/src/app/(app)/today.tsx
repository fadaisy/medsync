import type { HospitalOption, PatientProfile, WalkInDepartment } from "@/lib/booking";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  Icon,
  IconDisc,
  Note,
  Press,
  Screen,
  TextField,
  TextLink,
} from "@/components/tide";
import { pickStyle, StepTitle } from "@/features/visits/parts";
import {
  choosePrimaryHospital,
  declareIntake,
  fetchHospitals,
  fetchLiveIntake,
  fetchPatientProfile,
  fetchWalkInDepartments,
} from "@/lib/booking";
import { clearPendingCatalogDraft, getPendingCatalogDraft } from "@/lib/pending-symptoms";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Door A — "Coming to the hospital today" (ADR 0084 §1, §2), the primary door.
 *
 * One POST. The screen asks as little as it can:
 *
 *   - **The department is not a question the patient answers (§5).** The ADR
 *     wants the hospital's general-outpatient / assessment department
 *     pre-selected, with the rest behind a disclosure. No column marks such a
 *     row — `hospital_departments` is (id, hospital_id, parent_id, name, slug)
 *     — and guessing it from the NAME would be a heuristic deciding where a
 *     patient is sent, which is exactly what §5 forbids. So the interim the
 *     web already runs: one department open → it is named, not chosen; more
 *     than one → a flat, unpriced list. No count on any department, ever.
 *   - **Closed is not a calendar (§11).** When no department is open the
 *     primary exit is the building, and booking is a plain text link.
 *   - **A refusal because a ticket already exists is not an error.** The
 *     transport keeps only the server's sentence, so the ticket is recovered
 *     by re-reading it: if a live one exists, the patient is taken there
 *     instead of being shown a message they cannot act on.
 */
export default function TodayScreen() {
  const t = useTide();
  const router = useRouter();

  // `undefined` until the profile is in; by then it has a hospital, or the
  // screen has already left.
  const [profile, setProfile] = useState<PatientProfile | undefined>();
  const [departments, setDepartments] = useState<WalkInDepartment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [allHospitalsShown, setAllHospitalsShown] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await fetchPatientProfile();
      // Both doors need a hospital; the home owns telling the patient so.
      // dismissTo pops to the anchor (tabs); replace would stack a second one.
      if (!p?.hospitalId) {
        router.dismissTo("/(app)/(tabs)");
        return;
      }
      const [live, depts, allHospitals] = await Promise.all([
        fetchLiveIntake(p.hospitalId),
        fetchWalkInDepartments(p.hospitalId),
        // The chips: every active hospital, this one first. A failed read
        // hides the chips, never the clinics.
        fetchHospitals().catch(() => [] as HospitalOption[]),
      ]);
      setHospitals([
        ...allHospitals.filter((h) => h.id === p.hospitalId),
        ...allHospitals.filter((h) => h.id !== p.hospitalId),
      ]);
      // Already in today's line: the ticket IS the answer to "coming today".
      if (live) {
        router.replace("/(app)/ticket");
        return;
      }
      setDepartments(depts);
      setProfile(p);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load this screen.");
    }
  }, [router]);

  // On focus, like the home: a patient coming back from the booking link the
  // closed state offers gets the clinic's current state, not the one they left.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = departments.filter((d) => d.openNow);
  const closed = departments.filter((d) => !d.openNow);
  const only = open.length === 1 ? open[0] : null;
  // A choice made before a focus-refresh closed that clinic does not survive it.
  const chosenId = only?.id ?? open.find((d) => d.id === selectedId)?.id ?? null;
  const hospitalId = profile?.hospitalId ?? null;

  // No `useCallback`: the React Compiler memoises this, and a manual one over
  // `chosenId` — derived from a filtered array — is one it refuses to preserve.
  const onSubmit = async () => {
    if (!hospitalId || !chosenId || busy) return;
    setBusy(true);
    setError(null);
    // ADR 0098: a catalog report filed before this door rides with the ticket;
    // the server links it and reads its tier.
    const report = getPendingCatalogDraft();
    const res = await declareIntake({
      hospitalId,
      receivingDepartmentId: chosenId,
      presentingComplaint: note.trim() || null,
      symptomSubmissionId: report?.submissionId,
    });
    if (!res.ok) {
      // A 409 for an existing ticket carries its id in `details`, which the
      // transport drops — so ask the database instead. A live ticket found
      // now is the thing the refusal was about; go there.
      const live = await fetchLiveIntake(hospitalId).catch(() => null);
      if (!live) {
        // The server's sentence, verbatim: "You already have a booking at this
        // department today — check in when you arrive instead." is something
        // a patient can act on; "something went wrong" is not.
        setError(res.error);
        setBusy(false);
        return;
      }
    }
    clearPendingCatalogDraft();
    router.replace("/(app)/ticket");
  };

  // Back is `router.back()`, the Tide back link's default; Help is the Screen's red disc.
  const chrome = { back: {}, helpSource: "today" };

  if (loadError) {
    return (
      <Screen {...chrome}>
        <View style={{ gap: tSpace[3] }}>
          <Note tone="plain">
            {"Couldn't load this screen. Check your connection and try again."}
          </Note>
          <Button
            variant="outline"
            label="Try again"
            onPress={() => {
              setLoadError(null);
              void load();
            }}
          />
        </View>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen {...chrome} title="Coming to the hospital today">
        <ActivityIndicator color={t.ink} accessibilityLabel="Loading" />
      </Screen>
    );
  }

  const hospitalName = profile.hospitalName ?? "your hospital";
  const switchTo = async (id: string) => {
    setSwitching(id);
    setError(null);
    try {
      await choosePrimaryHospital(id);
      setSelectedId(null);
      await load();
    } catch {
      setError("Couldn't switch hospital — try again in a moment.");
    } finally {
      setSwitching(null);
    }
  };

  const head = (
    <View style={{ gap: tSpace[3] }}>
      <Text style={[tType.bodyM, { color: t.ink }]}>
        We save your place in line. You will be seen in turn. We cannot tell you the hour.
      </Text>
      {/* Yours first and filled, two beside it, the directory beyond that:
          tapping another makes it your hospital (the same write the web's
          chips make) and the clinics below follow. */}
      {hospitals.length > 1 ? (
        <ChipRow>
          {(allHospitalsShown ? hospitals : hospitals.slice(0, 3)).map((h) => (
            <Chip
              key={h.id}
              label={switching === h.id ? "Switching…" : h.name}
              selected={h.id === profile?.hospitalId}
              onPress={() => {
                if (h.id !== profile?.hospitalId && switching === null) void switchTo(h.id);
              }}
            />
          ))}
          {hospitals.length > 3 && !allHospitalsShown ? (
            <Chip
              label={`View more (${hospitals.length - 3})`}
              selected={false}
              onPress={() => setAllHospitalsShown(true)}
            />
          ) : null}
        </ChipRow>
      ) : (
        <Text style={[tType.overline, { color: t.ink3 }]}>{hospitalName}</Text>
      )}
    </View>
  );
  // Named rather than silently omitted: a patient told to go to a specific
  // clinic has to see that it is the clinic, not the app, that is closed.
  const closedNote =
    closed.length > 0 ? (
      <Text style={[tType.bodyS, { color: t.ink2 }]}>
        Not taking walk-ins at {hospitalName} right now: {closed.map((d) => d.name).join(" · ")}.
      </Text>
    ) : null;

  // §11. Every department is inside a scheduling policy that has closed for
  // the day, and the patient has just said they are coming today. The primary
  // exit is the hospital; booking is demoted to a plain link.
  if (open.length === 0) {
    return (
      <Screen {...chrome} title="Coming to the hospital today">
        {head}
        <Card padding={tSpace[4]}>
          <Text style={[tType.heading, { color: t.ink }]}>Go to the hospital.</Text>
          {/* "the emergency entrance is open at all hours" belongs here only
              where someone has verified it. Nothing records that; not written. */}
          <Text style={[tType.bodyM, { color: t.ink }]}>
            Reception can register you when you arrive.
          </Text>
          {closedNote}
          <View style={{ alignItems: "flex-start", paddingVertical: tSpace[1] }}>
            <TextLink
              label="Ask for a day — the clinic confirms"
              onPress={() => router.push("/(app)/book")}
            />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      {...chrome}
      title="Coming to the hospital today"
      footer={
        <>
          {/* Amber, not red: a refused request is not a clinical emergency. The
              amber is the frame and the glyph; the words carry the meaning. */}
          {error ? (
            <View accessibilityLiveRegion="polite">
              <Note tone="caution" icon="alert">
                {error}
              </Note>
            </View>
          ) : null}
          <Button
            label="Save a place in line"
            onPress={() => void onSubmit()}
            busy={busy}
            disabled={!chosenId}
          />
        </>
      }
    >
      {head}

      {only ? (
        <View style={{ gap: tSpace[2] }}>
          <Text style={[tType.caption, { color: t.ink3 }]}>Where you are going</Text>
          <DepartmentCard name={only.name} />
        </View>
      ) : (
        <View style={{ gap: tSpace[2] }}>
          <StepTitle>Which clinic were you told to go to?</StepTitle>
          {/* Two tiles a row: a hospital's clinics on one screen, not a
              scroll of 76pt rows. */}
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[2] }}
            accessibilityRole="radiogroup"
          >
            {open.map((d) => (
              <View key={d.id} style={{ width: "48.5%" }}>
                <DepartmentCard
                  name={d.name}
                  checked={d.id === selectedId}
                  onPress={() => setSelectedId(d.id)}
                  compact
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {closedNote}

      <TextField
        label="What brings you in? (optional)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
        placeholder="A short note helps the team prepare — e.g. follow-up for diabetes, persistent cough for 3 days."
        accessibilityLabel="What brings you in? Optional."
      />
    </Screen>
  );
}

/**
 * One clinic: a disc, the name, the one fact about it that matters today. With
 * `onPress` it is a radio in the list of open clinics; without, it is the
 * named destination. Chosen is the Tide pick (lagoon tint, a thicker ring)
 * and a tick, so the choice is a mark as well as a tint.
 */
function DepartmentCard({
  name,
  checked = false,
  onPress,
  compact = false,
}: {
  name: string;
  checked?: boolean;
  onPress?: () => void;
  /** A grid tile: smaller disc, the name on two lines at most, no "Open now". */
  compact?: boolean;
}) {
  const t = useTide();
  const body = (
    <>
      <IconDisc name="building" size={compact ? 32 : 44} color={t.ink} bg={t.surface2} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[compact ? tType.labelS : tType.label, { color: t.ink }]} numberOfLines={2}>
          {name}
        </Text>
        {compact ? null : (
          <Text style={[tType.bodyS, { fontFamily: tFont.medium, color: t.ink2 }]}>Open now</Text>
        )}
      </View>
      {checked ? <Icon name="check" size={18} color={t.accentText} strokeWidth={2.4} /> : null}
    </>
  );
  const frame = {
    flexDirection: "row",
    alignItems: "center",
    gap: compact ? tSpace[2] : tSpace[3],
    minHeight: compact ? 56 : 76,
    padding: compact ? tSpace[3] : tSpace[4],
    borderRadius: tRadius.row,
    ...pickStyle(t, checked),
  } as const;

  if (!onPress) return <View style={frame}>{body}</View>;

  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={name}
      style={frame}
    >
      {body}
    </Press>
  );
}
