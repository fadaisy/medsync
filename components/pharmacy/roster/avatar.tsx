import { AVATAR_TINTS } from "@/content/pharmacy-roster-grid";
import { cn } from "@/lib/utils";

/** The prototype's `avatar()`: the photo, or initials on a tint picked by a stable hash of the name. */
const SIZE: Record<number, string> = {
  22: "size-[22px] text-[9px]",
  24: "size-6 text-[10px]",
  28: "size-7 text-[11px]",
  36: "size-9 text-[14px]",
  44: "size-11 text-[18px]",
};

export function Avatar({
  person,
  size,
  className,
}: {
  person: { name: string; photo?: string | null } | undefined;
  size: 22 | 24 | 28 | 36 | 44;
  className?: string;
}) {
  const name = String(person?.name || "?")
    .replace(/[[\]]/g, "")
    .replace(/,.*$/, "")
    .replace(/^Dr\.?\s+/, "")
    .trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const ini = parts.length > 1 ? parts[0]![0]! + parts.at(-1)![0]! : (parts[0] ?? "?").slice(0, 2);
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  const base = cn(
    "grid shrink-0 place-items-center overflow-hidden rounded-full font-bold tracking-[0.02em] shadow-[0_0_0_2px_var(--color-card)]",
    SIZE[size],
    className,
  );
  if (person?.photo)
    return (
      <span
        aria-hidden
        className={cn(base, "bg-ink-150 bg-cover bg-center bg-no-repeat")}
        style={{ backgroundImage: `url(${JSON.stringify(person.photo)})` }}
      />
    );
  return (
    <span aria-hidden className={cn(base, AVATAR_TINTS[h % AVATAR_TINTS.length])}>
      {ini.toUpperCase()}
    </span>
  );
}
