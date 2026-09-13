import type { Palette } from "@/theme/tokens";
import type { StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useStyles } from "@/theme/theme";
import { font, radius, space } from "@/theme/tokens";

/**
 * The three ways this app asks for a tap.
 *
 * `primary` is the signature pair the splash and sign-in already use — the
 * mint fill carrying deep indigo text — and there is exactly one of them on a
 * screen. `secondary` is the same shape outlined, for the real alternative
 * beside it. `link` is a plain word for the third thing, which on the booking
 * surfaces is usually the door the patient did not take (ADR 0084 §11
 * demotes booking to a text link on the closed-state screen, and that demotion
 * only means anything if a link is visibly a link).
 *
 * Press feedback is opacity, never scale: a button that shrinks under the
 * thumb hides its label at the moment the thumb is already covering it.
 */
type Variant = "primary" | "secondary" | "link";

export function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /**
   * Work in flight. Blocks further presses and shows a spinner beside the
   * label — the label itself does not change, so there is no second string to
   * write and nothing for a patient to re-read mid-tap.
   */
  busy?: boolean;
  disabled?: boolean;
  /** Only when the visible label needs more context than it can carry. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || busy;
  const styles = useStyles(makeStyles);

  const container = { primary: styles.primary, secondary: styles.secondary, link: styles.link };
  const disabledContainer = {
    primary: styles.primaryDisabled,
    secondary: styles.secondaryDisabled,
    link: null,
  };
  const label_ = {
    primary: styles.primaryLabel,
    secondary: styles.secondaryLabel,
    link: styles.linkLabel,
  };
  const disabledLabel = {
    primary: styles.primaryLabelDisabled,
    secondary: styles.mutedLabelDisabled,
    link: styles.mutedLabelDisabled,
  };
  const spinner = {
    primary: styles.primaryLabel.color,
    secondary: styles.secondaryLabel.color,
    link: styles.linkLabel.color,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={variant === "link" ? 8 : undefined}
      style={({ pressed }) => [
        styles.base,
        container[variant],
        // `busy` keeps the live look — it is working, not unavailable.
        disabled ? disabledContainer[variant] : null,
        pressed ? (variant === "link" ? styles.linkPressed : styles.pressed) : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={spinner[variant]} /> : null}
      <Text style={[styles.label, label_[variant], disabled ? disabledLabel[variant] : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: space[2],
    },

    // 52px, pill radius, full width — the shape the splash and sign-in set.
    primary: {
      alignSelf: "stretch",
      minHeight: 52,
      paddingHorizontal: space[6],
      borderRadius: radius.full,
      backgroundColor: c.cta,
    },
    secondary: {
      alignSelf: "stretch",
      minHeight: 52,
      paddingHorizontal: space[6],
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.primary,
    },
    // No fill and no border, but still a 44px target.
    link: { minHeight: 44, paddingHorizontal: space[2] },

    // Solid tokens rather than a faded mint: a dimmed fill takes the label
    // down with it, and a patient still needs to read what the button will do
    // once it becomes available. The sunken surface with a hairline so it
    // still has an edge on a white page.
    primaryDisabled: {
      backgroundColor: c.muted,
      borderWidth: 1,
      borderColor: c.border,
    },
    secondaryDisabled: { borderColor: c.border },

    pressed: { opacity: 0.88 },
    // A text link needs more than 0.88 to register as a press at all.
    linkPressed: { opacity: 0.6 },

    label: { fontFamily: font.bodyMedium, fontSize: 16, letterSpacing: 0.1 },
    primaryLabel: { color: c.ctaForeground },
    secondaryLabel: { color: c.primary },
    linkLabel: { fontFamily: font.body, fontSize: 14.5, letterSpacing: 0, color: c.primary },

    primaryLabelDisabled: { color: c.mutedForeground },
    mutedLabelDisabled: { color: c.mutedForeground },
  });
