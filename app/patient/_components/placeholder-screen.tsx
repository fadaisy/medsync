import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

/**
 * Patient-side placeholder for surfaces that haven't shipped yet
 * (Track, Hospitals, Menu — they land in GATE C / D / F). Calm tone,
 * honest about what's next; no fake content.
 */
export function PatientPlaceholderScreen({
  eyebrow,
  title,
  blurb,
  Icon,
  upcoming,
  backHref = "/patient",
  backLabel = "Back to home",
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  upcoming: ReadonlyArray<string>;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-md max-w-full -translate-x-1/2 rounded-full bg-teal-500/5 blur-3xl dark:bg-teal-400/4"
      />
      <Link
        href={backHref}
        className="text-muted-foreground hover:text-foreground group inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon
          className="size-3.5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        {backLabel}
      </Link>

      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {eyebrow}
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-[48ch] text-[13px] leading-relaxed">{blurb}</p>
      </header>

      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="scale-in inline-flex size-9 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40"
          >
            <Icon className="size-4" />
          </span>
          <span className="text-foreground text-[13.5px] font-medium">Landing soon</span>
        </div>
        <ul className="stagger-children flex flex-col gap-1.5">
          {upcoming.map((item) => (
            <li
              key={item}
              className="text-muted-foreground flex items-start gap-2 text-[12.5px] leading-relaxed"
            >
              <span
                aria-hidden
                className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-teal-500/70"
              />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
