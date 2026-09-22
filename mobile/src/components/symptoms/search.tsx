import type { Palette } from "@/theme/tokens";
import type { CatalogItem, SubmissionAudience } from "@shared/symptom-catalog/types";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import { searchItems } from "@shared/symptom-catalog/classify";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { ItemRow } from "@/components/symptoms/item-row";
import { QualifierChips } from "@/components/symptoms/qualifier-chips";
import { useStyles, useTheme } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/** The field's budget on S1 (PRD §7.2). */
export const SEARCH_HEIGHT = 48;

/**
 * Offline search over labels and lay synonyms (`searchItems`: every word a
 * substring, catalog order — never a ranking). Results are the same rows
 * the sheet draws, in place under the field: type → tap is the two-step
 * path of PRD §7.3. The zero-result state is PRD §7.4's sentence.
 */
export function Search({
  audience,
  selected,
  qualifiers,
  onToggle,
  onAnswer,
}: {
  audience: SubmissionAudience;
  selected: string[];
  qualifiers: Record<string, Record<string, string>>;
  onToggle: (item: CatalogItem) => void;
  onAnswer: (itemKey: string, qualifierKey: string, optionKey: string) => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const q = query.trim();
  const hits = q ? searchItems(CATALOG, audience, q) : [];

  return (
    <View style={styles.block}>
      <View style={[styles.well, focused && styles.wellFocused]}>
        <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search — e.g. fits, pressure, sugar"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search what's wrong, in your own words"
          style={styles.input}
        />
      </View>
      {q && hits.length === 0 ? (
        <Text style={styles.empty} accessibilityLiveRegion="polite">
          {"We couldn't find that. Pick the closest area below, or check the danger signs."}
        </Text>
      ) : null}
      {hits.length > 0 ? (
        <View style={styles.results} accessibilityLiveRegion="polite">
          {hits.map((item) => {
            const ticked = selected.includes(item.key);
            return (
              <View key={item.key} style={styles.entry}>
                <ItemRow item={item} selected={ticked} onPress={() => onToggle(item)} />
                {ticked && item.qualifiers?.length ? (
                  <QualifierChips
                    qualifiers={item.qualifiers}
                    answers={qualifiers[item.key] ?? {}}
                    onAnswer={(k, o) => onAnswer(item.key, k, o)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: { gap: space[2] },
    well: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[2],
      minHeight: SEARCH_HEIGHT,
      paddingHorizontal: space[4],
      borderRadius: radius.xl,
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
    },
    wellFocused: { borderColor: c.primary },
    input: {
      flex: 1,
      fontFamily: font.body,
      fontSize: 16,
      color: c.foreground,
      paddingVertical: space[3],
    },
    empty: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground },
    results: { gap: space[2] },
    entry: { gap: space[2] },
  });
