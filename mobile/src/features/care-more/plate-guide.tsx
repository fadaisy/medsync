import Svg, { Circle, Ellipse, Path } from "react-native-svg";

import { PLATE_ART as A } from "@/data/activity";

/**
 * The plate guide drawn with Ugandan foods: greens and leaves on half,
 * matooke on a quarter, beans on a quarter. Art colours come from the
 * fixture, so they read the same in both themes, like a printed leaflet.
 */
export function PlateGuide({ size = 92 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 82 82"
      accessibilityRole="image"
      accessibilityLabel="Plate guide: half vegetables, a quarter starch, a quarter protein"
    >
      <Circle cx={41} cy={41} r={39} fill={A.plate} stroke={A.rim} strokeWidth={2} />
      <Path d="M41 41 L41 6 A35 35 0 0 0 41 76 Z" fill={A.greens} />
      <Path d="M41 41 L41 6 A35 35 0 0 1 76 41 Z" fill={A.starch} />
      <Path d="M41 41 L76 41 A35 35 0 0 1 41 76 Z" fill={A.protein} />
      {/* Greens: three leaves of dodo. */}
      {[
        [14, 30, -30],
        [20, 48, 20],
        [30, 62, -10],
      ].map(([x, y, r], i) => (
        <Path
          key={`leaf${i}`}
          d={`M${x} ${y} c4 -8 12 -8 14 -2 c-3 7 -10 8 -14 2 Z M${x + 1} ${y} l12 -2`}
          fill={A.leaf}
          stroke={A.leafVein}
          strokeWidth={0.8}
          transform={`rotate(${r} ${x + 7} ${y - 2})`}
        />
      ))}
      {/* Starch: two fingers of matooke. */}
      {[0, 7].map((d) => (
        <Path
          key={`m${d}`}
          d={`M${47 + d} ${32 - d} C${50 + d} ${20 - d} ${60 + d} ${14 - d} ${68 + d / 2} ${18 - d / 2} C${60 + d} ${20 - d} ${54 + d} ${26 - d} ${51 + d} ${34 - d} Z`}
          fill={A.matooke}
          stroke={A.matookeEdge}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      ))}
      {/* Protein: beans. */}
      {[
        [50, 50],
        [57, 47],
        [64, 50],
        [53, 57],
        [60, 55],
        [56, 63],
        [48, 64],
      ].map(([x, y], i) => (
        <Ellipse
          key={`b${i}`}
          cx={x}
          cy={y}
          rx={3}
          ry={2}
          fill={A.bean}
          transform={`rotate(${i * 25} ${x} ${y})`}
        />
      ))}
    </Svg>
  );
}
