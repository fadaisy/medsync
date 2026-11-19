import { Text, View } from "react-native";

import { AHEAD_NOTE, aheadWords } from "@/features/visits/logic";
import { useTide } from "@/theme/theme";
import { tType } from "@/theme/tide";

/**
 * "N ahead of you" under the stage, only once the patient is present and the count came back from
 * `patient_intake_ahead` (`aheadWords`), with the reason it can move (ADR 0084 §6). Else nothing: no "0", no
 * placeholder. Quiet type and the page's own ink, never a colour: a place in the line is not a clinical state.
 * Shared by the walk-in screen, the ticket, Home's visit card and the visit page, so they say the same.
 */
export function AheadLines({ status, ahead }: { status: string | null; ahead: number | null }) {
  const t = useTide();
  const words = aheadWords(status, ahead);
  if (!words) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 2 }}>
      <Text style={[tType.label, { fontSize: 15, color: t.ink }]}>{words}</Text>
      <Text style={[tType.bodyS, { color: t.ink2 }]}>{AHEAD_NOTE}</Text>
    </View>
  );
}
