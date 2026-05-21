import Link from "next/link";

import { ClinicalPath } from "@/components/medsync/clinical-path";
import { SectionNumber } from "@/components/medsync/section-number";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="bg-background relative flex min-h-svh flex-col">
      {/* Top nav */}
      <header className="border-gray-150 border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <span className="font-display text-heading-s text-foreground tracking-tight">
              MedSync
            </span>
            <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              v0.0
            </span>
          </div>
          <nav className="text-muted-foreground flex items-center gap-5 text-[13px]">
            <Link
              href="/styleguide"
              className="hover:text-foreground transition-colors duration-150"
            >
              Design system
            </Link>
            <a
              href="https://github.com/anthropics/claude-code"
              className="hover:text-foreground transition-colors duration-150"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-8 py-24">
        <div className="flex w-full max-w-2xl flex-col gap-12 text-left">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <SectionNumber n={0} />
              <ClinicalPath segments={["foundation", "scaffold", "design system"]} />
            </div>

            <h1 className="font-display text-display-m text-foreground">
              A digital hospital operating system, built for&nbsp;Uganda.
            </h1>

            <p className="text-body-l text-muted-foreground max-w-xl">
              MedSync is the platform we&apos;re building to run a Mulago-scale national referral
              hospital — internal medicine first, then radiating outward. This page is intentionally
              empty: Phase&nbsp;0 ships the foundation (security, auditability, design system)
              before a single clinical feature lands.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button render={<Link href="/styleguide" />} variant="primary" size="md">
              View design system
            </Button>
            <Button
              render={<a href="https://github.com/medsync-ug" target="_blank" rel="noreferrer" />}
              variant="secondary"
              size="md"
            >
              Read the plan
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-gray-150 border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-300 items-center justify-between gap-4 px-8 py-5 text-[11px]">
          <div className="flex items-center gap-3">
            <span className="font-mono">2026</span>
            <span aria-hidden>·</span>
            <span>Kampala, Uganda</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Clinical Safety Officer</span>
            <span aria-hidden>·</span>
            <span className="text-foreground">Usama Fadhul</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
