import "server-only";

import type { PropertyValueType } from "@/lib/clerkship/symptom-engine";
import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import {
  symptomCatalog,
  symptomProperty,
  symptomPropertyMap,
  symptomPropertyOption,
} from "@/db/schema/symptom-catalog";

/**
 * Read side of the symptom catalog (server-only) — feeds the tap-first capture
 * UI. The catalogs are versioned reference data (migration 0042); these are pure
 * reads, no PHI. Decision-support: surfacing the relevant properties for a
 * symptom is structuring, not diagnosis.
 */

export interface CatalogSymptom {
  code: string;
  display: string;
  synonyms: string[];
  system: string;
}

export interface CatalogPropertyOption {
  value: string;
  display: string;
}

export interface CatalogProperty {
  code: string;
  display: string;
  valueType: PropertyValueType;
  unit: string | null;
  required: boolean;
  options: CatalogPropertyOption[];
}

/** The full active symptom list for the search/scroll picker. */
export async function loadSymptomCatalog(): Promise<CatalogSymptom[]> {
  const rows = await db
    .select({
      code: symptomCatalog.code,
      display: symptomCatalog.display,
      synonyms: symptomCatalog.synonyms,
      system: symptomCatalog.system,
    })
    .from(symptomCatalog)
    .where(eq(symptomCatalog.active, true))
    .orderBy(asc(symptomCatalog.sortOrder));
  return rows.map((r) => ({ ...r, synonyms: r.synonyms ?? [] }));
}

/**
 * The properties relevant to a symptom: the COMMON properties (apply to all) +
 * the symptom-specific mapped ones, each with its tappable value-set. Ordered.
 */
export async function loadPropertiesForSymptom(symptomCode: string): Promise<CatalogProperty[]> {
  // common ∪ mapped-for-this-symptom
  const props = await db
    .select({
      code: symptomProperty.code,
      display: symptomProperty.display,
      valueType: symptomProperty.valueType,
      unit: symptomProperty.unit,
      common: symptomProperty.common,
      sortOrder: symptomProperty.sortOrder,
      required: symptomPropertyMap.required,
      mapSort: symptomPropertyMap.sortOrder,
    })
    .from(symptomProperty)
    .leftJoin(
      symptomPropertyMap,
      and(
        eq(symptomPropertyMap.propertyCode, symptomProperty.code),
        eq(symptomPropertyMap.symptomCode, symptomCode),
      ),
    )
    .where(or(eq(symptomProperty.common, true), eq(symptomPropertyMap.symptomCode, symptomCode)));

  if (props.length === 0) return [];

  // Options for the select properties (one query, grouped in memory).
  const options = await db
    .select({
      propertyCode: symptomPropertyOption.propertyCode,
      value: symptomPropertyOption.value,
      display: symptomPropertyOption.display,
      sortOrder: symptomPropertyOption.sortOrder,
    })
    .from(symptomPropertyOption)
    .orderBy(asc(symptomPropertyOption.sortOrder));

  const byProp = new Map<string, CatalogPropertyOption[]>();
  for (const o of options) {
    const list = byProp.get(o.propertyCode) ?? [];
    list.push({ value: o.value, display: o.display });
    byProp.set(o.propertyCode, list);
  }

  return props
    .map((p) => ({
      code: p.code,
      display: p.display,
      valueType: p.valueType as PropertyValueType,
      unit: p.unit,
      required: p.required ?? false,
      // common first (lower base sort), then mapped order.
      _sort: p.common ? p.sortOrder : 1000 + (p.mapSort ?? p.sortOrder),
      options: byProp.get(p.code) ?? [],
    }))
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...rest }) => {
      void _sort;
      return rest;
    });
}
