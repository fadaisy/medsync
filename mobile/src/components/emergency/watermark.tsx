import { Text, View } from "react-native";

import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

/**
 * Gate CS (ADR 0098 ruling 2): unsigned clinical content renders only
 * outside production, and visibly so. A quiet band — not amber (that is the
 * Urgent tier's) and never red — with the words, because the words are the
 * warning; the colour is not.
 */
export function Watermark({ children }: { children?: string }) {
  const t = useTide();
  return (
    <View
      accessibilityRole="text"
      style={{
        paddingVertical: tSpace[2],
        paddingHorizontal: tSpace[3],
        borderRadius: tRadius.md,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.lineStrong,
        borderStyle: "dashed",
        gap: 2,
      }}
    >
      <Text style={[tType.overline, { color: t.ink3 }]}>Unsigned clinical content</Text>
      {children ? <Text style={[tType.bodyS, { color: t.ink2 }]}>{children}</Text> : null}
    </View>
  );
}
