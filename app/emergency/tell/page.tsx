import type { EItem } from "./_components/pre-alert-form";
import type { CatalogItem } from "@/supabase/functions/_shared/symptom-catalog/types";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { preAlertLive } from "@/lib/emergency/feature";
import { cn } from "@/lib/utils";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { t } from "@/supabase/functions/_shared/symptom-catalog/classify";
import { loadEmergencyContext } from "../_lib/sheet";
import { PreAlertForm } from "./_components/pre-alert-form";

export const metadata: Metadata = {
  title: "Tell a hospital I'm coming",
  robots: { index: false, follow: false },
};

/**
 * E2 (PRD MS-PRD-SYM-001 §8.3; ADR 0098 rulings 6, 9): the pre-alert.
 * Facilities come from the sheet (non-PHI) and are ordered ON DEVICE; the
 * catalog's emergency items travel as a small label map so the client
 * bundle never carries the package. Signed out renders — the callback
 * number is then required. Behind FEATURE_PRE_ALERT: off, the page says so
 * and points back to the numbers.
 */
type Search = Record<string, string | string[] | undefined>;

export default async function TellPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, ctx] = await Promise.all([searchParams, loadEmergencyContext()]);
  const items = (Array.isArray(sp.items) ? sp.items : sp.items ? [sp.items] : []).filter(Boolean);
  const submission = (Array.isArray(sp.submission) ? sp.submission[0] : sp.submission) ?? null;

  const eItems: EItem[] = (CATALOG.items as CatalogItem[])
    .filter((i) => i.tier === "E")
    .map((i) => ({
      key: i.key,
      label: t(CATALOG, i.labelKey),
      stroke: i.flags?.includes("stroke_time") ?? false,
      isolation: i.flags?.includes("isolation") ?? false,
    }));

  return (
    <div className="medsync-forced-light bg-background text-foreground min-h-svh">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
        <nav aria-label="Back" className="flex justify-between">
          <Link
            href="/emergency"
            className="text-muted-foreground hover:text-foreground text-body-s inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            Back to the numbers
          </Link>
        </nav>
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-foreground text-heading-l font-medium tracking-[-0.015em]">
            Tell a hospital I&rsquo;m coming
          </h1>
          <p className="text-muted-foreground text-body-m">
            The hospital prepares before you arrive. Calling is always faster if you can.
          </p>
        </header>

        {preAlertLive() ? (
          <PreAlertForm
            facilities={ctx.sheet.facilities}
            ownHospitalId={ctx.hospitalId}
            signedIn={ctx.signedIn}
            eItems={eItems}
            initialItems={items}
            submissionId={submission}
          />
        ) : (
          <div className="bg-card flex flex-col gap-3 rounded-xl p-4 shadow-xs">
            <p className="text-foreground text-body-m">
              Pre-alerts are not switched on here yet. Please call the hospital.
            </p>
            <Link href="/emergency" className={cn(buttonVariants({ size: "lg" }), "w-fit")}>
              Back to the numbers
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
