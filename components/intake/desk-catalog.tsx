"use client";

import type { AudienceState } from "@/app/patient/symptoms/_components/audience-selector";
import type { CatalogRenderMode } from "@/lib/emergency/feature";
import type {
  CatalogItem,
  CategoryKey,
  SubmissionAudience,
  Tier,
} from "@/supabase/functions/_shared/symptom-catalog/types";
import { useEffect, useMemo, useState } from "react";

import { AudienceSelector, toAudience } from "@/app/patient/symptoms/_components/audience-selector";
import { CategoryGrid } from "@/app/patient/symptoms/_components/category-grid";
import { CategoryPane, emergencyFirst } from "@/app/patient/symptoms/_components/category-pane";
import { ItemRow } from "@/app/patient/symptoms/_components/item-row";
import { Search } from "@/app/patient/symptoms/_components/search";
import { Watermark } from "@/app/patient/symptoms/_components/watermark";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import {
  classify,
  searchItems,
  t,
  visibleCategories,
  visibleItems,
} from "@/supabase/functions/_shared/symptom-catalog/classify";
import { MAX_SELECTED_ITEMS } from "@/supabase/functions/_shared/symptom-catalog/types";

/**
 * The tiered catalog at the Front door (ADR 0098): the desk asks the same
 * question the patient answers on /patient/symptoms, with the same pieces —
 * who it is about, search, the category grid and its pane, the qualifier
 * chips under a chosen row — and the same `classify`, run here. What it
 * yields is a report for the form to post and a tier for the form to
 * SUGGEST a priority from; the tier writes nothing itself.
 *
 * NO emergency interrupt here: the receptionist is already at the hospital.
 * An emergency tier is words beside the tier word, and the entry is
 * registered as any other — triage re-assesses every arrival.
 */

export interface DeskCatalogValue {
  audience: SubmissionAudience;
  items: string[];
  qualifiers: Record<string, Record<string, string>>;
  tier: Tier;
  reasons: string[];
}

/** The desk's tier words — staff vocabulary, not the patient's "Get help now". */
export const DESK_TIER_WORD: Record<Tier, string> = {
  E: "Emergency",
  U: "Urgent",
  R: "Routine",
};
export const EMERGENCY_TIER_NOTE = "Emergency tier — register now and alert the receiving unit";

export function DeskCatalog({
  mode,
  showPregnancyForMe,
  onChange,
}: {
  mode: Exclude<CatalogRenderMode, "off">;
  /** The picked patient's sex at birth is not male (or unknown): show the pregnancy toggle for "Me". */
  showPregnancyForMe: boolean;
  onChange: (value: DeskCatalogValue) => void;
}) {
  const [audience, setAudience] = useState<AudienceState>({
    who: "me",
    ageBand: "child_2m_5y",
    pregnant: false,
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [qualifiers, setQualifiers] = useState<Record<string, Record<string, string>>>({});
  const [open, setOpen] = useState<CategoryKey | null>(null);

  const aud = toAudience(audience);
  const byKey = useMemo(
    () => new Map<string, CatalogItem>(CATALOG.items.map((i) => [i.key, i])),
    [],
  );
  const visible = useMemo(() => visibleItems(CATALOG, aud), [aud]);
  const categories = useMemo(() => visibleCategories(CATALOG, aud), [aud]);
  const results = useMemo(() => searchItems(CATALOG, aud, query), [aud, query]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const chosen = useMemo(
    () => selected.map((k) => byKey.get(k)).filter((i): i is CatalogItem => !!i),
    [selected, byKey],
  );
  const local = useMemo(
    () => classify({ audience: aud, items: selected, qualifiers }, CATALOG),
    [aud, selected, qualifiers],
  );

  // The form holds the report (a state setter, stable): every change goes up.
  useEffect(() => {
    onChange({
      audience: aud,
      items: selected,
      qualifiers,
      tier: local.tier,
      reasons: local.reasons,
    });
  }, [aud, selected, qualifiers, local, onChange]);

  const toggle = (key: string) => {
    if (selectedSet.has(key)) {
      setSelected((s) => s.filter((k) => k !== key));
      setQualifiers(({ [key]: _gone, ...rest }) => rest);
    } else {
      // The report's cap (the server refuses more).
      setSelected((s) => (s.length >= MAX_SELECTED_ITEMS ? s : [...s, key]));
    }
  };
  const answer = (itemKey: string, q: string, o: string) =>
    setQualifiers((all) => ({ ...all, [itemKey]: { ...all[itemKey], [q]: o } }));
  const changeAudience = (next: AudienceState) => {
    setAudience(next);
    // Items the new audience is never shown are dropped, not silently ignored.
    const keep = new Set(visibleItems(CATALOG, toAudience(next)).map((i) => i.key));
    setSelected((s) => s.filter((k) => keep.has(k)));
  };

  const searching = query.trim().length > 0;
  const counts = chosen.reduce<Record<string, number>>((acc, i) => {
    acc[i.category] = (acc[i.category] ?? 0) + 1;
    return acc;
  }, {});
  const pane = open ? categories.find((c) => c.key === open) : null;
  const reasons = chosen
    .filter((i) => local.reasons.includes(i.key))
    .map((i) => t(CATALOG, i.labelKey));

  return (
    <div className="flex flex-col gap-3">
      {mode === "draft_watermarked" ? <Watermark /> : null}
      <AudienceSelector
        value={audience}
        showPregnancyForMe={showPregnancyForMe}
        onChange={changeAudience}
      />
      <Search value={query} onChange={setQuery} />
      {searching ? (
        results.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Search results">
            {emergencyFirst(results).map((it) => (
              <ItemRow
                key={it.key}
                item={it}
                selected={selectedSet.has(it.key)}
                answers={qualifiers[it.key]}
                onToggle={() => toggle(it.key)}
                onAnswer={(q, o) => answer(it.key, q, o)}
              />
            ))}
          </ul>
        ) : (
          <p role="status" className="text-muted-foreground text-body-s">
            Nothing in the catalog matches. Pick an area below, or put it in their words.
          </p>
        )
      ) : (
        <>
          <CategoryGrid categories={categories} counts={counts} onOpen={setOpen} />
          {pane ? (
            <CategoryPane
              title={t(CATALOG, pane.labelKey)}
              items={visible.filter((i) => i.category === pane.key)}
              selected={selectedSet}
              qualifiers={qualifiers}
              onToggle={toggle}
              onAnswer={answer}
              onClose={() => setOpen(null)}
            />
          ) : null}
        </>
      )}

      {/* The compact review line: what was chosen, the tier as a word, and why. */}
      {chosen.length > 0 ? (
        <p role="status" className="text-body-s text-foreground leading-relaxed">
          <span className="font-medium">{DESK_TIER_WORD[local.tier]} tier</span>
          {reasons.length ? (
            <span className="text-muted-foreground"> · because of: {reasons.join(", ")}</span>
          ) : null}
          {local.tier === "E" ? (
            <>
              <br />
              <span className="font-medium">{EMERGENCY_TIER_NOTE}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
