import Link from "next/link";

const ITEMS = [
  ["/ipc", "Lab alerts"],
  ["/ipc/list", "Alert list"],
  ["/ipc/surveillance", "Surveillance and AMR"],
] as const;

/** The infection prevention workspace's three places (Lab Phase 5 §5, A13). */
export function IpcNav({ current }: { current: (typeof ITEMS)[number][0] }) {
  return (
    <nav
      aria-label="Infection prevention"
      className="border-border flex flex-wrap gap-4 border-b pb-2"
    >
      {ITEMS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? "page" : undefined}
          className="text-body-s text-primary underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
