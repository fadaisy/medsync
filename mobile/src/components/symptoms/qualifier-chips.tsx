import type { Palette } from "@/theme/tokens";
import type { Qualifier } from "@shared/symptom-catalog/types";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { t } from "@shared/symptom-catalog/classify";
import { StyleSheet, Text, View } from "react-native";

import { Chip, ChipRow } from "@/components/ui/chip";
import { useStyles } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/**
 * S3 (PRD §7.2): the item's ≤ 2 questions, inline under its row once it is
 * ticked, each a radio row of chips. They exist only where the answer moves
 * the tier or the clinic (rule R2); nothing here grades or scores.
 */
export function QualifierChips({
  qualifiers,
  answers,
  onAnswer,
}: {
  qualifiers: Qualifier[];
  /** qualifier key → option key. */
  answers: Record<string, string>;
  onAnswer: (qualifierKey: string, optionKey: string) => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.block}>
      {qualifiers.map((q) => (
        <View key={q.key} style={styles.question}>
          <Text style={styles.prompt}>{t(CATALOG, q.promptKey)}</Text>
          <ChipRow>
            {q.options.map((o) => (
              <Chip
                key={o.key}
                role="radio"
                label={t(CATALOG, o.labelKey)}
                selected={answers[q.key] === o.key}
                onPress={() => onAnswer(q.key, o.key)}
              />
            ))}
          </ChipRow>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: { gap: space[3], paddingLeft: space[4], paddingBottom: space[2] },
    question: { gap: space[2] },
    prompt: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: c.foreground },
  });
