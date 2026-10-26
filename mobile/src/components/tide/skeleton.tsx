import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace } from "@/theme/tide";

/**
 * A grey shape where content is still loading (owner, 18 Oct 2026): the page
 * keeps its layout while it fills in, instead of a spinner or blank space.
 * It breathes gently (`skeletonPulse`), and is still under reduce motion.
 * Hidden from screen readers; the container says what is loading.
 */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 7,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: t.surface3 },
        motion.skeletonPulse(reduced),
        style,
      ]}
    />
  );
}

/** A card-shaped placeholder: an optional round icon, a title line and shorter lines under it. */
export function SkeletonCard({
  lines = 2,
  icon = true,
  label,
  height,
}: {
  lines?: number;
  icon?: boolean;
  /** What is loading, for screen readers ("Loading your visits"). */
  label: string;
  height?: number;
}) {
  const t = useTide();
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        minHeight: height,
        flexDirection: "row",
        gap: tSpace[3],
        padding: tSpace[3.5],
        borderRadius: tRadius.cardLg,
        backgroundColor: t.surface,
        boxShadow: t.shadow.card,
      }}
    >
      {icon ? <Skeleton width={40} height={40} radius={20} /> : null}
      <View style={{ flex: 1, gap: tSpace[2], justifyContent: "center" }}>
        <Skeleton width="62%" height={16} />
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} width={i === lines - 1 ? "45%" : "88%"} height={12} />
        ))}
      </View>
    </View>
  );
}
