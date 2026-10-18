import type { Section } from "@/features/history/logic";
import type { ReportedItem } from "@patient/reported-history";
import { useState } from "react";
import {
  allergyLine,
  conditionLine,
  isSensitive,
  labelIn,
  REPORTED_CATALOGUE,
  reportedLabel,
} from "@patient/reported-history";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { Button, Card, Chip, ChipRow, Icon, Note, Screen } from "@/components/tide";
import { HISTORY_OFF, setNoKnownAllergies, useHistory } from "@/data/history";
import { useCardIdentity } from "@/data/me";
import { HistoryEditor } from "@/features/history/editor";
import { asSection, SECTION_WORDS } from "@/features/history/logic";
import { useSession } from "@/lib/session";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * My conditions, Allergies and Family history (ADR 0355): one screen per section, picked from the
 * same catalogue the clinician's clerking desk uses. What the patient adds is theirs to change or
 * remove; their care team sees it, and at the next visit the desk shows it as patient-reported for
 * the clinician to confirm or dismiss. Nothing here becomes a clinical record on its own.
 */
export default function HistoryScreen() {
  const t = useTide();
  const section: Section = asSection(useLocalSearchParams<{ section?: string }>().section);
  const words = SECTION_WORDS[section];
  const h = useHistory();
  const { session } = useSession();
  const legacy = useCardIdentity(session?.user.id ?? null, null).conditions;
  const [editing, setEditing] = useState<ReportedItem | "new" | null>(null);
  const [nkaBusy, setNkaBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const items =
    section === "conditions" ? h.conditions : section === "allergies" ? h.allergies : h.family;

  const onNka = async () => {
    if (nkaBusy) return;
    setNkaBusy(true);
    setNote(null);
    const res = await setNoKnownAllergies(!h.noKnownAllergies, h);
    setNkaBusy(false);
    if (res === "off") setNote(HISTORY_OFF);
    else if (res === "failed") setNote("Couldn't save. Check your connection and try again.");
  };

  const sub = (i: ReportedItem) =>
    i.kind === "condition"
      ? conditionLine(i, "patient")
      : i.kind === "allergy"
        ? allergyLine(i)
        : (labelIn(REPORTED_CATALOGUE.relations, i.relation) ?? "Relative");

  return (
    <Screen back={{ label: "Me" }} title={words.title} gap={tSpace[3]} helpSource="history">
      <Text style={[tType.bodyS, { color: t.ink2, marginTop: -tSpace[2] }]}>
        {section === "family"
          ? "Conditions that run in your family, from the list your clinician uses."
          : "Pick from the list your clinician uses."}{" "}
        Your care team can see what you add, and your clinician confirms it at your next visit.
      </Text>

      {h.off ? <Note tone="plain">{HISTORY_OFF}</Note> : null}
      {h.error ? (
        <Note tone="plain">Couldn&apos;t load your list. Check your connection.</Note>
      ) : null}
      {note ? <Note tone="plain">{note}</Note> : null}
      {section === "conditions" && legacy.length ? (
        <Note tone="info">
          {`On your profile from before: ${legacy.join(", ")}. Add each one from the list so your clinician can confirm it.`}
        </Note>
      ) : null}

      {section === "allergies" && !h.allergies.length && !h.off ? (
        <Card style={{ gap: tSpace[2] }}>
          <Text style={[tType.label, { color: t.ink }]}>No known allergies?</Text>
          <Text style={[tType.bodyS, { color: t.ink2 }]}>
            {h.noKnownAllergies
              ? "You said you have no known allergies. Adding an allergy replaces this."
              : "If you have never reacted badly to a medicine, food or anything else, say so."}
          </Text>
          <ChipRow>
            <Chip
              label={nkaBusy ? "Saving…" : "I have no known allergies"}
              selected={h.noKnownAllergies}
              onPress={() => void onNka()}
            />
          </ChipRow>
        </Card>
      ) : null}

      {h.loading ? <Text style={[tType.bodyS, { color: t.ink3 }]}>Loading…</Text> : null}
      {!h.loading && !items.length && !h.off && !(section === "allergies" && h.noKnownAllergies) ? (
        <Text style={[tType.bodyS, { color: t.ink3 }]}>{words.empty}</Text>
      ) : null}

      {items.map((i) => (
        <Card
          key={i.id}
          onPress={() => setEditing(i)}
          accessibilityLabel={`${reportedLabel(i)}. ${sub(i)}. Change`}
          style={{ flexDirection: "row", alignItems: "center", gap: tSpace[3] }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[tType.label, { color: t.ink }]}>{reportedLabel(i)}</Text>
            <Text style={[tType.bodyS, { color: t.ink2 }]}>{sub(i)}</Text>
            <Text style={[tType.caption, { color: t.ink3 }]}>
              {isSensitive(i) ? "Private · " : ""}Not yet confirmed by a clinician
            </Text>
          </View>
          <Icon name="forward" size={20} color={t.ink3} />
        </Card>
      ))}

      {!h.off ? (
        <Button label={words.add} icon="plus" variant="accent" onPress={() => setEditing("new")} />
      ) : null}

      {section === "conditions" ? (
        <Note tone="plain" icon="lock">
          HIV, TB, mental-health and pregnancy entries are private: only clinicians allowed to see
          them do, and they never show on your card.
        </Note>
      ) : null}

      <HistoryEditor
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        section={section}
        editing={editing}
        existing={items}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}
