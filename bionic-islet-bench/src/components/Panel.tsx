import type { ReactNode } from "react";

/** Shared panel chrome. One card style, used everywhere on the bench. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-edge bg-panel shadow-card ${className}`}
      aria-label={title}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-3 py-2">
        <div>
          <h2 className="text-heading-s text-[#e8edf5]">{title}</h2>
          {subtitle ? <p className="text-micro text-muted">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
