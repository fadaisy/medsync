/**
 * The plate guide drawn with Ugandan foods (the phone's features/care-more/plate-guide.tsx): greens on half,
 * matooke on a quarter, beans on a quarter. The phone paints it with fixed art colours; the web has no raw
 * colours (L12), so the art takes quiet tokens and follows the theme.
 */
export function PlateGuide({ size = 92, label }: { size?: number; label: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 82 82"
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <circle
        cx={41}
        cy={41}
        r={39}
        strokeWidth={2}
        className="fill-pw-surface stroke-pw-line-strong"
      />
      <path d="M41 41 L41 6 A35 35 0 0 0 41 76 Z" className="fill-pw-accent-tint" />
      <path d="M41 41 L41 6 A35 35 0 0 1 76 41 Z" className="fill-pw-info-tint" />
      <path d="M41 41 L76 41 A35 35 0 0 1 41 76 Z" className="fill-pw-place-tint" />
      {(
        [
          [14, 30, -30],
          [20, 48, 20],
          [30, 62, -10],
        ] as const
      ).map(([x, y, r], i) => (
        <path
          key={`leaf${i}`}
          d={`M${x} ${y} c4 -8 12 -8 14 -2 c-3 7 -10 8 -14 2 Z M${x + 1} ${y} l12 -2`}
          strokeWidth={0.8}
          transform={`rotate(${r} ${x + 7} ${y - 2})`}
          className="fill-pw-accent-text stroke-pw-accent-tint"
        />
      ))}
      {[0, 7].map((d) => (
        <path
          key={`m${d}`}
          d={`M${47 + d} ${32 - d} C${50 + d} ${20 - d} ${60 + d} ${14 - d} ${68 + d / 2} ${18 - d / 2} C${60 + d} ${20 - d} ${54 + d} ${26 - d} ${51 + d} ${34 - d} Z`}
          strokeWidth={1}
          strokeLinejoin="round"
          className="fill-pw-surface stroke-pw-info-text"
        />
      ))}
      {(
        [
          [50, 50],
          [57, 47],
          [64, 50],
          [53, 57],
          [60, 55],
          [56, 63],
          [48, 64],
        ] as const
      ).map(([x, y], i) => (
        <ellipse
          key={`b${i}`}
          cx={x}
          cy={y}
          rx={3}
          ry={2}
          transform={`rotate(${i * 25} ${x} ${y})`}
          className="fill-pw-place-text"
        />
      ))}
    </svg>
  );
}
