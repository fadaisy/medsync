import type { ReactNode } from "react";
import { useState } from "react";
import { SUMMARY_HEADINGS } from "@patient/visit-summary";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Button, Card, Icon, Note, Screen, TextLink } from "@/components/tide";
import { addToMyMedicines, useRecord } from "@/data/records";
import { RecordsStatusBlock } from "@/features/care-more/lab-parts";
import { formatDateLong } from "@/lib/booking";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * One shared visit summary (ADR 0203, ADR 0342 §2): what the clinician chose
 * to share, in the web's own headings. A medicine shows its name and "As your
 * clinician prescribed", never an amount (law L5); "Add to my medicines" puts
 * it on the patient's own list with no dose times, as on the web.
 */
export default function RecordScreen() {
  const t = useTide();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRecord(id);
  const v = r.record;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const add = async (prescriptionId: string) => {
    setBusy(prescriptionId);
    setError(null);
    const out = await addToMyMedicines(id, prescriptionId);
    setBusy(null);
    if (!out.ok) setError({ id: prescriptionId, message: out.message });
  };

  if (!v)
    return (
      <Screen back={{ label: "Visit records" }} title="Your visit" helpSource="records">
        {r.status === "ready" ? (
          <Note tone="plain">That visit record isn&apos;t available.</Note>
        ) : (
          <RecordsStatusBlock
            status={r.status}
            message={r.message}
            count={0}
            empty=""
            onRetry={r.reload}
          />
        )}
      </Screen>
    );

  return (
    <Screen
      back={{ label: "Visit records" }}
      title="Your visit"
      gap={tSpace[3]}
      helpSource="records"
    >
      <View style={{ gap: 2, marginTop: -tSpace[2] }}>
        <Text style={[tType.bodyS, { color: t.ink2 }]}>
          {formatDateLong(v.startedAt)} · {v.hospitalName}
          {v.clinician ? ` · ${v.clinician}` : ""}
        </Text>
        {r.message ? <Text style={[tType.bodyS, { color: t.ink3 }]}>{r.message}</Text> : null}
      </View>

      <Card>
        <Text style={[tType.label, { color: t.ink }]}>{v.outcome}</Text>
        {v.outcomeNote ? (
          <Text style={[tType.bodyS, { color: t.ink2 }]}>{v.outcomeNote}</Text>
        ) : null}
      </Card>

      {v.found.length ? (
        <Section title={SUMMARY_HEADINGS.found}>
          {v.found.map((f) => (
            <Line key={f.id} text={f.text} sub={f.detail} />
          ))}
        </Section>
      ) : null}

      {v.medicines.length ? (
        <Section title={SUMMARY_HEADINGS.medicines}>
          {v.medicines.map((m) => (
            <View key={m.prescriptionId} style={{ gap: tSpace[2] }}>
              <Line text={m.name} sub="As your clinician prescribed" />
              {m.inMyMedicines ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[1] }}>
                  <Icon name="check" size={16} color={t.accentText} strokeWidth={2.6} />
                  <Text style={[tType.labelS, { color: t.accentText }]}>In your medicines</Text>
                </View>
              ) : (
                <Button
                  size="sm"
                  variant="soft"
                  label={busy === m.prescriptionId ? "Adding…" : "Add to my medicines"}
                  accessibilityLabel={`Add ${m.name} to my medicines`}
                  busy={busy === m.prescriptionId}
                  disabled={busy !== null}
                  style={{ alignSelf: "flex-start" }}
                  onPress={() => void add(m.prescriptionId)}
                />
              )}
              {error?.id === m.prescriptionId ? (
                <Text accessibilityLiveRegion="polite" style={[tType.bodyS, { color: t.ink2 }]}>
                  {error.message}
                </Text>
              ) : null}
            </View>
          ))}
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            A medicine you add has no dose times yet. Set them in your medicines.
          </Text>
          <TextLink label="Your medicines" onPress={() => router.push("/care/medicines")} />
        </Section>
      ) : null}

      {v.stopped.length ? (
        <Section title={SUMMARY_HEADINGS.stopped}>
          {v.stopped.map((m) => (
            <Line key={m.id} text={m.name} />
          ))}
        </Section>
      ) : null}

      {v.tests.length ? (
        <Section title={SUMMARY_HEADINGS.tests}>
          {v.tests.map((x) => (
            <Line key={x.id} text={x.name} />
          ))}
          {v.testsNote ? <Note style={{ padding: tSpace[2.5] }}>{v.testsNote}</Note> : null}
        </Section>
      ) : null}

      {v.next ? (
        <Section title={SUMMARY_HEADINGS.next}>
          <Text style={[tType.bodyM, { color: t.ink }]}>{v.next}</Text>
          <TextLink label="Your visits" onPress={() => router.push("/visits")} />
        </Section>
      ) : null}

      {v.comeBackIf ? (
        <Section title="Come back if">
          <Text style={[tType.bodyM, { color: t.ink }]}>{v.comeBackIf}</Text>
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTide();
  return (
    <Card style={{ gap: tSpace[2] }}>
      <Text accessibilityRole="header" style={[tType.heading, { color: t.ink }]}>
        {title}
      </Text>
      {children}
    </Card>
  );
}

function Line({ text, sub }: { text: string; sub?: string | null }) {
  const t = useTide();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[tType.labelS, { color: t.ink }]}>{text}</Text>
      {sub ? <Text style={[tType.bodyS, { color: t.ink2 }]}>{sub}</Text> : null}
    </View>
  );
}
