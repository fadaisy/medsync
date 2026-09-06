/**
 * The assembled patient profile — one pure call from captured values to
 * everything the surface renders. No I/O, no clinical content.
 *
 * Order is deliberate: the acute interlock runs FIRST and is reported first,
 * because a hyperglycaemic emergency is not a row in a chronic review.
 */
import type { NcdCatalog, SiteProfile, StandardBody } from "@/lib/ncd/catalog/schema";
import type {
  ActiveCaveat,
  AcuteFlag,
  ClassificationResult,
  ComplicationResult,
  DangerSign,
  DiagnosisResult,
  Gap,
  TherapyConcern,
} from "@/lib/ncd/engine/assess";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";

import { isPerformable } from "@/lib/ncd/catalog/schema";
import {
  activeCaveats,
  acuteInterlock,
  assessComplications,
  classify,
  dangerSigns,
  diagnose,
  gaps,
  ncdContext,
  therapyConcerns,
} from "@/lib/ncd/engine/assess";

/**
 * How much of the protocol has actually been done — shown as prominently as the
 * findings themselves, because a confident-looking profile built on three
 * answered questions is the failure mode this whole design exists to prevent.
 *
 * `unavailable` is counted separately and is NOT a gap: it is the denominator
 * shrinking, not the clinician falling short.
 */
export interface Completeness {
  recorded: number;
  /** Performable here, but not yet done. */
  outstanding: number;
  /** Cannot be done at this site at all. */
  unavailable: number;
  /** recorded / (recorded + outstanding) — excludes what the site cannot do. */
  percent: number;
}

export interface NcdProfile {
  catalogId: string;
  catalogVersion: string;
  site: { id: string; display: string };
  /** The standard that produced the diagnostic verdict. */
  standardApplied?: { body: StandardBody; version: string };
  /** Emergencies. Non-empty means stop and escalate. */
  acute: AcuteFlag[];
  /**
   * Findings urgent on their own, before any complication is established. These
   * reach sites that cannot run the confirmatory tests at all.
   */
  dangerSigns: DangerSign[];
  /** Recorded therapy a guideline says is wrong for this patient. */
  therapyConcerns: TherapyConcern[];
  diagnosis: DiagnosisResult;
  classification: ClassificationResult;
  complications: ComplicationResult[];
  /** Every caveat currently undermining a test result. */
  caveats: ActiveCaveat[];
  gaps: Gap[];
  completeness: Completeness;
  /** True while any citation in the catalog is unratified. */
  gatedDark: boolean;
}

export function buildProfile(args: {
  catalog: NcdCatalog;
  values: CaptureMap;
  site: SiteProfile;
  /** Set when the patient already carries the diagnosis — skips re-adjudication. */
  established?: boolean;
}): NcdProfile {
  const { catalog, values, site } = args;
  const ctx = ncdContext(catalog, values, site);

  const acute = acuteInterlock(catalog, ctx);
  const diagnosis = diagnose(catalog, ctx, { established: args.established });
  const classification = classify(catalog, ctx);
  const complications = assessComplications(catalog, ctx);

  return {
    catalogId: catalog.id,
    catalogVersion: catalog.version,
    site: { id: site.id, display: site.display },
    standardApplied:
      diagnosis.standard && diagnosis.version
        ? { body: diagnosis.standard, version: diagnosis.version }
        : undefined,
    acute,
    dangerSigns: dangerSigns(catalog, ctx),
    therapyConcerns: therapyConcerns(catalog, ctx),
    diagnosis,
    classification,
    complications,
    caveats: activeCaveats(catalog, ctx),
    gaps: gaps(catalog, diagnosis, complications, ctx),
    completeness: completenessOf(catalog, values, site),
    gatedDark: !isFullySigned(catalog),
  };
}

function completenessOf(catalog: NcdCatalog, values: CaptureMap, site: SiteProfile): Completeness {
  let recorded = 0;
  let outstanding = 0;
  let unavailable = 0;
  for (const f of catalog.features) {
    // Off-protocol notes are not questions, so they belong in neither half of
    // the fraction. Counted as outstanding, a clerking could never reach 100%
    // for any patient with nothing extra to say.
    if (f.offProtocol) continue;
    const v = values[f.code];
    if (v?.state === "recorded") recorded++;
    else if (v?.state === "unavailable" || !isPerformable(f, site)) unavailable++;
    else outstanding++;
  }
  const denom = recorded + outstanding;
  return {
    recorded,
    outstanding,
    unavailable,
    percent: denom === 0 ? 0 : Math.round((recorded / denom) * 100),
  };
}

/** Every clinical assertion ratified? Until then the module stays gated dark. */
function isFullySigned(catalog: NcdCatalog): boolean {
  const cites = [
    ...catalog.diagnosis.flatMap((s) => [s.citation, ...s.anyOf.map((c) => c.citation)]),
    ...(catalog.classifications ?? []).flatMap((c) => [
      c.citation,
      ...c.supportedBy.map((x) => x.citation),
    ]),
    ...catalog.complications.flatMap((c) => [
      c.citation,
      ...c.establishedBy.map((x) => x.citation),
      ...(c.staging ?? []).map((s) => s.citation),
    ]),
    ...(catalog.validityCaveats ?? []).map((v) => v.citation),
    ...(catalog.therapyFlags ?? []).map((t) => t.citation),
  ];
  return cites.every((c) => c.csoSigned);
}
