import type { NoteSelection } from "@/features/visits/symptom-note-logic";
import type { CatalogMode } from "@/lib/symptoms";
import type { CategoryKey, SubmissionAudience } from "@shared/symptom-catalog/types";
import { useState } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import {
  t as say,
  searchItems,
  visibleCategories,
  visibleItems,
} from "@shared/symptom-catalog/classify";
import { MAX_SELECTED_ITEMS } from "@shared/symptom-catalog/types";
import { SYMPTOMS_NOTE } from "@shared/symptoms";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { Button, Card, Chip, Icon, Press, TextField } from "@/components/tide";
import { StepTitle } from "@/features/visits/parts";
import { noteTier } from "@/features/visits/symptom-note-logic";
import { useTide } from "@/theme/theme";
import { tFont, tRadius, tSpace, tType } from "@/theme/tide";

const ROW = 48;
/** About four rows show; the rest scroll inside the box (owner, 18 Oct 2026). */
const LIST_MAX = ROW * 4 + 4;

/**
 * "Anything the doctor should know?" on Ask for a day (board AskFlow, 18 Oct
 * 2026): the symptom catalogue v0.1 (MS-PRD-SYM-001, ADR 0098) by area or by
 * search, each choice with its own questions. What is chosen goes to the
 * clinic as words (`bookingSymptoms`); the catalogue's tier is said to the
 * patient as advice only — a danger sign points to Help, a "be seen today"
 * item to today's options — and never changes the booking. Rendered only
 * where the gate allows (`useCatalogMode`): draft content carries the
 * watermark, and with the gate off the note box alone is shown.
 */
export function SymptomNote({
  mode,
  audience,
  value,
  onChange,
}: {
  mode: CatalogMode;
  audience: SubmissionAudience;
  value: NoteSelection;
  onChange: (next: NoteSelection) => void;
}) {
  const t = useTide();
  const router = useRouter();
  const categories = visibleCategories(CATALOG, audience);
  const [area, setArea] = useState<CategoryKey | undefined>(categories[0]?.key);
  const [query, setQuery] = useState("");

  const items = visibleItems(CATALOG, audience);
  const shown = query.trim()
    ? searchItems(CATALOG, audience, query)
    : items.filter((i) => i.category === area);
  const chosen = value.items.flatMap((k) => items.filter((i) => i.key === k));
  const advice = noteTier(value, audience, CATALOG);
  const full = value.items.length >= MAX_SELECTED_ITEMS;

  const toggle = (key: string) => {
    if (value.items.includes(key)) {
      const { [key]: _gone, ...rest } = value.qualifiers;
      onChange({ items: value.items.filter((k) => k !== key), qualifiers: rest });
    } else if (!full) {
      onChange({ ...value, items: [...value.items, key] });
    }
  };
  const answer = (item: string, q: string, option: string) =>
    onChange({
      ...value,
      qualifiers: { ...value.qualifiers, [item]: { ...value.qualifiers[item], [q]: option } },
    });

  return (
    <View style={{ gap: tSpace[3] }}>
      <View style={{ gap: 2 }}>
        <StepTitle>Anything the doctor should know?</StepTitle>
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          Optional. Choose what you feel, or type it below.
        </Text>
      </View>
      {mode === "draft_watermarked" ? (
        <Text
          style={[
            tType.micro,
            {
              alignSelf: "flex-start",
              fontFamily: tFont.bold,
              color: t.ink2,
              backgroundColor: t.surface3,
              borderRadius: 6,
              paddingHorizontal: tSpace[2],
              paddingVertical: 3,
              overflow: "hidden",
            },
          ]}
        >
          Unsigned clinical content — draft, for review only.
        </Text>
      ) : null}

      {chosen.map((item) => (
        <Card key={item.key} padding={tSpace[3]} radius={tRadius.row}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: tSpace[2] }}>
            <Text style={[tType.label, { flex: 1, fontSize: 15, color: t.ink }]}>
              {say(CATALOG, item.labelKey)}
            </Text>
            <Press
              onPress={() => toggle(item.key)}
              accessibilityLabel={`Remove ${say(CATALOG, item.labelKey)}`}
              hitSlop={8}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: t.surface3,
              }}
            >
              <Icon name="close" size={16} color={t.ink} />
            </Press>
          </View>
          {(item.qualifiers ?? []).map((q) => (
            <View key={q.key} style={{ gap: tSpace[1.5] }}>
              <Text style={[tType.caption, { fontFamily: tFont.semibold, color: t.ink3 }]}>
                {say(CATALOG, q.promptKey)}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tSpace[1.5] }}>
                {q.options.map((o) => (
                  <Chip
                    key={o.key}
                    size="sm"
                    label={say(CATALOG, o.labelKey)}
                    selected={value.qualifiers[item.key]?.[q.key] === o.key}
                    onPress={() => answer(item.key, q.key, o.key)}
                  />
                ))}
              </View>
            </View>
          ))}
        </Card>
      ))}

      {advice?.tier === "E" ? (
        <Card padding={tSpace[3.5]} radius={tRadius.row}>
          <Text accessibilityRole="header" style={[tType.heading, { color: t.ink }]}>
            {say(CATALOG, "tier.E")}
          </Text>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>
            {`You chose “${advice.because}”. Do not wait for a booked day.`}
          </Text>
          <Button label="Help" variant="danger" onPress={() => router.push("/help")} />
        </Card>
      ) : advice?.tier === "U" ? (
        <Card padding={tSpace[3.5]} radius={tRadius.row}>
          <Text accessibilityRole="header" style={[tType.label, { fontSize: 15, color: t.ink }]}>
            {say(CATALOG, "tier.U")}
          </Text>
          <Text style={[tType.bodyM, { color: t.ink2 }]}>
            {`You chose “${advice.because}”. A walk-in today may be better than a booked day.`}
          </Text>
          <Button
            label="See today's options"
            variant="outline"
            onPress={() => router.push("/book/today")}
          />
        </Card>
      ) : null}

      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Search, for example cough or tummy pain"
        accessibilityLabel="Search the symptom list"
      />
      {query.trim() ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: tSpace[1.5] }}
        >
          {categories.map((c) => (
            <Chip
              key={c.key}
              size="sm"
              label={say(CATALOG, c.labelKey)}
              selected={c.key === area}
              onPress={() => setArea(c.key)}
            />
          ))}
        </ScrollView>
      )}
      <Card padding={0} radius={tRadius.row}>
        <ScrollView nestedScrollEnabled style={{ maxHeight: LIST_MAX }}>
          {shown.map((item, n) => {
            const on = value.items.includes(item.key);
            const label = say(CATALOG, item.labelKey);
            return (
              <Press
                key={item.key}
                haptic={false}
                onPress={() => toggle(item.key)}
                disabled={!on && full}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !on && full }}
                accessibilityLabel={label}
                style={{
                  minHeight: ROW,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tSpace[2.5],
                  paddingHorizontal: tSpace[3.5],
                  paddingVertical: tSpace[2],
                  borderTopWidth: n ? 1 : 0,
                  borderTopColor: t.line,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? t.primary : t.surface,
                    borderWidth: on ? 0 : 2,
                    borderColor: t.lineStrong,
                  }}
                >
                  {on ? (
                    <Icon name="check" size={14} color={t.onPrimary} strokeWidth={2.6} />
                  ) : null}
                </View>
                <Text style={[tType.bodyM, { flex: 1, color: t.ink }]}>{label}</Text>
              </Press>
            );
          })}
          {shown.length ? null : (
            <Text style={[tType.caption, { padding: tSpace[3.5], color: t.ink3 }]}>
              Nothing on the list matches. Type it in the box below.
            </Text>
          )}
        </ScrollView>
      </Card>
      <Text style={[tType.caption, { fontFamily: tFont.medium, color: t.ink3 }]}>
        {SYMPTOMS_NOTE}
      </Text>
    </View>
  );
}
