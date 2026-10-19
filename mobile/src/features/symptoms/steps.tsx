import type { AudienceChoice } from "@/features/symptoms/logic";
import type { CatalogItem, Category, Qualifier } from "@shared/symptom-catalog/types";
import type { SymptomDuration } from "@shared/symptoms";
import type { ReactNode } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t as say } from "@shared/symptom-catalog/classify";
import { MAX_FREE_TEXT, TIER_LABEL_KEY } from "@shared/symptom-catalog/types";
import { SYMPTOM_DURATIONS } from "@shared/symptoms";
import { Text, View } from "react-native";

import { Button, Card, Chip, ChipRow, Icon, Press, TextField } from "@/components/tide";
import { DangerSigns } from "@/features/symptoms/danger";
import { CHILD_BANDS } from "@/features/symptoms/logic";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The three symptom steps (board D, owner 19 Oct 2026): what fits, a few
 * questions, what to do. Plain words from the catalogue only; no severity
 * scale. The screen owns the state and the actions; these draw it.
 */

export function StepHead({ n, words }: { n: 1 | 2 | 3; words: string }) {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[2] }}>
      <Text style={[tType.labelS, { color: t.ink2 }]}>{`Step ${n} of 3 · ${words}`}</Text>
      <View style={{ flexDirection: "row", gap: tSpace[1.5] }} accessibilityElementsHidden>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: i <= n ? t.primary : t.line,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function PickStep({
  choice,
  onChoice,
  showPregnancy,
  categories,
  area,
  onArea,
  items,
  selected,
  onToggle,
  helpPanel,
  note,
  onNote,
  watermark,
}: {
  choice: AudienceChoice;
  onChoice: (next: AudienceChoice) => void;
  showPregnancy: boolean;
  categories: Category[];
  area: string;
  onArea: (key: string) => void;
  /** Everything this audience can see; the step shows the area's. */
  items: CatalogItem[];
  selected: string[];
  onToggle: (item: CatalogItem) => void;
  /** The in-place Help panel, when an answer points to an emergency. */
  helpPanel: ReactNode;
  note: string;
  onNote: (next: string) => void;
  watermark: ReactNode;
}) {
  const t = useTide();
  const inArea = items.filter((i) => i.category === area);
  const signs = inArea.filter((i) => i.tier === "E");
  const rest = inArea.filter((i) => i.tier !== "E");
  const pregnancyApplies = choice.who === "other" || (choice.who === "me" && showPregnancy);
  // An emergency from another area still shows its panel here, under the area's own card or alone.
  const panelElsewhere = helpPanel && !signs.length;

  return (
    <View style={{ gap: tSpace[4] }}>
      <StepHead n={1} words="What you feel" />
      {watermark}
      <View style={{ gap: tSpace[1.5] }}>
        <Text accessibilityRole="header" style={[tType.title, { color: t.ink }]}>
          What fits how you feel?
        </Text>
        <Text style={[tType.bodyM, { color: t.ink2 }]}>
          Tap all that fit. None fit? Say it in your words at the bottom.
        </Text>
      </View>

      <View style={{ gap: tSpace[2] }}>
        <ChipRow scroll>
          {(
            [
              ["me", "Me"],
              ["child", "A child"],
              ["other", "Someone else"],
            ] as const
          ).map(([who, label]) => (
            <Chip
              key={who}
              label={label}
              selected={choice.who === who}
              onPress={() => onChoice({ ...choice, who })}
            />
          ))}
          {pregnancyApplies ? (
            <Chip
              label={say(CATALOG, "audience.pregnant")}
              selected={choice.pregnant}
              onPress={() => onChoice({ ...choice, pregnant: !choice.pregnant })}
            />
          ) : null}
        </ChipRow>
        {choice.who === "child" ? (
          <ChipRow scroll>
            {CHILD_BANDS.map((band) => (
              <Chip
                key={band}
                label={say(CATALOG, `audience.${band}`)}
                selected={choice.band === band}
                onPress={() => onChoice({ ...choice, band })}
              />
            ))}
          </ChipRow>
        ) : null}
      </View>

      <ChipRow scroll>
        {categories.map((c) => (
          <Chip
            key={c.key}
            label={say(CATALOG, c.labelKey)}
            selected={c.key === area}
            onPress={() => onArea(c.key)}
          />
        ))}
      </ChipRow>

      {signs.length ? (
        <DangerSigns
          signs={signs.map((i) => ({ key: i.key, label: say(CATALOG, i.labelKey) }))}
          selected={selected}
          onPress={(key) => onToggle(signs.find((i) => i.key === key) as CatalogItem)}
        >
          {helpPanel}
        </DangerSigns>
      ) : null}
      {panelElsewhere ? helpPanel : null}

      {rest.length ? (
        <Card padding={0} radius={tRadius.card} style={{ gap: 0, overflow: "hidden" }}>
          {rest.map((item, i) => {
            const on = selected.includes(item.key);
            return (
              <Press
                key={item.key}
                haptic={false}
                onPress={() => onToggle(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={say(CATALOG, item.labelKey)}
                style={{
                  minHeight: 64,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tSpace[3.5],
                  paddingHorizontal: tSpace[4],
                  paddingVertical: tSpace[3],
                  backgroundColor: on ? t.accentTint : t.surface,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: t.line,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? t.primary : t.surface,
                    borderWidth: on ? 0 : 2,
                    borderColor: t.lineStrong,
                  }}
                >
                  {on ? (
                    <Icon name="check" size={15} color={t.onPrimary} strokeWidth={3.2} />
                  ) : null}
                </View>
                <Text
                  style={[tType.labelS, { flex: 1, fontSize: 16, lineHeight: 21, color: t.ink }]}
                >
                  {say(CATALOG, item.labelKey)}
                </Text>
              </Press>
            );
          })}
        </Card>
      ) : null}

      <TextField
        label="Not here? Say it in your words"
        optional
        value={note}
        onChangeText={onNote}
        multiline
        maxLength={MAX_FREE_TEXT}
        placeholder="For example: a cough that keeps me up at night"
      />
    </View>
  );
}

export function AskStep({
  questions,
  answers,
  onAnswer,
  since,
  onSince,
}: {
  questions: { item: CatalogItem; q: Qualifier }[];
  answers: Record<string, Record<string, string>>;
  onAnswer: (itemKey: string, qualifierKey: string, optionKey: string) => void;
  since: SymptomDuration | null;
  onSince: (next: SymptomDuration) => void;
}) {
  const t = useTide();
  const card = (key: string, about: string, prompt: string, chips: ReactNode) => (
    <Card key={key} padding={tSpace[4]} radius={tRadius.card} style={{ gap: tSpace[3] }}>
      <Text style={[tType.caption, { color: t.ink3 }]}>{about}</Text>
      <Text style={[tType.section, { fontSize: 18, lineHeight: 23, color: t.ink }]}>{prompt}</Text>
      <ChipRow>{chips}</ChipRow>
    </Card>
  );
  return (
    <View style={{ gap: tSpace[4] }}>
      <StepHead n={2} words="A few questions" />
      <Text accessibilityRole="header" style={[tType.title, { color: t.ink }]}>
        A few quick questions
      </Text>
      {questions.map(({ item, q }) =>
        card(
          item.key + q.key,
          say(CATALOG, item.labelKey),
          say(CATALOG, q.promptKey),
          q.options.map((o) => (
            <Chip
              key={o.key}
              label={say(CATALOG, o.labelKey)}
              selected={answers[item.key]?.[q.key] === o.key}
              onPress={() => onAnswer(item.key, q.key, o.key)}
            />
          )),
        ),
      )}
      {card(
        "since",
        "For all of it",
        "When did it start?",
        SYMPTOM_DURATIONS.map((d) => (
          <Chip
            key={d.code}
            label={d.label}
            selected={since === d.code}
            onPress={() => onSince(d.code)}
          />
        )),
      )}
    </View>
  );
}

/** Step 3's words for Urgent and Routine; the emergency result is `DangerResult`. */
export function ResultCard({ tier, lede }: { tier: "U" | "R"; lede: string | null }) {
  const t = useTide();
  // The tag is the catalogue's own tier word (signed copy).
  const tag = say(CATALOG, TIER_LABEL_KEY[tier]).toUpperCase();
  const [title, line] =
    tier === "U"
      ? [
          "Come to the hospital today",
          "This should be seen today. We save your place in line, and the clinic sees what you told us.",
        ]
      : ["Book a visit", "A clinic should see this, but it can wait for a day that suits you."];
  return (
    <View
      style={{
        gap: tSpace[2.5],
        padding: tSpace[4.5],
        borderRadius: tRadius.panel,
        backgroundColor: t.surface,
        borderWidth: 2,
        borderColor: t.accent,
      }}
    >
      <Text style={[tType.micro, { letterSpacing: 0.8, color: t.ink2 }]}>{tag}</Text>
      <Text accessibilityRole="header" style={[tType.title, { color: t.ink }]}>
        {title}
      </Text>
      <Text style={[tType.bodyM, { color: t.ink2 }]}>{line}</Text>
      {lede ? <Text style={[tType.labelS, { color: t.ink }]}>{lede}</Text> : null}
    </View>
  );
}

/** "What the clinic will see", with a way back to step 1. */
export function ToldUs({ lines, onChange }: { lines: string[]; onChange: () => void }) {
  const t = useTide();
  return (
    <Card padding={tSpace[4]} radius={tRadius.card} style={{ gap: tSpace[2.5] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[tType.label, { color: t.ink }]}>What the clinic will see</Text>
        <Button label="Change" variant="outline" size="sm" onPress={onChange} />
      </View>
      {lines.map((line) => (
        <View key={line} style={{ flexDirection: "row", gap: tSpace[2.5] }}>
          <Icon name="check" size={16} color={t.ink2} strokeWidth={3} />
          <Text style={[tType.bodyM, { flex: 1, color: t.ink }]}>{line}</Text>
        </View>
      ))}
    </Card>
  );
}
