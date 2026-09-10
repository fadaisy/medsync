import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Shared shell for /sign-in, /sign-up, /sign-in/mfa, and /onboarding/*.
 *
 * Full-bleed dark teal atmosphere (radial glow + grain — matches the
 * landing hero) with a luminous centered card carrying the brand mark,
 * the page-specific form, and an honest Phase-0 mark in the footer.
 *
 * One cohesive composition rather than a split, so the form has
 * presence at every viewport and the page never reads as "form
 * floating in a sea of white".
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="medsync-forced-dark bg-gradient-hero relative isolate flex min-h-svh w-full flex-col overflow-hidden">
      {/* Atmosphere — radial glow */}
      <div
        aria-hidden
        className="fade-in-slow pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(closest-side_at_50%_30%,oklch(0.5_0.09_286/0.55),transparent_72%)]"
      />
      {/* Atmosphere — secondary glow off-axis for depth, drifting slowly */}
      <div
        aria-hidden
        className="fade-in-slow float-slow pointer-events-none absolute -right-32 -bottom-32 -z-10 size-150 rounded-full blur-2xl [background:radial-gradient(closest-side,oklch(0.55_0.1_286/0.32),transparent_70%)]"
      />
      {/* Atmosphere — grain texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.22] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Top bar — brand on a dark surface */}
      <header className="reveal-up relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-heading-s text-brand-50 tracking-tight transition-opacity hover:opacity-80"
        >
          MedSync
        </Link>
        <div className="text-brand-200/70">
          <ThemeToggle />
        </div>
      </header>

      {/* Centered card — the page-level AuthCard provides its own
          frame (border + bg + padding). We only add a soft glow halo
          underneath for separation against the dark atmosphere, and
          drop the Phase-0 honesty mark below it. */}
      <main className="relative flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="scale-in relative">
            <div
              aria-hidden
              className="from-brand-100/20 via-brand-200/10 to-brand-400/15 pointer-events-none absolute -inset-px rounded-[14px] bg-linear-to-b opacity-60 blur-md"
            />
            <div className="relative drop-shadow-[0_24px_60px_rgba(0,40,40,0.45)]">{children}</div>
          </div>

          <p
            className="reveal-up text-brand-200/55 mt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ animationDelay: "180ms" }}
          >
            Phase&nbsp;0 — foundation only · MFA required on every staff session
          </p>
        </div>
      </main>
    </div>
  );
}
