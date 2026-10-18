import type { SharedValue } from "react-native-reanimated";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import * as Haptics from "expo-haptics";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { motion } from "@/motion/presets";
import { CASCADE_OVERLAP } from "@/theme/tide";

/** How long a card is held before it lifts: the same hold that stops it opening. */
export const LIFT_MS = 350;
const SETTLE = { duration: 400, dampingRatio: 0.8, reduceMotion: ReduceMotion.System } as const;

/**
 * Where a card dragged `dy` from slot `from` lands. `strides[i]` is how far
 * card i's top sits above the next card's top. A card passes a neighbour once
 * it has covered half of that neighbour's stride.
 */
export function dropIndex(strides: number[], from: number, dy: number): number {
  "worklet";
  let to = from;
  let covered = 0;
  if (dy > 0)
    while (to + 1 < strides.length && dy > covered + strides[to + 1] / 2) covered += strides[++to];
  else
    while (to - 1 >= 0 && -dy > covered + strides[to - 1] / 2) covered += strides[--to];
  return to;
}

/** The distance from slot `from` to slot `to`, for the dropped card to settle into. */
export function travel(strides: number[], from: number, to: number): number {
  "worklet";
  let d = 0;
  for (let i = from + 1; i <= to; i++) d += strides[i];
  for (let i = to; i < from; i++) d -= strides[i];
  return d;
}

/** The order after moving the item at `from` to `to`. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export type CascadeItem = {
  key: string;
  /** `move(-1)` / `move(1)`: the screen-reader way to reorder. */
  render: (at: { index: number; last: boolean; move: (by: -1 | 1) => void }) => ReactNode;
};

/**
 * The day cascade, cards that can be held and dragged into a new order
 * (owner request, 18 Oct 2026). Hold 350ms and the card lifts with a light
 * tap; the others slide aside as it passes them, ticking once per slot; let go
 * and it settles into place, then `onReorder` gets the new keys. `tail` (the
 * Now card) stays put at the bottom. While a card is up the page should not
 * scroll: `onDragging` says when.
 */
export function ReorderCascade({
  items,
  tail,
  onReorder,
  onDragging,
}: {
  items: CascadeItem[];
  tail?: ReactNode;
  onReorder: (keys: string[]) => void;
  onDragging?: (on: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const active = useSharedValue(-1);
  // The lifted card by key too: after a drop the indexes move before the shared values reset.
  const activeKey = useSharedValue("");
  const dy = useSharedValue(0);
  const strides = useSharedValue<number[]>([]);
  const keys = items.map((i) => i.key);
  const pending = useRef(false);

  // After a drop, the new order is on screen before the lifted card is let go of.
  useLayoutEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    active.set(-1);
    activeKey.set("");
    dy.set(0);
  });

  const drop = (from: number, to: number) => {
    onDragging?.(false);
    if (from === to) {
      active.set(-1);
      activeKey.set("");
      dy.set(0);
      return;
    }
    pending.current = true;
    onReorder(moved(keys, from, to));
  };
  const lift = () => {
    onDragging?.(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const tick = () => void Haptics.selectionAsync().catch(() => {});

  // One tick each time the lifted card passes a neighbour.
  useAnimatedReaction(
    () => (active.get() < 0 ? -1 : dropIndex(strides.get(), active.get(), dy.get())),
    (to, prev) => {
      if (prev !== null && prev >= 0 && to >= 0 && to !== prev) scheduleOnRN(tick);
    },
  );

  const n = items.length;
  return (
    <View>
      {items.map((item, i) => (
        <Row
          key={item.key}
          itemKey={item.key}
          index={i}
          count={n}
          active={active}
          activeKey={activeKey}
          dy={dy}
          strides={strides}
          reduced={reduced}
          onLift={lift}
          onDrop={drop}
        >
          {item.render({
            index: i,
            last: i === n - 1 && !tail,
            move: (by) => {
              const to = i + by;
              if (to >= 0 && to < n) onReorder(moved(keys, i, to));
            },
          })}
        </Row>
      ))}
      {tail ? (
        <Animated.View
          style={[
            { marginTop: n ? -CASCADE_OVERLAP : 0, zIndex: n },
            motion.cascadeIn(n, reduced),
          ]}
        >
          {tail}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Row({
  itemKey,
  index,
  count,
  active,
  activeKey,
  dy,
  strides,
  reduced,
  onLift,
  onDrop,
  children,
}: {
  itemKey: string;
  index: number;
  count: number;
  active: SharedValue<number>;
  activeKey: SharedValue<string>;
  dy: SharedValue<number>;
  strides: SharedValue<number[]>;
  reduced: boolean;
  onLift: () => void;
  onDrop: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const shift = useSharedValue(0);

  // Make room: a card between where the lifted one was and where it is going slides by its stride.
  useAnimatedReaction(
    () => {
      const a = active.get();
      if (a < 0 || activeKey.get() === itemKey) return 0;
      const s = strides.get();
      const to = dropIndex(s, a, dy.get());
      if (a < index && index <= to) return -(s[a] ?? 0);
      if (to <= index && index < a) return s[a] ?? 0;
      return 0;
    },
    (next, prev) => {
      if (next === prev) return;
      // Snap home with no animation once nothing is lifted (the order has already changed).
      shift.set(active.get() < 0 ? next : withSpring(next, SETTLE));
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(LIFT_MS)
    .onStart(() => {
      active.set(index);
      activeKey.set(itemKey);
      dy.set(0);
      scheduleOnRN(onLift);
    })
    .onUpdate((e) => {
      const s = strides.get();
      dy.set(Math.min(travel(s, index, count - 1), Math.max(travel(s, index, 0), e.translationY)));
    })
    .onEnd(() => {
      const s = strides.get();
      const to = dropIndex(s, index, dy.get());
      dy.set(
        withSpring(travel(s, index, to), SETTLE, (done) => {
          if (done) scheduleOnRN(onDrop, index, to);
        }),
      );
    });

  const style = useAnimatedStyle(() => {
    const lifted = activeKey.get() === itemKey;
    return {
      zIndex: lifted ? 100 : index,
      transform: [
        { translateY: lifted ? dy.get() : shift.get() },
        { scale: lifted && !reduced ? 1.02 : 1 },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height - CASCADE_OVERLAP;
          strides.set((s) => {
            const next = [...s];
            next.length = count;
            next[index] = h;
            return next;
          });
        }}
        style={[{ marginTop: index === 0 ? 0 : -CASCADE_OVERLAP }, style]}
      >
        {/* The entrance runs on its own view: its transform would fight the drag's. */}
        <Animated.View style={motion.cascadeIn(index, reduced)}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
