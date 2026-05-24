import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Shared shell for /sign-in, /sign-up, /sign-in/mfa, and /onboarding/*.
 *
 * Split layout: editorial left panel (always-dark teal, brand + short
 * honest statement) + form column on the right. The form column is the
 * only one that scrolls on tall content; the left panel is sticky on
 * lg+ so the brand stays anchored while a long sign-up form scrolls.
 *
 * On < lg the left panel collapses to a thin top band (brand only)
 * and the form takes the full width.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-svh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ─── Left panel ─── editorial brand surface ─── */}
      <aside className="medsync-forced-dark relative isolate hidden overflow-hidden bg-teal-950 text-teal-50 lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        {/* Atmosphere — soft radial glow + grain to match the landing hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(closest-side_at_30%_40%,oklch(0.45_0.08_180/0.55),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.22] mix-blend-screen"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-display text-[20px] tracking-tight transition-opacity hover:opacity-80"
          >
            MedSync
          </Link>
          <span className="font-mono text-[10px] tracking-[0.18em] text-teal-300/80 uppercase">
            Foundation phase
          </span>
        </div>

        <div className="flex max-w-[36ch] flex-col gap-6">
          <p className="font-display text-[32px] leading-[1.15] tracking-[-0.02em] text-balance">
            A digital hospital that doesn&rsquo;t stop{" "}
            <span className="text-teal-300 italic">at the gate</span>
            <span aria-hidden className="text-teal-400">
              .
            </span>
          </p>
          <p className="text-[14px] leading-[1.55] text-teal-100/75">
            MedSync is the operating system for Ugandan hospitals up to national-referral scale —
            running the wards, supporting the clinicians, and keeping a record open after patients
            go home.
          </p>
        </div>

        <div className="flex flex-col gap-2 font-mono text-[11px] tracking-wider text-teal-200/60 uppercase">
          <span>Phase&nbsp;0 · Foundation only — no patient data yet.</span>
          <span>MFA (TOTP) is required on every staff session.</span>
        </div>
      </aside>

      {/* ─── Right column ─── form surface ─── */}
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between px-5 py-4 sm:px-8 lg:justify-end">
          {/* Mobile-only brand mark (the left panel is hidden < lg) */}
          <Link
            href="/"
            className="font-display text-foreground text-[18px] tracking-tight lg:hidden"
          >
            MedSync
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
