import type { ReactNode } from "react";
import type {
  AccessibilityRole,
  PressableProps,
  AccessibilityState,
  Insets,
  StyleProp,
  ViewStyle,
} from "react-native";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { transition } from "@/motion/presets";

/**
 * Every Tide pressable: shrinks to 0.96 while held (160ms) with a light
 * haptic, the `press` preset. Under reduce motion it does not move; the
 * haptic stays, because it is feedback, not motion.
 *
 * The scale lives on an inner view so the hit area never shrinks under the
 * thumb.
 */
export function Press({
  onPress,
  children,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
  accessibilityHint,
  hitSlop,
  haptic = true,
  testID,
  onLongPress,
  delayLongPress,
  accessibilityActions,
  onAccessibilityAction,
}: {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
  hitSlop?: number | Insets;
  haptic?: boolean;
  testID?: string;
  /** Given, a long hold no longer ends in `onPress` (a card picked up to drag). */
  onLongPress?: () => void;
  delayLongPress?: number;
  accessibilityActions?: PressableProps["accessibilityActions"];
  onAccessibilityAction?: PressableProps["onAccessibilityAction"];
}) {
  const reduced = useReducedMotion();
  const [held, setHeld] = useState(false);
  // How the control sits in its parent (flex, width, margins) belongs on the
  // pressable; how it looks belongs on the view that scales.
  const { outer, inner } = splitStyle(style);
  return (
    <Pressable
      style={outer}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      onPressIn={() => {
        setHeld(true);
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }}
      onPressOut={() => setHeld(false)}
    >
      <Animated.View
        style={[
          inner,
          transition.press(reduced),
          { transform: [{ scale: held && !reduced && !disabled ? 0.96 : 1 }] },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

const OUTER_KEYS = new Set([
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "width",
  "minWidth",
  "maxWidth",
  "margin",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginHorizontal",
  "marginVertical",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "zIndex",
]);

function splitStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = v;
  // A control told to fill its row must fill it on the inside too.
  if (outer.flex !== undefined || outer.width !== undefined || outer.alignSelf === "stretch")
    inner.flexGrow = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}
