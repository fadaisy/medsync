/** Single-series horizontal bars with the value written beside each (never colour alone). Server-safe. */
export function Bars({ rows, value }: { rows: readonly { label: string; v: number }[]; value: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2">
          <span className="text-caption text-ink-700 truncate">{r.label}</span>
          <span className="bg-tide-sunken h-2 overflow-hidden rounded-full">
            <span className="bg-tide-cascade-2 block h-full rounded-full" style={{ width: `${(r.v / max) * 100}%` }} />
          </span>
          <span className="text-caption text-right tabular-nums">{value(r.v)}</span>
        </li>
      ))}
    </ul>
  );
}
