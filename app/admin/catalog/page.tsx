import type { Metadata } from "next";

import {
  listCadres,
  listCouncils,
  listDistricts,
  listRegions,
  listRoles,
  listSpecialties,
} from "@/lib/reference-data";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Catalog · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * GATE E — Catalog viewer (READ-ONLY).
 *
 * Browse councils → cadres → roles + the regions / districts / specialties
 * seed. Editing is deferred until preview + four-eyes + audit safeguards
 * are all in place (per kickoff Area 4): a careless role→permission
 * mapping change is the quietest catastrophic risk in the system.
 *
 * Every list reads from `lib/reference-data` which is already
 * unstable_cache-wrapped (1h TTL, tagged "reference-data") — so this
 * page is cheap to load even if hit often.
 */
export default async function CatalogPage() {
  // Re-gate at the page level.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const service = createServiceClient();
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!rolesData?.some((r) => r.role === "superadmin")) {
    return <div className="mx-auto max-w-2xl px-5 py-12">Superadmin only.</div>;
  }

  const [councils, allCadres, allRoles, regions, districts, specialties] = await Promise.all([
    listCouncils(),
    listCadres(),
    listRoles(),
    listRegions(),
    listDistricts(),
    listSpecialties(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Area 4 · Catalog
          <span aria-hidden="true">&middot;</span>
          <span className="text-amber-700 dark:text-amber-300">read-only</span>
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.02em] sm:text-[36px]"
          style={{ fontWeight: 400 }}
        >
          Catalog
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[13.5px]">
          Seeded reference data. Editing is deferred behind preview + four-eyes + audit (per kickoff
          Area 4) — role → permission edits are the quietest catastrophic risk in the system and
          never surface as a UI affordance without the safeguards.
        </p>
      </header>

      <CatalogSection title="Councils" count={councils.length}>
        <ul className="flex flex-col gap-1">
          {councils.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground">{c.name}</span>
              <span className="text-muted-foreground font-mono text-[11px]">{c.code}</span>
            </li>
          ))}
        </ul>
      </CatalogSection>

      <CatalogSection title="Cadres" count={allCadres.length}>
        <ul className="flex flex-col gap-1">
          {allCadres.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground">{c.name}</span>
              <span className="text-muted-foreground font-mono text-[11px]">{c.code}</span>
            </li>
          ))}
        </ul>
      </CatalogSection>

      <CatalogSection title="Roles" count={allRoles.length}>
        <ul className="flex flex-col gap-1">
          {allRoles.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground">{r.name}</span>
              <span className="text-muted-foreground font-mono text-[11px]">{r.code}</span>
            </li>
          ))}
        </ul>
      </CatalogSection>

      <CatalogSection title="Specialties" count={specialties.length}>
        <ul className="flex flex-col gap-1">
          {specialties.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground">{s.name}</span>
              <span className="text-muted-foreground font-mono text-[11px]">{s.code}</span>
            </li>
          ))}
        </ul>
      </CatalogSection>

      <CatalogSection title="Regions" count={regions.length}>
        <ul className="flex flex-wrap gap-2">
          {regions.map((r) => (
            <li
              key={r.id}
              className="border-border text-foreground rounded-sm border px-2 py-1 text-[12px]"
            >
              {r.name}
            </li>
          ))}
        </ul>
      </CatalogSection>

      <CatalogSection title="Districts" count={districts.length}>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {districts.map((d) => (
            <li key={d.id} className="text-foreground/85 text-[12.5px]">
              {d.name}
            </li>
          ))}
        </ul>
      </CatalogSection>
    </div>
  );
}

function CatalogSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-foreground text-[16px] font-medium tracking-tight">{title}</h2>
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
          {count} rows
        </span>
      </header>
      {children}
    </section>
  );
}
