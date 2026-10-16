import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { LAB3_HIV_PURPOSE, LAB3_HMIS } from "@/content/lab-phase-3";
import V16 from "@/data/emr/clinical-fact-concepts.v1.6.json";
import { db } from "@/db";
import { labEqaRounds, labSignedConfigs, labStockItems, testCatalogue } from "@/db/schema";
import { REJECTION_REASONS, SPECIMEN_TYPES } from "@/lib/emr/write/specimens";
import { conceptDef } from "@/lib/facts/project/shared";
import { labHmisLiveFor } from "@/lib/lab/feature";
import { hmisForm } from "@/lib/lab/hmis-form";
import { blockWords, inHouseMenu, mappingBlocks, mappingVersions } from "@/lib/lab/hmis-store";
import { analyteName } from "@/lib/lab/qc-store";
import { AVAILABILITY_REASONS } from "@/supabase/functions/_shared/services-hub";
import { dateWords } from "../../_lib/days";
import { requireQualityScope } from "../../quality/_lib/scope";
import { MappingEditor } from "./_components/mapping-editor";

export const metadata: Metadata = { title: "HMIS mapping · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const ENCOUNTER_TYPES = [
  "opd",
  "inpatient",
  "emergency",
  "follow_up",
  "tele",
  "antenatal",
  "procedure",
  "virtual",
  "community",
];
const V16C = V16.concepts as { id: string; answers?: string[] | null }[];
const EXT = V16.answerExtensions as Record<string, string[]>;
const answersOf = (id: string) => [
  ...new Set([
    ...(conceptDef(id)?.answers ?? V16C.find((c) => c.id === id)?.answers ?? []),
    ...(EXT[id] ?? []),
  ]),
];

/**
 * The HMIS 105 mapping editor (HM-2, §5.14: no artboard; built from the specification with the same parts).
 * Every choice is the laboratory lead's, signed by the lead and the HMIS focal person: nothing maps a test to a
 * row by itself (Law 3). S40: unsigned while a test on the menu is in no row and not marked "not reported".
 */
export default async function HmisMappingPage() {
  const { scope } = await requireQualityScope(labHmisLiveFor);
  const p = scope.access.permissions;
  const lead = p.has("lab.hmis.check") || p.has("lab.manage");
  const f = hmisForm();
  const h = scope.hospitalId;
  const [versions, menu, items, rounds, algorithms] = await db.transaction(async (t) =>
    Promise.all([
      mappingVersions(t as never, h, f.form),
      inHouseMenu(t as never, h),
      t.select().from(labStockItems).where(eq(labStockItems.hospitalId, h)),
      t
        .select({ samples: labEqaRounds.samples })
        .from(labEqaRounds)
        .where(eq(labEqaRounds.hospitalId, h)),
      t
        .select({ payload: labSignedConfigs.payload })
        .from(labSignedConfigs)
        .where(
          and(
            or(isNull(labSignedConfigs.hospitalId), eq(labSignedConfigs.hospitalId, h)),
            eq(labSignedConfigs.kind, "hiv_algorithm"),
          ),
        ),
    ]),
  );
  const tests = menu.length
    ? await db
        .select({
          code: testCatalogue.code,
          name: testCatalogue.display,
          components: testCatalogue.components,
          restrictedClass: testCatalogue.restrictedClass,
        })
        .from(testCatalogue)
        .where(
          and(
            inArray(testCatalogue.code, menu),
            or(isNull(testCatalogue.hospitalId), eq(testCatalogue.hospitalId, h)),
          ),
        )
    : [];
  const v2 = V16.testsV2 as Record<string, string[]>;
  const testOptions = tests
    .map((t) => {
      const components = [...new Set([...t.components, ...(v2[t.code] ?? [])])];
      return {
        code: t.code,
        name: t.name,
        hiv: t.restrictedClass === "hiv",
        components: components.map((c) => ({ id: c, name: analyteName(c), answers: answersOf(c) })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const kits = [
    ...new Set([
      ...algorithms
        .flatMap((a) => (a.payload as { assays?: { kit: string }[] }).assays ?? [])
        .map((a) => a.kit),
      ...rounds.flatMap((r) => (r.samples as { kit?: string | null }[]).map((s) => s.kit ?? "")),
    ]),
  ].filter(Boolean);
  const draft = versions.find((m) => m.status === "draft") ?? null;
  const signed = versions.find((m) => m.status === "signed") ?? null;
  const blocks = draft
    ? (await db.transaction((t) => mappingBlocks(t as never, h, draft.payload, f))).map(blockWords)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={LAB3_HMIS.mapping}
        subline={`Form ${f.form.version} · file ${f.hash.slice(0, 12)}`}
        right={
          <Link
            href="/lab/hmis"
            className="font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            {LAB3_HMIS.title}
          </Link>
        }
      />
      <div className="text-body-s flex flex-wrap items-center gap-3">
        {!f.form.verified ? <StatusWord tone="caution">{LAB3_HMIS.unverified}</StatusWord> : null}
        {signed ? (
          <StatusWord>{`Version ${signed.version} in force since ${dateWords(signed.inForceFrom!)}`}</StatusWord>
        ) : (
          <StatusWord tone="caution">No mapping is signed yet</StatusWord>
        )}
        {draft?.leadSignedBy ? (
          <StatusWord>Signed by the laboratory lead; waiting for the HMIS focal person</StatusWord>
        ) : null}
      </div>
      <p className="text-body-s text-muted-foreground max-w-[75ch]">{f.form.note}</p>
      <MappingEditor
        lead={lead}
        form={f.form}
        formHash={f.hash}
        initial={(draft ?? signed)?.payload ?? null}
        draft={
          draft
            ? {
                id: draft.id,
                authoredByMe: draft.authoredBy === scope.userId,
                leadSigned: !!draft.leadSignedBy,
              }
            : null
        }
        blocks={blocks}
        tests={testOptions}
        kits={kits}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          tracer: i.hmisTracerCode,
        }))}
        specimenTypes={[...SPECIMEN_TYPES]}
        encounterTypes={ENCOUNTER_TYPES}
        rejectionReasons={[...REJECTION_REASONS]}
        reasons={[
          ...AVAILABILITY_REASONS.map((r) => ({ code: r.code, label: r.label })),
          { code: "referred", label: "Referred by the hub (no problem open)" },
          { code: "none", label: "Placed before the reason was recorded" },
        ]}
        purposes={Object.entries(LAB3_HIV_PURPOSE.words).map(([code, label]) => ({ code, label }))}
      />
    </div>
  );
}
