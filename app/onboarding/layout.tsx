import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-6 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-display text-heading-s text-foreground tracking-tight">
              MedSync
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
