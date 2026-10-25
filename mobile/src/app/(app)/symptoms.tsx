import type { AudienceChoice, StepsSelection } from "@/features/symptoms/logic";
import type { BookingReceipt, PatientProfile } from "@/lib/booking";
import type { CatalogItem, Classification, ServiceLineHint } from "@shared/symptom-catalog/types";
import type { SymptomDuration } from "@shared/symptoms";
import { useEffect, useRef, useState } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import {
  classify,
  t as say,
  visibleCategories,
  visibleItems,
} from "@shared/symptom-catalog/classify";
import { MAX_SELECTED_ITEMS } from "@shared/symptom-catalog/types";
import { symptomDurationLabel } from "@shared/symptoms";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { BookingDone } from "@/components/patient/booking-done";
import { Button, Note, Screen, SkeletonCard } from "@/components/tide";
import { DangerResult, HelpPanel } from "@/features/symptoms/danger";
import {
  DEFAULT_AUDIENCE,
  followUps,
  interruptOf,
  noteFor,
  toAudience,
} from "@/features/symptoms/logic";
import { AskStep, PickStep, ResultCard, StepHead, ToldUs } from "@/features/symptoms/steps";
import { fetchAppointments, fetchPatientProfile, newIdempotencyKey } from "@/lib/booking";
import { setPendingCatalogDraft } from "@/lib/pending-symptoms";
import { requestSameDay, submitSymptoms, useCatalogMode } from "@/lib/symptoms";
import { ForcedScheme, useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/** Navigation, not diagnosis: where the routine outcome points (PRD §2 non-goals). */
const SERVICE_LINE_WORD: Record<ServiceLineHint, string> = {
  general: "the general clinic",
  cardiology: "the heart clinic",
  diabetes_ncd: "the diabetes and pressure clinic",
  renal: "the kidney clinic",
  eye: "the eye clinic",
  ent: "the ear, nose and throat clinic",
  maternity: "the maternity clinic",
  paediatrics: "the children's clinic",
  mental_health: "the mental health clinic",
  surgery: "the surgical clinic",
  dermatology: "the skin clinic",
  orthopaedics: "the bones and joints clinic",
  tb: "the TB clinic",
};

type Step = "pick" | "ask" | "review";
type Sub = { id: string; tier: Classification["tier"] };

/**
 * "Something is wrong" (MS-PRD-SYM-001 §7, ADR 0098; board D, owner
 * 19 Oct 2026): three steps in Tide. 1 · tick what fits in one body area
 * (Book's area opens first; the chips change it), emergency signs in their
 * own card; 2 · each chosen item's own follow-up questions and when it
 * started; 3 · what to do, with what the clinic will see.
 *
 * An emergency answer, alone or by a qualifier or a combination rule, opens
 * Help in place the moment it is chosen (local `classify`, offline). The
 * report is submitted when the patient picks a door (the server recomputes
 * the tier) and rides to that door through the pending draft. A failed
 * submit keeps every choice on screen and says so. Permanently light (Law 3).
 */
export default function SymptomsScreen() {
  return (
    <ForcedScheme scheme="light">
      <Body />
    </ForcedScheme>
  );
}

function Body() {
  const t = useTide();
  const router = useRouter();
  const params = useLocalSearchParams<{
    item?: string;
    area?: string;
    /** Ask for a day with a doctor (Home): the day request goes back to them. */
    doctor?: string;
    department?: string;
    hospital?: string;
  }>();
  const mode = useCatalogMode();
  const [profile, setProfile] = useState<PatientProfile | null | undefined>();

  const [step, setStep] = useState<Step>("pick");
  const [choice, setChoice] = useState<AudienceChoice>(DEFAULT_AUDIENCE);
  const [items, setItems] = useState<string[]>(() =>
    CATALOG.items.some((i) => i.key === params.item) ? [params.item as string] : [],
  );
  const [qualifiers, setQualifiers] = useState<StepsSelection["qualifiers"]>({});
  const [declined, setDeclined] = useState<string[]>([]);
  const [area, setArea] = useState<string | null>(
    () => CATALOG.items.find((i) => i.key === params.item)?.category ?? params.area ?? null,
  );
  const [note, setNote] = useState("");
  const [since, setSince] = useState<SymptomDuration | null>(null);
  const [classification, setClassification] = useState<Classification | null>(null);
  const [done, setDone] = useState<{ receipt: BookingReceipt; startsAtIso: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noSlot, setNoSlot] = useState(false);
  // The server's answer, once it has one; the same-day key rides with it.
  const submissionRef = useRef<Sub | null>(null);
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPatientProfile().then(
      (p) => live && setProfile(p),
      () => live && setProfile(null),
    );
    return () => {
      live = false;
    };
  }, []);

  if (mode === null || profile === undefined) {
    return (
      <Screen back={{ label: "Back" }} title="Something is wrong">
        <SkeletonCard label="Loading the questions" lines={4} />
      </Screen>
    );
  }

  if (mode === "off") {
    return (
      <Screen back={{ label: "Back" }} title="Something is wrong">
        <Note tone="plain">
          This is not available yet. You can still book a visit or come to the hospital today.
        </Note>
        <Button label="Back" variant="outline" onPress={router.back} />
      </Screen>
    );
  }

  const audience = toAudience(choice);
  const selection: StepsSelection = { audience, pregnant: choice.pregnant, items, qualifiers };
  const visible = visibleItems(CATALOG, audience);
  const categories = visibleCategories(CATALOG, audience);
  const shownArea = categories.some((c) => c.key === area) ? (area as string) : categories[0].key;
  const chosen = visible.filter((i) => items.includes(i.key));
  const interrupt = interruptOf(selection, declined, CATALOG);
  const hospitalId = profile?.hospitalId ?? null;
  const hospitalName = profile?.hospitalName ?? null;
  const shown = classification ?? classify(selection, CATALOG);
  const tier = shown.tier;
  const freeText = noteFor(note, since);
  const watermark =
    mode === "draft_watermarked" ? (
      <Note tone="caution" icon="alert">
        Unsigned clinical content: draft, for review only.
      </Note>
    ) : null;

  /** A changed choice is a new report: the old id no longer describes it. */
  const changed = () => {
    submissionRef.current = null;
    keyRef.current = null;
    setClassification(null);
    setNoSlot(false);
  };

  const toggle = (item: CatalogItem) => {
    changed();
    if (items.includes(item.key)) {
      setItems(items.filter((k) => k !== item.key));
      const { [item.key]: _dropped, ...rest } = qualifiers;
      setQualifiers(rest);
      // Removed, so choosing it again opens Help again.
      setDeclined(declined.filter((k) => k !== item.key));
      return;
    }
    if (items.length >= MAX_SELECTED_ITEMS) return; // the report's cap; the server refuses more
    setItems([...items, item.key]);
  };

  const changeChoice = (next: AudienceChoice) => {
    changed();
    setChoice(next);
    // What the new audience cannot see is dropped, not carried silently.
    const still = new Set(visibleItems(CATALOG, toAudience(next)).map((i) => i.key));
    setItems(items.filter((k) => still.has(k)));
    setDeclined(declined.filter((k) => still.has(k)));
  };

  const answer = (itemKey: string, qualifierKey: string, optionKey: string) => {
    changed();
    setQualifiers({
      ...qualifiers,
      [itemKey]: { ...qualifiers[itemKey], [qualifierKey]: optionKey },
    });
  };

  /** To the emergency lines with the choices, unsent; self-harm goes to the calm screen (PRD §5.5). */
  const toHelp = (item: CatalogItem | null) => {
    setPendingCatalogDraft({
      audience,
      items,
      qualifiers,
      submissionId: submissionRef.current?.id ?? null,
      tier: "E",
      catalogVersion: CATALOG.version,
    });
    if (item?.flags?.includes("crisis_route")) {
      router.push("/(app)/emergency/crisis");
      return;
    }
    router.push({
      pathname: "/(app)/emergency/lines",
      params: {
        from: "catalog",
        ...(submissionRef.current ? { submission: submissionRef.current.id } : {}),
        ...(item ? { item: item.key } : {}),
      },
    });
  };

  const helpPanel = interrupt ? (
    <HelpPanel
      item={interrupt}
      hospitalName={hospitalName}
      emergencyPhone={profile?.emergencyPhone ?? null}
      onHelp={() => {
        setDeclined([...declined, interrupt.key]);
        toHelp(interrupt);
      }}
      onNotNow={() => setDeclined([...declined, interrupt.key])}
    />
  ) : null;

  /** Submit once per selection; the server's tier replaces the local one. Null = failed, said. */
  const ensureSubmission = async (): Promise<Sub | null> => {
    if (submissionRef.current) return submissionRef.current;
    const res = await submitSymptoms({
      hospitalId,
      audience,
      pregnant: choice.pregnant,
      items,
      qualifiers,
      freeText,
    });
    if (!res.ok) {
      setError(`${res.error} Your choices are kept. Try again.`);
      return null;
    }
    submissionRef.current = { id: res.data.submission_id, tier: res.data.tier };
    setClassification({
      ...shown,
      tier: res.data.tier,
      reasons: res.data.reasons,
      flags: res.data.flags,
      serviceLineHint: res.data.service_line_hint,
      catalogVersion: res.data.catalog_version,
    });
    return submissionRef.current;
  };

  const run = async (then: (sub: Sub) => Promise<void> | void) => {
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
      setDone({ receipt: res.data, startsAtIso });
    });

  /** Today's line or a day: the report rides there in the pending draft. */
  const door = (pathname: "/book/today" | "/book/day") =>
    run((sub) => {
      setPendingCatalogDraft({
        audience,
        items,
        qualifiers,
        freeText: freeText || null,
        submissionId: sub.id,
        tier: sub.tier,
        catalogVersion: CATALOG.version,
      });
      const { doctor, department, hospital } = params;
      const withDoctor =
        pathname === "/book/day" && doctor
          ? { doctor, ...(department ? { department } : {}), ...(hospital ? { hospital } : {}) }
          : {};
      router.push({ pathname, params: { reason: "new_concern", ...withDoctor } });
    });

  if (done) {
    return (
      <Screen
        title="You have a place today"
        footer={<Button label="Done" onPress={() => router.dismissTo("/(app)/(tabs)")} />}
      >
        <BookingDone
          receipt={done.receipt}
          startsAtIso={done.startsAtIso}
          where={hospitalName ?? "your hospital"}
        />
      </Screen>
    );
  }

  const back = () => {
    if (step === "pick") router.back();
    else setStep(step === "review" ? "ask" : "pick");
  };
  const canGo = step === "pick" ? chosen.length > 0 || note.trim() !== "" : since !== null;
  const because = chosen
    .filter((i) => shown.reasons.includes(i.key))
    .map((i) => say(CATALOG, i.labelKey));
  const told = [
    ...chosen.map((i) => say(CATALOG, i.labelKey)),
    ...(note.trim() ? [`In your words: ${note.trim()}`] : []),
    ...(since
      ? [
          `Started: ${symptomDurationLabel(since)
            .replace(/^Started /, "")
            .toLowerCase()}`,
        ]
      : []),
  ];
  const second = (label: string, onPress: () => void) => (
    <Button label={label} variant="outline" size="md" disabled={busy} onPress={onPress} />
  );

  const footer =
    step === "review" ? (
      <View style={{ gap: tSpace[2] }}>
        {tier === "E" ? (
          <View style={{ gap: tSpace[2] }}>
            <Button
              label="Get help now"
              icon="phone"
              variant="danger"
              onPress={() => toHelp(chosen.find((i) => i.key === shown.reasons[0]) ?? null)}
            />
            {second("Book a visit instead", () => void door("/book/day"))}
          </View>
        ) : tier === "U" ? (
          <View style={{ gap: tSpace[2] }}>
            {noSlot ? (
              <Button
                label="Join today's line"
                busy={busy}
                onPress={() => void door("/book/today")}
              />
            ) : (
              <Button
                label="Come to the hospital today"
                busy={busy}
                onPress={() => void onSameDay()}
              />
            )}
            {second("Ask for a day instead", () => void door("/book/day"))}
          </View>
        ) : (
          <View style={{ gap: tSpace[2] }}>
            <Button label="Ask for a day" busy={busy} onPress={() => void door("/book/day")} />
            {second("Come today instead", () => void door("/book/today"))}
          </View>
        )}
      </View>
    ) : (
      <View style={{ gap: tSpace[2] }}>
        {step === "pick" ? (
          <Text style={[tType.labelS, { color: t.ink2 }]}>
            {chosen.length
              ? `${chosen.length} chosen${chosen.some((i) => i.category !== shownArea) ? ", from more than one area" : ""}`
              : "Tap what fits, or write it in your words."}
          </Text>
        ) : null}
        <Button
          label={step === "pick" ? "Continue" : "See what to do"}
          disabled={!canGo}
          onPress={() => {
            if (step === "pick") {
              setStep("ask");
              return;
            }
            setClassification(classify(selection, CATALOG));
            setStep("review");
          }}
        />
      </View>
    );

  return (
    <Screen
      back={{ label: "Back", onPress: back }}
      overline="Book a visit"
      overlineColor={t.area.visits}
      title="Something is wrong"
      helpSource="symptoms"
      footer={footer}
    >
      {step === "pick" ? (
        <PickStep
          choice={choice}
          onChoice={changeChoice}
          showPregnancy={profile?.sex !== "male"}
          categories={categories}
          area={shownArea}
          onArea={setArea}
          items={visible}
          selected={items}
          onToggle={toggle}
          helpPanel={helpPanel}
          note={note}
          onNote={(next) => {
            changed();
            setNote(next);
          }}
          watermark={watermark}
        />
      ) : step === "ask" ? (
        <View style={{ gap: tSpace[4] }}>
          {helpPanel}
          <AskStep
            questions={followUps(chosen)}
            answers={qualifiers}
            onAnswer={answer}
            since={since}
            onSince={(next) => {
              changed();
              setSince(next);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: tSpace[4] }}>
          <StepHead n={3} words="What to do" />
          {watermark}
          {tier === "E" ? (
            <DangerResult because={because} />
          ) : (
            <ResultCard
              tier={tier}
              lede={
                tier === "R" && shown.serviceLineHint
                  ? `Start with ${SERVICE_LINE_WORD[shown.serviceLineHint]}.`
                  : tier === "U"
                    ? `The earliest place today at ${hospitalName ?? "your hospital"}.`
                    : null
              }
            />
          )}
          <ToldUs lines={told} onChange={() => setStep("pick")} />
          {error ? (
            <Note tone="caution" icon="alert">
              {error}
            </Note>
          ) : null}
          <Text style={[tType.caption, { color: t.ink3 }]}>{say(CATALOG, "catalog.note")}</Text>
        </View>
      )}
    </Screen>
  );
}
