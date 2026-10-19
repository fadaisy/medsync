import type { AudienceChoice } from "@/components/symptoms/audience-selector";
import type { Palette } from "@/theme/tokens";
import type { CatalogItem, SubmissionAudience } from "@shared/symptom-catalog/types";
import type { ReactNode } from "react";
import { useState } from "react";
import { CATALOG } from "@shared/symptom-catalog/catalog.v0.1";
import {
  classify,
  dangerSigns,
  t,
  visibleCategories,
  visibleItems,
} from "@shared/symptom-catalog/classify";
import { MAX_SELECTED_ITEMS } from "@shared/symptom-catalog/types";
import { StyleSheet, View } from "react-native";

import {
  AudienceSelector,
  DEFAULT_AUDIENCE,
  fromAudience,
  toAudience,
} from "@/components/symptoms/audience-selector";
import { CategoryGrid } from "@/components/symptoms/category-grid";
import { CategorySheet } from "@/components/symptoms/category-sheet";
import { DangerStrip } from "@/components/symptoms/danger-strip";
import { EmergencyInterrupt } from "@/components/symptoms/emergency-interrupt";
import { Search } from "@/components/symptoms/search";
import { SelectionTray } from "@/components/symptoms/selection-tray";
import { Watermark } from "@/components/symptoms/watermark";
import { Screen } from "@/components/ui/screen";
import { useStyles } from "@/theme/theme";
import { space } from "@/theme/tokens";

/**
 * S1's height budget at 360×640 (PRD §7.2) — the zones on screen before
 * anything is ticked. The tray (64) docks over the content once something
 * is, so it is not in the sum. 616 + gaps: one short scroll at most on
 * 360×640, none on 360×740. No nested scroll regions, no carousels.
 */
export const S1_BUDGET = { appBar: 56, audience: 44, search: 48, dangerStrip: 132, grid: 336 };

/** What S1 hands to S4: the choices, never a tier. */
export interface CatalogSelection {
  audience: SubmissionAudience;
  pregnant: boolean;
  items: string[];
  qualifiers: Record<string, Record<string, string>>;
}

/**
 * S1–S3 (PRD §7.2): audience, search, the danger strip, the category grid,
 * the sheet, the tray — one screen of state. Selection is a set of catalog
 * keys plus qualifier answers. The interrupt is DERIVED from the local
 * classification (§5.4), the web's pattern: an emergency-tier item opens it
 * the moment it is ticked, and so does a qualifier answer or a combination
 * (R2/R3/R4) that escalates the whole selection to E. "This is not
 * happening now" declines that reason until it is removed and chosen again.
 */
export function SymptomCatalog({
  onBack,
  trailing,
  showPregnancy,
  initial,
  openCategory,
  watermark,
  hospitalName,
  emergencyPhone,
  onContinue,
  onGetHelp,
}: {
  onBack: () => void;
  /** The Emergency disc, on the back row (ADR 0098 ruling 7). */
  trailing: ReactNode;
  /** The profile's sex is female or unknown — the pregnancy toggle applies to "Me". */
  showPregnancy: boolean;
  /** Where to start: the home's danger tile arrives with one item; S4's Back brings the whole selection. */
  initial?: Partial<CatalogSelection>;
  /** Open on one body area's list: Book's "Something is wrong" door arrives with the area tapped. */
  openCategory?: string;
  watermark: boolean;
  hospitalName: string | null;
  emergencyPhone: string | null;
  onContinue: (selection: CatalogSelection) => void;
  /** The interrupt's "Get help now": the screen takes the patient to the Emergency sheet with what is ticked. */
  onGetHelp: (item: CatalogItem, selection: CatalogSelection) => void;
}) {
  const styles = useStyles(makeStyles);
  const [choice, setChoice] = useState<AudienceChoice>(() =>
    initial?.audience
      ? fromAudience(initial.audience, initial.pregnant ?? false)
      : DEFAULT_AUDIENCE,
  );
  const [items, setItems] = useState<string[]>(() =>
    (initial?.items ?? []).filter((k) => CATALOG.items.some((i) => i.key === k)),
  );
  const [qualifiers, setQualifiers] = useState<Record<string, Record<string, string>>>(
    () => initial?.qualifiers ?? {},
  );
  const [sheet, setSheet] = useState<{ title: string; items: CatalogItem[] } | null>(() => {
    const category = CATALOG.categories.find((c) => c.key === openCategory);
    if (!category) return null;
    const startAudience = toAudience(
      initial?.audience
        ? fromAudience(initial.audience, initial.pregnant ?? false)
        : DEFAULT_AUDIENCE,
    );
    return {
      title: t(CATALOG, category.labelKey),
      items: visibleItems(CATALOG, startAudience).filter((i) => i.category === category.key),
    };
  });
  // Arriving with ONE item ticked (the home's danger tile) is a selection like
  // any other: an emergency-tier one interrupts. A whole selection coming
  // back from S4 has already been through it, so its reasons start declined.
  const [declined, setDeclined] = useState<string[]>(() => {
    if (!initial?.audience || !initial.items?.length) return [];
    return classify(
      { audience: initial.audience, items: initial.items, qualifiers: initial.qualifiers ?? {} },
      CATALOG,
    ).reasons;
  });

  const audience = toAudience(choice);
  const visible = visibleItems(CATALOG, audience);
  const categories = visibleCategories(CATALOG, audience);
  const strip = dangerSigns(CATALOG, audience);
  const emergencies = visible.filter((i) => i.tier === "E");
  const chosen = visible.filter((i) => items.includes(i.key));
  const local = classify({ audience, items, qualifiers }, CATALOG);
  const interruptKey =
    local.tier === "E" ? (local.reasons.find((k) => !declined.includes(k)) ?? null) : null;
  const interrupt = interruptKey
    ? (CATALOG.items.find((i) => i.key === interruptKey) ?? null)
    : null;
  const counts: Record<string, number> = {};
  for (const i of chosen) counts[i.category] = (counts[i.category] ?? 0) + 1;

  const changeAudience = (next: AudienceChoice) => {
    setChoice(next);
    // What the new audience cannot see is dropped, not carried silently.
    const still = new Set(visibleItems(CATALOG, toAudience(next)).map((i) => i.key));
    setItems((prev) => prev.filter((k) => still.has(k)));
    setDeclined((prev) => prev.filter((k) => still.has(k)));
  };

  const toggle = (item: CatalogItem) => {
    if (items.includes(item.key)) {
      setItems(items.filter((k) => k !== item.key));
      const { [item.key]: _dropped, ...rest } = qualifiers;
      setQualifiers(rest);
      // Removed, so choosing it again interrupts again.
      setDeclined(declined.filter((k) => k !== item.key));
      return;
    }
    // The report's cap (the server refuses more).
    if (items.length >= MAX_SELECTED_ITEMS) return;
    setItems([...items, item.key]);
  };

  const answer = (itemKey: string, qualifierKey: string, optionKey: string) =>
    setQualifiers({
      ...qualifiers,
      [itemKey]: { ...qualifiers[itemKey], [qualifierKey]: optionKey },
    });

  const rows = {
    selected: items,
    qualifiers,
    onToggle: toggle,
    onAnswer: answer,
  };

  return (
    <Screen
      title="What's wrong?"
      onBack={onBack}
      trailing={trailing}
      footer={
        chosen.length > 0 ? (
          <SelectionTray
            items={chosen}
            onRemove={toggle}
            onContinue={() =>
              onContinue({ audience, pregnant: choice.pregnant, items, qualifiers })
            }
          />
        ) : undefined
      }
    >
      <View style={styles.stack}>
        {watermark ? <Watermark /> : null}
        <AudienceSelector value={choice} onChange={changeAudience} showPregnancy={showPregnancy} />
        <Search audience={audience} {...rows} />
        <DangerStrip
          items={strip}
          selected={items}
          onPress={toggle}
          allCount={emergencies.length}
          onAll={() => setSheet({ title: t(CATALOG, "strip.title"), items: emergencies })}
        />
        <CategoryGrid
          categories={categories}
          counts={counts}
          onOpen={(category) =>
            setSheet({
              title: t(CATALOG, category.labelKey),
              items: visible.filter((i) => i.category === category.key),
            })
          }
        />
      </View>

      {/* iOS shows one Modal at a time: the sheet steps aside while the interrupt is up and returns on decline. */}
      <CategorySheet
        title={interrupt ? null : (sheet?.title ?? null)}
        items={sheet?.items ?? []}
        {...rows}
        onClose={() => setSheet(null)}
      />
      <EmergencyInterrupt
        item={interrupt}
        hospitalName={hospitalName}
        emergencyPhone={emergencyPhone}
        onGetHelp={() => {
          const item = interrupt as CatalogItem;
          setDeclined([...declined, item.key]);
          onGetHelp(item, { audience, pregnant: choice.pregnant, items, qualifiers });
        }}
        onNotNow={() => {
          if (interruptKey) setDeclined([...declined, interruptKey]);
        }}
      />
    </Screen>
  );
}

const makeStyles = (_c: Palette) => StyleSheet.create({ stack: { gap: space[4] } });
