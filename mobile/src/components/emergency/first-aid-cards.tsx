import { Text, View } from "react-native";

import { Watermark } from "@/components/emergency/watermark";
import { Card } from "@/components/tide";
import { useTide } from "@/theme/theme";
import { tSpace, tType } from "@/theme/tide";

/**
 * ⚠ DRAFT — PENDING CLINICAL SAFETY OFFICER SIGN-OFF (PRD §5.6; Gate A
 * item 5). The two cards the owner asked to sign first, in the PRD's own
 * words; non-drug, WHO Basic Emergency Care-consistent one-liners. Behind
 * `EXPO_PUBLIC_FEATURE_FIRST_AID_CARDS` (off), and under the watermark
 * until a signed version exists. Reviewer: replace the array, leave the
 * component alone.
 */
export const FIRST_AID_CARDS: readonly { key: string; text: string }[] = [
  { key: "bleeding_pressure", text: "Press firmly on bleeding with a clean cloth." },
  { key: "note_the_time", text: "Note the time the weakness started." },
];

export function FirstAidCards() {
  const t = useTide();
  return (
    <View style={{ gap: tSpace[2] }}>
      <Watermark>First-aid cards are drafts awaiting sign-off.</Watermark>
      <Text accessibilityRole="header" style={[tType.heading, { color: t.ink }]}>
        While you wait
      </Text>
      {FIRST_AID_CARDS.map((card) => (
        <Card key={card.key}>
          <Text style={[tType.bodyM, { lineHeight: 22, color: t.ink }]}>{card.text}</Text>
        </Card>
      ))}
    </View>
  );
}
