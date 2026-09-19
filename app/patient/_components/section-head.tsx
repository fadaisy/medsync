import Link from "next/link";

/** A section's heading beside its one link — "Find care · Book a visit". */
export function SectionHead({
  id,
  title,
  linkHref,
  linkLabel,
}: {
  /** Set when a `<section aria-labelledby>` names this heading. */
  id?: string;
  title: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-heading-s font-medium">
        {title}
      </h2>
      {/* No underline at rest — blue-underlined "view all" is not in the
          system; the negative margin keeps the 44px target invisible. */}
      <Link
        href={linkHref}
        className="text-primary text-body-s duration-fast ease-expo-out -my-2 inline-flex min-h-11 shrink-0 items-center rounded-md underline-offset-4 transition-colors hover:underline focus-visible:underline"
      >
        {linkLabel}
      </Link>
    </div>
  );
}
