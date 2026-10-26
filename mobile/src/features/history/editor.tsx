import type { Draft, Section } from "@/features/history/logic";
import type { ReportedItem, ReportedOption } from "@patient/reported-history";
import { useState } from "react";
import {
  OTHER,
  OTHER_MAX,
  REPORTED_CATALOGUE,
  reportedLabel,
  searchOptions,
} from "@patient/reported-history";
import { Text, View } from "react-native";

import {
  Button,
  Chip,
  ChipRow,
  FieldLabel,
  Icon,
  Note,
  Press,
  Segments,
  Sheet,
  TextField,
  TextLink,
} from "@/components/tide";
import { HISTORY_OFF, removeReported, saveReported } from "@/data/history";
import { useCardIdentity } from "@/data/me";
import {
  draftOf,
  draftProblem,
  EMPTY_DRAFT,
  rowsOf,
  SECTION_KIND,
  SECTION_WORDS,
  toggleReaction,
} from "@/features/history/logic";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const LIST: Record<Section, readonly ReportedOption[]> = {
  conditions: REPORTED_CATALOGUE.conditions,
  allergies: REPORTED_CATALOGUE.allergySubstances,
  family: REPORTED_CATALOGUE.familyConditions,
};

/**
 * Add or change one entry: search the catalogue (or write it in your own words), then the
 * section's own questions: since when and still have it (conditions), the reaction and how bad
 * (allergies), who (family). A change saves a new version; Remove retires it.
 */
export function HistoryEditor({
  section,
  editing,
  existing,
  onClose,
}: {
  section: Section;
  editing: ReportedItem | "new" | null;
  existing: readonly ReportedItem[];
  onClose: () => void;
}) {
  const t = useTide();
  const { session } = useSession();
  const sex = useCardIdentity(session?.user.id ?? null, null).sex;
  const words = SECTION_WORDS[section];
  // The screen keys this sheet by the entry, so each opening starts from that entry.
  const [draft, setDraft] = useState<Draft>(() =>
    editing && editing !== "new" ? draftOf(editing) : EMPTY_DRAFT,
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const isNew = editing === "new";
  const now = useNow();

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const problem = draftProblem(section, draft, now);

  // Conditions and allergies: one entry each, so what is listed already is left out of the search.
  const taken = new Set(
    section === "family"
      ? []
      : existing.filter((i) => i !== editing && i.itemId !== OTHER).map((i) => i.itemId),
  );
  const matches = searchOptions(LIST[section], query, sex).filter((o) => !taken.has(o.id));
  // Family: a relative who already has this condition listed is not offered again.
  const relativesTaken = new Set(
    existing
      .filter((i) => i !== editing && i.itemId === draft.itemId && i.itemId !== OTHER)
      .map((i) => i.relation),
  );

  const save = async () => {
    setTried(true);
    if (problem || busy || !editing) return;
    setBusy(true);
    setError(null);
    const res = await saveReported(rowsOf(section, draft), isNew ? undefined : editing.id);
    setBusy(false);
    if (res === "saved") onClose();
    else
      setError(res === "off" ? HISTORY_OFF : "Couldn't save. Check your connection and try again.");
  };

  const remove = async () => {
    if (busy || !editing || isNew) return;
    setBusy(true);
    setError(null);
    const res = await removeReported(editing.id);
    setBusy(false);
    if (res === "saved") onClose();
    else
      setError(
        res === "off" ? HISTORY_OFF : "Couldn't remove it. Check your connection and try again.",
      );
  };

  const picked = draft.itemId
    ? reportedLabel({
        kind: SECTION_KIND[section],
        itemId: draft.itemId,
        otherText: draft.otherText,
      })
    : null;

  return (
    <Sheet
      visible={editing !== null}
      onClose={onClose}
      overline={words.title}
      title={isNew ? words.add : `Change ${words.one}`}
    >
      {!draft.itemId ? (
        <>
          <TextField
            label={words.pick}
            value={query}
            onChangeText={setQuery}
            placeholder="Type to search"
            right={
              <View style={{ paddingRight: tSpace[3.5] }}>
                <Icon name="search" size={18} color={t.ink3} />
              </View>
            }
          />
          <View
            style={{ borderRadius: tRadius.md, backgroundColor: t.surface2, overflow: "hidden" }}
          >
            {matches.map((o, n) => (
              <Press
                key={o.id}
                onPress={() => patch({ itemId: o.id })}
                accessibilityLabel={o.label}
                haptic={false}
                style={{
                  minHeight: 48,
                  justifyContent: "center",
                  paddingHorizontal: tSpace[3.5],
                  borderTopWidth: n ? 1 : 0,
                  borderTopColor: t.surface3,
                }}
              >
                <Text style={[tType.labelS, { color: t.ink }]}>{o.label}</Text>
              </Press>
            ))}
            {!matches.length ? (
              <Text style={[tType.bodyS, { color: t.ink2, padding: tSpace[3.5] }]}>
                Not on the list.
              </Text>
            ) : null}
          </View>
          <TextLink
            label="Not on the list? Write it in your own words"
            onPress={() => patch({ itemId: OTHER, otherText: query.trim() })}
          />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tSpace[2] }}>
            <Text style={[tType.label, { color: t.ink, flex: 1 }]}>
              {draft.itemId === OTHER ? "In your own words" : picked}
            </Text>
            <TextLink label="Change" onPress={() => patch({ itemId: null, otherText: "" })} />
          </View>
          {draft.itemId === OTHER ? (
            <TextField
              label={words.pick}
              value={draft.otherText}
              onChangeText={(otherText) => patch({ otherText })}
              maxLength={OTHER_MAX}
              placeholder="For example: glaucoma"
            />
          ) : null}

          {section === "conditions" ? (
            <>
              <TextField
                label="Since which year?"
                optional
                value={draft.year}
                onChangeText={(year) => patch({ year: year.replace(/\D/g, "").slice(0, 4) })}
                keyboardType="number-pad"
                placeholder={String(now.getFullYear() - 3)}
                maxLength={4}
              />
              <View style={{ gap: tSpace[1.5] }}>
                <FieldLabel>Do you still have it?</FieldLabel>
                <Segments
                  options={[
                    { key: "still", label: "Still have it" },
                    { key: "resolved", label: "Resolved" },
                  ]}
                  value={draft.resolved ? "resolved" : "still"}
                  onChange={(k) => patch({ resolved: k === "resolved" })}
                />
              </View>
            </>
          ) : null}

          {section === "allergies" ? (
            <>
              <View style={{ gap: tSpace[1.5] }}>
                <FieldLabel optional>What happened?</FieldLabel>
                <ChipRow>
                  {REPORTED_CATALOGUE.reactions.map((o) => (
                    <Chip
                      key={o.id}
                      size="sm"
                      label={o.label}
                      selected={draft.reactions.includes(o.id)}
                      onPress={() => patch({ reactions: toggleReaction(draft.reactions, o.id) })}
                    />
                  ))}
                </ChipRow>
              </View>
              <View style={{ gap: tSpace[1.5] }}>
                <FieldLabel optional>How bad was it?</FieldLabel>
                <ChipRow>
                  {REPORTED_CATALOGUE.severity.map((o) => (
                    <Chip
                      key={o.id}
                      size="sm"
                      label={o.label}
                      selected={draft.severity === o.id}
                      onPress={() => patch({ severity: draft.severity === o.id ? null : o.id })}
                    />
                  ))}
                </ChipRow>
              </View>
            </>
          ) : null}

          {section === "family" ? (
            <View style={{ gap: tSpace[1.5] }}>
              <FieldLabel>{isNew ? "Who? Choose everyone it applies to" : "Who?"}</FieldLabel>
              <ChipRow>
                {REPORTED_CATALOGUE.relations
                  .filter((o) => !relativesTaken.has(o.id))
                  .map((o) => (
                    <Chip
                      key={o.id}
                      size="sm"
                      label={o.label}
                      selected={draft.relations.includes(o.id)}
                      onPress={() =>
                        patch({
                          relations: draft.relations.includes(o.id)
                            ? draft.relations.filter((r) => r !== o.id)
                            : isNew
                              ? [...draft.relations, o.id]
                              : [o.id],
                        })
                      }
                    />
                  ))}
              </ChipRow>
            </View>
          ) : null}

          {tried && problem ? <Note tone="caution">{problem}</Note> : null}
          {error ? <Note tone="plain">{error}</Note> : null}
          <Button label="Save" busy={busy} onPress={() => void save()} />
          {!isNew ? (
            <Button
              label="Remove"
              variant="outline"
              disabled={busy}
              onPress={() => void remove()}
            />
          ) : null}
          <Text style={[tType.caption, { color: t.ink3, textAlign: "center" }]}>
            Your clinician confirms this at your next visit.
          </Text>
        </>
      )}
    </Sheet>
  );
}
