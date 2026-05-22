import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="border-gray-150 border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-8 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="font-display text-heading-s text-foreground tracking-tight">
              MedSync
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-96">{children}</div>
      </main>
    </div>
  );
}
