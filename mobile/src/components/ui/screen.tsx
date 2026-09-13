import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconButton } from "@/components/ui/icon-button";
import { useTabBarClearance } from "@/components/ui/tab-bar";
import { useStyles, useTheme } from "@/theme/theme";
import { font, space } from "@/theme/tokens";

/**
 * The standard chrome every workspace screen sits in.
 *
 * A round Back control on its own row when the screen has somewhere to go
 * back to — with `trailing` at the row's far end when the screen carries one
 * control there (the red emergency button on pushed screens) — the heading
 * below it, the content, and an optional docked footer.
 * No wordmark: the brand's moment is the splash and the sign-in photograph;
 * inside the app the continuity is this chrome, the same on every screen.
 *
 * The Back control is a round 44px button with a glyph and no visible word —
 * the reference language's back — so it carries an `accessibilityLabel`.
 *
 * ponytail: no `KeyboardAvoidingView`. Ceiling: a screen whose text input sits
 * low enough for the keyboard to cover the submit control — the cancel/
 * reschedule reason fields are the likely first. Upgrade path: that screen
 * wraps its own, the way `sign-in.tsx` does, and if a second one needs it the
 * behaviour moves in here (`padding` on iOS, `height` on Android — one
 * behaviour for both leaves the button under the keyboard on whichever
 * platform loses).
 */
export function Screen({
  title,
  onBack,
  trailing,
  footer,
  scroll = true,
  children,
}: {
  /** The screen's heading, and the only element with the header role. */
  title?: string;
  /**
   * Renders the back control when present. Pass `router.back` for the normal
   * case; a wizard passes its own step-back so the control means "one step",
   * not "off this screen".
   */
  onBack?: () => void;
  /** One control, right-aligned on the back row. The row renders for it even without `onBack`. */
  trailing?: ReactNode;
  /**
   * Docked below the content, above the home indicator — for a primary action
   * that must stay reachable while the content scrolls. Every caller would
   * otherwise redo the bottom-inset arithmetic, which is where it goes wrong.
   */
  footer?: ReactNode;
  /**
   * Off for screens that own their own scrolling — a `FlatList` inside a
   * `ScrollView` is a virtualisation bug, not a layout choice.
   */
  scroll?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  // Zero off the tabs; the bar's footprint on them, so nothing scrolls to a
  // stop underneath it.
  const clearance = useTabBarClearance();

  return (
    <View style={styles.root}>
      {/* The bar's glyphs, not the ground — light glyphs on a dark theme. */}
      <StatusBar style={colors.scheme === "dark" ? "light" : "dark"} />

      <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        {onBack || trailing ? (
          <View style={styles.backRow}>
            {onBack ? <IconButton icon="arrow-back" label="Back" onPress={onBack} /> : null}
            {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
          </View>
        ) : null}

        {title ? (
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        ) : null}
      </View>

      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[
            styles.content,
            // The footer owns the bottom inset when there is one, or the two
            // would both pad for the home indicator and leave a gap.
            { paddingBottom: footer ? space[6] : insets.bottom + clearance + space[8] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.content]}>{children}</View>
      )}

      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + clearance + space[4] }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    fill: { flex: 1 },

    header: { paddingHorizontal: space[5], paddingBottom: space[4], gap: space[4] },
    backRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
    trailing: { marginLeft: "auto" },

    title: {
      fontFamily: font.display,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.6,
      color: c.foreground,
    },

    content: { paddingHorizontal: space[5], flexGrow: 1 },

    footer: {
      paddingHorizontal: space[5],
      paddingTop: space[4],
      gap: space[3],
      backgroundColor: c.background,
      // Separates a docked action from content passing beneath it.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
  });
