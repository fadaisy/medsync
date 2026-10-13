import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { Pill } from "@/components/ui/pill";
import { LAB } from "@/content/lab";
import { LAB2 } from "@/content/lab-phase-2";
import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { conceptDef } from "@/lib/facts/project/shared";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labCatalogueV2LiveFor } from "@/lib/lab/feature";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { loadProfiles } from "@/lib/lab/profile-store";
import { ANALYSER_MODELS } from "@/lib/lab/profiles";
import { AddProfile, ProfileDetail } from "./_components/profile-forms";
import { blockerWords, PROFILES as C } from "./_lib/copy";

export const metadata: Metadata = { title: "Analyser profiles · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const NEW_CONCEPTS = new Map(V16.concepts.map((c) => [c.id, c.display]));
const display = (id: string) => conceptDef(id)?.display ?? NEW_CONCEPTS.get(id) ?? id;

/**
 * Analyser profiles (Lab Phase 2 §5.11, artboard 11; AP-1..AP-5). The cards, and the profile opened from
 * one: its mapping table, its open questions, what still blocks it, and "Use this profile". A profile in use
 * is frozen; a change is a new profile.
 */
export default async function ProfilesSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labCatalogueV2LiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const { open } = await searchParams;
  const profiles = await db.transaction((tx) => loadProfiles(tx as never, scope.hospitalId));
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  });
  const research = (model: string) => ANALYSER_MODELS[model]?.researchUse ?? [];
  const opened = profiles.find((p) => p.id === open);
  const state = (p: (typeof profiles)[number]) =>
    p.state === "in_use" ? (
      <StatusWord>{C.state.inUse(p.activatedAt ? date.format(p.activatedAt) : "")}</StatusWord>
    ) : (
      <StatusWord>{p.state === "draft" ? C.state.draft : C.state.retired}</StatusWord>
    );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={C.title}
        right={
          <AddProfile
            models={Object.entries(ANALYSER_MODELS).map(([id, m]) => ({ id, display: m.display }))}
          />
        }
      />
      <p className="text-body-s text-muted-foreground max-w-[75ch]">{C.lede}</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {profiles.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{C.none}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {profiles.map((p) => {
                const n = p.mappings.filter((m) => !research(p.model).includes(m.code)).length;
                const labOnly = p.mappings.filter((m) => m.visibility === "lab_only").length;
                return (
                  <li
                    key={p.id}
                    className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-heading-s">{p.modelDisplay}</h2>
                      <Pill>{C.kind[p.kind]}</Pill>
                    </div>
                    <p className="text-body-s text-muted-foreground">
                      {p.bench ?? C.noBench} · {C.parameters(n)}
                      {labOnly ? ` · ${LAB2.profile.labOnly(labOnly)}` : ""}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      {state(p)}
                      <Link
                        href={`/lab/setup/profiles?open=${p.id}`}
                        scroll={false}
                        aria-current={p.id === open ? "true" : undefined}
                        className="font-medium text-teal-700 underline-offset-4 hover:underline"
                      >
                        {C.open}
                        <span className="sr-only"> {p.modelDisplay}</span>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {opened ? (
            <ProfileDetail
              key={opened.id}
              id={opened.id}
              title={`${opened.modelDisplay}${opened.bench ? ` · ${opened.bench}` : ""}`}
              editable={opened.state === "draft"}
              rows={opened.mappings
                .filter((m) => !research(opened.model).includes(m.code))
                .map((m) => ({
                  ...m,
                  display: display(m.concept),
                  verified: opened.verifiedConcepts.includes(m.concept),
                }))}
              research={research(opened.model)}
              checks={opened.openChecks}
              blockers={opened.blockers.map((b) => blockerWords(b, display))}
            />
          ) : null}
        </div>
        <aside className="border-border bg-card h-fit rounded-lg border p-4">
          <p className="text-body-s">{C.sideCard}</p>
        </aside>
      </div>
    </div>
  );
}
