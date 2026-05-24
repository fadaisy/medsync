import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClinicalPath } from "@/components/medsync/clinical-path";
import { SectionNumber } from "@/components/medsync/section-number";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthState } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const state = await getAuthState();
  if (!state.user) redirect("/sign-in?redirect=/dashboard");

  const isSuperadmin = state.roles.includes("superadmin");

  return (
    <div className="bg-background min-h-svh">
      <header className="border-gray-150 border-b">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <span className="font-display text-heading-s text-foreground tracking-tight">
              MedSync
            </span>
            <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              dashboard
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-[13px]">{state.user.email}</span>
            <ThemeToggle />
            <form action="/sign-out" method="POST">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-300 px-8 py-16">
        <div className="mb-12 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <SectionNumber n={0} />
            <ClinicalPath segments={["session", "dashboard"]} />
          </div>
          <h1 className="font-display text-display-s text-foreground">
            Hello, {state.user.email}.
          </h1>
          <p className="text-body-l text-muted-foreground max-w-xl">
            Phase 0 ends here — the platform is empty by design. Clinical surfaces (patient list,
            ward, vitals, follow-up) start landing in Phase 1.
          </p>
        </div>

        {isSuperadmin ? (
          <Card tone="tealTinted" className="mb-8">
            <CardHeader>
              <CardTitle>Admin workspace</CardTitle>
              <CardDescription>
                Platform operator surfaces — audit log, tenants, people, catalog, health, and
                break-glass. Every action is recorded; break-glass also notifies the affected
                hospital&apos;s administrators.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button render={<a href="/admin" />} nativeButton={false} variant="primary" size="sm">
                Open admin workspace
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card tone="standard">
            <CardHeader>
              <CardTitle>Your roles</CardTitle>
              <CardDescription>
                Roles are assigned by an administrator via the Phase 0.10 Edge Function.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {state.roles.length === 0 ? (
                <p className="text-body-s text-muted-foreground">
                  No roles assigned yet. Patients pick up a default role on first invite.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {state.roles.map((r) => (
                    <li key={r} className="font-mono text-[13px] text-teal-600">
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card tone="tealTinted">
            <CardHeader>
              <CardTitle>Two-factor authentication</CardTitle>
              <CardDescription>
                {state.nextAal === "aal2"
                  ? state.aal === "aal2"
                    ? "Active and verified this session."
                    : "Active. Pending challenge."
                  : "Not enrolled."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {state.nextAal !== "aal2" ? (
                <Button
                  render={<a href="/onboarding/mfa-setup" />}
                  nativeButton={false}
                  variant="primary"
                  size="sm"
                >
                  Set up now
                </Button>
              ) : (
                <p className="text-body-s text-muted-foreground">
                  Required for clinical and administrative roles.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
