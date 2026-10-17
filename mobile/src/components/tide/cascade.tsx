import type { IconName } from "@/components/tide/icon";
import type { ReactNode } from "react";
import { Children } from "react";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Icon } from "@/components/tide/icon";
import { Press } from "@/components/tide/press";
import { motion } from "@/motion/presets";
import { useTide } from "@/theme/theme";
import { CASCADE_OVERLAP, tRadius, tSpace, tType } from "@/theme/tide";

/**
 * The day cascade: cards stacked earliest first, each sliding 32pt under the
 * one before (more than the 28pt radius, so no square corner peeks out).
 * Tone changes with time, never with topic. Cards rise in one by one
 * (`cascadeIn`).
 */
export function Cascade({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, i) => (
        <Animated.View
          key={i}
          style={[
            { marginTop: i === 0 ? 0 : -CASCADE_OVERLAP, zIndex: i },
            motion.cascadeIn(i, reduced),
          ]}
        >
          {child}
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * One done or past step: a navy-toned card with an icon disc, a title, a
 * line, and a ✓ (done) or › (go). `step` picks the tone, 0 earliest.
 */
export function CascadeStep({
  step,
  icon,
  title,
  line,
  done = false,
  onPress,
  last = false,
}: {
  step: 0 | 1 | 2;
  icon: IconName;
  title: string;
  line: string;
  done?: boolean;
  onPress?: () => void;
  /** The bottom card shows its own bottom corners and needs no tuck room. */
  last?: boolean;
}) {
  const t = useTide();
  const bg = t.cascade[step];
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={`${title}. ${line}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tSpace[3],
        paddingTop: tSpace[3.5],
        paddingHorizontal: tSpace[4.5],
        paddingBottom: last ? tSpace[3.5] : 46,
        borderTopLeftRadius: tRadius.xl,
        borderTopRightRadius: tRadius.xl,
        borderBottomLeftRadius: last ? tRadius.xl : 0,
        borderBottomRightRadius: last ? tRadius.xl : 0,
        backgroundColor: bg,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: t.bandGlass,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={18} color={t.onBand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[tType.heading, { color: t.onBand }]}>{title}</Text>
        <Text style={[tType.bodyM, { fontSize: 14, color: t.onBand2 }]}>{line}</Text>
      </View>
      {done ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: t.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={15} color={t.ink} strokeWidth={3} />
        </View>
      ) : (
        <Icon name="forward" size={20} color={t.onBand} />
      )}
    </Press>
  );
}
