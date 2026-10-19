import type { CatalogSelection } from "@/components/symptoms/catalog";
import type { BookingReceipt, PatientProfile } from "@/lib/booking";
import type { CatalogItem, Classification } from "@shared/symptom-catalog/types";
import { useEffect, useRef, useState } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { classify, visibleItems } from "@shared/symptom-catalog/classify";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BookingDone } from "@/components/patient/booking-done";
import { EmergencyButton } from "@/components/patient/emergency-button";
import { SymptomCatalog } from "@/components/symptoms/catalog";
import { ReviewOutcome } from "@/components/symptoms/review-outcome";
import { Watermark } from "@/components/symptoms/watermark";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Screen } from "@/components/ui/screen";
import { fetchAppointments, fetchPatientProfile, newIdempotencyKey } from "@/lib/booking";
import { setPendingCatalogDraft } from "@/lib/pending-symptoms";
import { requestSameDay, submitSymptoms, useCatalogMode } from "@/lib/symptoms";
import { ForcedScheme, useTheme } from "@/theme/theme";
import { space } from "@/theme/tokens";

type Step =
  | { kind: "pick"; initial?: Partial<CatalogSelection> }
  | { kind: "review"; selection: CatalogSelection; classification: Classification }
  | { kind: "done"; receipt: BookingReceipt; startsAtIso: string };

/**
 * "What's wrong?" — the catalog pre-step to booking (PRD MS-PRD-SYM-001 §7;
 * ADR 0098). S1–S3 live in `SymptomCatalog`; this screen owns S4: it
 * classifies locally the moment Continue is tapped (offline, the bundled
 * package), submits when the patient picks a next step (the server
 * recomputes), and hands the report to the door they chose — the same-day
 * path, today's queue, or a booking — through the pending draft.
 *
 * Permanently light (Law 3): the whole tree sits in `ForcedScheme`. A
 * failed submit keeps every choice on screen and says so; nothing is lost
 * to a dropped packet.
 */
export default function SymptomsScreen() {
  return (
    <ForcedScheme scheme="light">
      <Body />
    </ForcedScheme>
  );
}

function Body() {
  const router = useRouter();
  const { item, area } = useLocalSearchParams<{ item?: string; area?: string }>();
  const { colors } = useTheme();
  const mode = useCatalogMode();
  const [profile, setProfile] = useState<PatientProfile | null | undefined>();
  const [step, setStep] = useState<Step>(() => ({
    kind: "pick",
    initial: item ? { items: [item] } : undefined,
  }));
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noSlot, setNoSlot] = useState(false);
  // The server's answer, once it has one; the same-day key rides with it.
  const submissionRef = useRef<{ id: string; tier: Classification["tier"] } | null>(null);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPatientProfile().then(
      (p) => {
        if (live) setProfile(p);
      },
      () => {
        if (live) setProfile(null);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const chrome = { onBack: router.back, trailing: <EmergencyButton /> };

  if (mode === null || profile === undefined) {
    return (
      <Screen {...chrome}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
        </View>
      </Screen>
    );
  }

  if (mode === "off") {
    return (
      <Screen {...chrome}>
        <Empty
          icon="list-outline"
          title="This is not available yet."
          hint="You can still book a visit or come to the hospital today."
          action={<Button variant="secondary" label="Back" onPress={router.back} />}
        />
      </Screen>
    );
  }

  const hospitalId = profile?.hospitalId ?? null;
  const hospitalName = profile?.hospitalName ?? null;
  const emergencyPhone = profile?.emergencyPhone ?? null;
  const showPregnancy = profile?.sex !== "male";

  const toEmergency = (itemKey: string | null) =>
    router.push({
      pathname: "/(app)/emergency/lines",
      params: {
        from: "catalog",
        ...(submissionRef.current ? { submission: submissionRef.current.id } : {}),
        ...(itemKey ? { item: itemKey } : {}),
      },
    });

  /** The interrupt's "Get help now": the choices go with the patient, unsent. */
  const onInterruptHelp = (chosen: CatalogItem, selection: CatalogSelection) => {
    setPendingCatalogDraft({
      audience: selection.audience,
      items: selection.items,
      qualifiers: selection.qualifiers,
      catalogVersion: CATALOG.version,
    });
    // PRD §5.5: self-harm goes to the calm screen, not the numbers.
    if (chosen.flags?.includes("crisis_route")) router.push("/(app)/emergency/crisis");
    else toEmergency(chosen.key);
  };

  if (step.kind === "pick") {
    return (
      <SymptomCatalog
        {...chrome}
        showPregnancy={showPregnancy}
        initial={step.initial}
        // Book's "Something is wrong" door: open on the area tapped, the first time only.
        openCategory={step.initial ? undefined : area}
        watermark={mode === "draft_watermarked"}
        hospitalName={hospitalName}
        emergencyPhone={emergencyPhone}
        onContinue={(selection) => {
          // A changed selection is a new report: the old id no longer describes it.
          submissionRef.current = null;
          keyRef.current = null;
          setError(null);
          setNoSlot(false);
          setStep({ kind: "review", selection, classification: classify(selection, CATALOG) });
        }}
        onGetHelp={onInterruptHelp}
      />
    );
  }

  if (step.kind === "done") {
    return (
      <Screen
        trailing={<EmergencyButton />}
        footer={<Button label="Done" onPress={() => router.dismissTo("/(app)/(tabs)")} />}
      >
        <BookingDone
          receipt={step.receipt}
          startsAtIso={step.startsAtIso}
          where={hospitalName ?? "your hospital"}
        />
      </Screen>
    );
  }

  const { selection, classification } = step;
  const chosen = visibleItems(CATALOG, selection.audience).filter((i) =>
    selection.items.includes(i.key),
  );

  /** Submit once per selection; the server's tier replaces the local one. Null = failed, said. */
  const ensureSubmission = async () => {
    if (submissionRef.current) return submissionRef.current;
    const res = await submitSymptoms({
      hospitalId,
      audience: selection.audience,
      pregnant: selection.pregnant,
      items: selection.items,
      qualifiers: selection.qualifiers,
      freeText,
    });
    if (!res.ok) {
      setError(`${res.error} Your choices are kept — try again.`);
      return null;
    }
    submissionRef.current = { id: res.data.submission_id, tier: res.data.tier };
    setStep({
      kind: "review",
      selection,
      classification: {
        ...classification,
        tier: res.data.tier,
        reasons: res.data.reasons,
        flags: res.data.flags,
        serviceLineHint: res.data.service_line_hint,
        catalogVersion: res.data.catalog_version,
      },
    });
    return submissionRef.current;
  };

  const carry = (sub: { id: string; tier: Classification["tier"] }) =>
    setPendingCatalogDraft({
      audience: selection.audience,
      items: selection.items,
      qualifiers: selection.qualifiers,
      freeText: freeText.trim() || null,
      submissionId: sub.id,
      tier: sub.tier,
      catalogVersion: CATALOG.version,
    });

  const run = async (
    then: (sub: { id: string; tier: Classification["tier"] }) => Promise<void>,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const sub = await ensureSubmission();
      if (sub) await then(sub);
    } finally {
      setBusy(false);
    }
  };

  const onSameDay = () =>
    run(async (sub) => {
      if (!hospitalId) {
        setError("Choose your hospital on the home screen first.");
        return;
      }
      keyRef.current ??= newIdempotencyKey();
      const res = await requestSameDay({
        hospitalId,
        submissionId: sub.id,
        idempotencyKey: keyRef.current,
      });
      if (!res.ok) {
        setError(res.error);
        setNoSlot(res.noSlot);
        return;
      }
      // The receipt carries no instant; the row does. Today, if it cannot be read.
      const rows = await fetchAppointments("upcoming-active", 5).catch(() => []);
      const startsAtIso =
        rows.find((r) => r.id === res.data.appointment_id)?.startsAtIso ?? new Date().toISOString();
      setStep({ kind: "done", receipt: res.data, startsAtIso });
    });

  const onQueue = () =>
    run(async (sub) => {
      carry(sub);
      router.push("/(app)/today");
    });

  const onBook = () =>
    run(async (sub) => {
      carry(sub);
      router.push("/(app)/book");
    });

  return (
    <Screen
      title="What's wrong?"
      subtitle="Your report and the next step"
      onBack={() => setStep({ kind: "pick", initial: selection })}
      trailing={<EmergencyButton />}
    >
      <View style={styles.stack}>
        {mode === "draft_watermarked" ? <Watermark /> : null}
        <ReviewOutcome
          items={chosen}
          classification={classification}
          freeText={freeText}
          onFreeText={setFreeText}
          hospitalName={hospitalName}
          busy={busy}
          error={error}
          noSlot={noSlot}
          onSameDay={() => void onSameDay()}
          onQueue={() => void onQueue()}
          onBook={() => void onBook()}
          onGetHelp={() => {
            setPendingCatalogDraft({
              audience: selection.audience,
              items: selection.items,
              qualifiers: selection.qualifiers,
              submissionId: submissionRef.current?.id ?? null,
              tier: classification.tier,
              catalogVersion: CATALOG.version,
            });
            toEmergency(classification.reasons[0] ?? null);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  stack: { gap: space[4] },
});
