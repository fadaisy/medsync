import Animated, { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { OVERSHOOT } from "@/motion/presets";
import { useTide } from "@/theme/theme";

export type Mood = "good" | "okay" | "low" | "none";

/**
 * The three mood faces and an empty ring for a day not recorded. The faces
 * are fixed illustrations, the same in both themes, as on the boards. `pop`
 * grows the face to 1.2 when it has just been picked.
 */
export function MoodFace({
  mood,
  size = 48,
  pop = false,
}: {
  mood: Mood;
  size?: number;
  pop?: boolean;
}) {
  const t = useTide();
  const reduced = useReducedMotion();
  const label = { good: "Good", okay: "Okay", low: "Not well", none: "Not recorded" }[mood];
  const art = t.mood;
  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        transform: [{ scale: pop && !reduced ? 1.2 : 1 }],
        transitionProperty: "transform",
        transitionDuration: reduced ? 0 : 260,
        transitionTimingFunction: OVERSHOOT,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {mood === "good" ? (
          <>
            <Circle cx={24} cy={24} r={22} fill={art.good} />
            <Path
              d="M13.5 21.5 q3.5 -4.5 7 0"
              fill="none"
              stroke={art.ink}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
            <Path
              d="M27.5 21.5 q3.5 -4.5 7 0"
              fill="none"
              stroke={art.ink}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
            <Path d="M14 28 q10 11 20 0 z" fill={art.ink} />
            <Path d="M19 32.2 q5 3.6 10 0" fill={art.tongue} />
            <Circle cx={11.5} cy={28} r={3} fill={art.cheek} opacity={0.7} />
            <Circle cx={36.5} cy={28} r={3} fill={art.cheek} opacity={0.7} />
          </>
        ) : null}
        {mood === "okay" ? (
          <>
            <Circle cx={24} cy={24} r={22} fill={art.okay} />
            <Circle cx={17} cy={21} r={2.8} fill={art.ink} />
            <Circle cx={31} cy={21} r={2.8} fill={art.ink} />
            <Path
              d="M16.5 31.5 L31.5 29.5"
              fill="none"
              stroke={art.ink}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
            <Path
              d="M27 14 l6 1.5"
              fill="none"
              stroke={art.ink}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          </>
        ) : null}
        {mood === "low" ? (
          <>
            <Circle cx={24} cy={24} r={22} fill={art.low} />
            <Path
              d="M13 18.5 l6.5 2.5"
              fill="none"
              stroke={art.cheek}
              strokeWidth={2.3}
              strokeLinecap="round"
            />
            <Path
              d="M35 18.5 l-6.5 2.5"
              fill="none"
              stroke={art.cheek}
              strokeWidth={2.3}
              strokeLinecap="round"
            />
            <Circle cx={17.5} cy={24.5} r={2.6} fill={art.cheek} />
            <Circle cx={30.5} cy={24.5} r={2.6} fill={art.cheek} />
            <Path
              d="M17 35 q7 -6.5 14 0"
              fill="none"
              stroke={art.cheek}
              strokeWidth={2.6}
              strokeLinecap="round"
            />
            <Path d="M37.5 11 q2.5 4 0 6 q-2.5 -2 0 -6 z" fill={art.tear} />
          </>
        ) : null}
        {mood === "none" ? (
          <Circle
            cx={24}
            cy={24}
            r={21}
            fill="none"
            stroke={t.lineStrong}
            strokeWidth={2}
            strokeDasharray="3 4"
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
}
