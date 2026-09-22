import type { Tile } from "./_components/emergency-sheet";
import type { Metadata } from "next";
import Link from "next/link";

import { firstAidCardsLive, preAlertLive } from "@/lib/emergency/feature";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import {
  dangerSigns,
  t,
  visibleItems,
} from "@/supabase/functions/_shared/symptom-catalog/classify";
import { EmergencySheet, FirstAidCards } from "./_components/emergency-sheet";
import { loadEmergencyContext, splitContacts } from "./_lib/sheet";

export const metadata: Metadata = {
  title: "Emergency — get help now",
  robots: { index: false, follow: false },
};

/**
 * E1 (PRD MS-PRD-SYM-001 §8.2; ADR 0098 ruling 7): public, signed in or
 * out, one tap from the pill and two to a call. Permanently light (Law 3).
 * Reads the session only to name the patient's own hospital — never
 * redirects. `?from=catalog` skips the "What's happening?" tiles (the
 * catalog already knows); `?submission=` and `?items=` ride through to E2.
 */
type Search = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** The adult danger-sign strip (Appendix A.0) plus the next emergency items in catalog order. */
function pillTiles(): Tile[] {
  const strip = dangerSigns(CATALOG, "adult");
  const seen = new Set(strip.map((i) => i.key));
  const more = visibleItems(CATALOG, "adult").filter((i) => i.tier === "E" && !seen.has(i.key));
  return [...strip, ...more].slice(0, 8).map((i) => ({
    key: i.key,
    label: t(CATALOG, i.labelKey),
    icon: i.icon,
  }));
}

export default async function EmergencyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, ctx] = await Promise.all([searchParams, loadEmergencyContext()]);
  const fromCatalog = first(sp.from) === "catalog";
  const submissionId = first(sp.submission);
  const { primary, secondaries, drafts } = splitContacts(ctx.sheet.contacts);

  const preAlert = preAlertLive();
  const tell = new URLSearchParams();
  if (submissionId) tell.set("submission", submissionId);
  for (const k of Array.isArray(sp.items) ? sp.items : sp.items ? [sp.items] : []) {
    tell.append("items", k);
  }
  const tellHref = preAlert ? `/emergency/tell${tell.size ? `?${tell}` : ""}` : null;

  return (
    <div className="medsync-forced-light bg-background text-foreground min-h-svh">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
        <nav aria-label="Leave" className="flex justify-end">
          <Link
            href={ctx.signedIn ? "/patient" : "/"}
            className="text-muted-foreground hover:text-foreground text-body-s inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            Close
          </Link>
        </nav>

        <EmergencySheet
          primary={primary}
          secondaries={secondaries}
          drafts={ctx.drafts ? drafts : []}
          tiles={preAlert && !fromCatalog ? pillTiles() : null}
          tellHref={tellHref}
          submissionId={submissionId}
        />

        {firstAidCardsLive() ? <FirstAidCards /> : null}

        <nav aria-label="Other help" className="flex flex-col gap-1">
          <Link
            href="/emergency/crisis"
            className="text-primary text-body-s inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            Thinking of ending your life or harming yourself?
          </Link>
          <Link
            href="/emergency/sexual-violence"
            className="text-primary text-body-s inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            After sexual violence
          </Link>
        </nav>
      </main>
    </div>
  );
}
