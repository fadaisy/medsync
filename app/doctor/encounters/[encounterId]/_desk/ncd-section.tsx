"use client";

import type { PulledVitals } from "../_components/ncd-capture";
import type { AgeBand, NcdCatalog } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import type { DiabetesPack } from "@/lib/ncd/pack/types";

import { DIABETES_CATALOG, DISTRICT_SITE, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { NcdClerkship } from "../_components/ncd-clerkship";

export interface NcdSeed {
  initialValues: CaptureMap;
  ageBand?: AgeBand;
  pulled?: PulledVitals;
  /** NCD_DM_PACK_LIVE: the pack's form (the v0.1.0 form plus its own questions) and its lean data. */
  catalog?: NcdCatalog;
  pack?: {
    data: DiabetesPack;
    fields: string[];
    ageYears?: number | null;
    careSetting?: "outpatient" | "emergency" | "inpatient" | null;
  };
}

/**
 * The NCD module as a section of the note (HARMONISATION §5.3). The existing NcdClerkship,
 * unchanged, embedded; its capture is part of the note content (section `ncd`, one `ncd_capture`
 * item) and autosaves with the note. At signing it commits as facts through lib/ncd/cfc-map, in
 * the signing transaction (D-EMR-01). Loaded only when the section is opened: the NCD catalogue
 * never weighs on the desk's first paint.
 */
export default function NcdSection({
  seed,
  onChange,
}: {
  seed: NcdSeed;
  onChange: (values: CaptureMap) => void;
}) {
  return (
    <NcdClerkship
      catalog={seed.catalog ?? DIABETES_CATALOG}
      pack={seed.pack}
      site={REFERRAL_SITE}
      siteOptions={[REFERRAL_SITE, DISTRICT_SITE]}
      initialValues={seed.initialValues}
      ageBand={seed.ageBand}
      pulled={seed.pulled}
      onChange={onChange}
    />
  );
}
