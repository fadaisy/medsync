import "server-only";

import type { PropertyValueType } from "@/lib/clerkship/symptom-engine";
import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { clerkshipPicklist } from "@/db/schema/clerkship-picklist";
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
  /** Attribution for doctor-created (personal/approved) entries; null for seeds. */
  createdByName?: string | null;
  createdAtIso?: string | null;
  /** 'shared' (base catalog) | 'personal' (this doctor's own template). */
  scope?: string;
}

/** A property the doctor can tap to map onto a new complaint (mapping picker). */
export interface CatalogPropertySummary {
  code: string;
  display: string;
  valueType: PropertyValueType;
  common: boolean;
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

/**
 * The active symptom list for the search/scroll picker — the SHARED base catalog
 * plus the viewer's own PERSONAL doctor-created templates (migration 0044). A
 * personal entry is never visible to other clinicians (RLS backs this too).
 */
export async function loadSymptomCatalog(viewerUserId?: string): Promise<CatalogSymptom[]> {
  const visible = viewerUserId
    ? or(eq(symptomCatalog.scope, "shared"), eq(symptomCatalog.createdByUserId, viewerUserId))
    : eq(symptomCatalog.scope, "shared");
  const rows = await db
    .select({
      code: symptomCatalog.code,
      display: symptomCatalog.display,
      synonyms: symptomCatalog.synonyms,
      system: symptomCatalog.system,
      createdByName: symptomCatalog.createdByName,
      scope: symptomCatalog.scope,
      createdAt: symptomCatalog.createdAt,
    })
    .from(symptomCatalog)
    .where(and(eq(symptomCatalog.active, true), visible))
    .orderBy(asc(symptomCatalog.sortOrder));
  return rows.map((r) => ({
    code: r.code,
    display: r.display,
    synonyms: r.synonyms ?? [],
    system: r.system,
    createdByName: r.createdByName ?? null,
    createdAtIso: r.createdAt ? r.createdAt.toISOString() : null,
    scope: r.scope,
  }));
}

/** Every property in the catalog — for the create-complaint mapping picker. */
export async function loadPropertyCatalog(): Promise<CatalogPropertySummary[]> {
  const rows = await db
    .select({
      code: symptomProperty.code,
      display: symptomProperty.display,
      valueType: symptomProperty.valueType,
      common: symptomProperty.common,
    })
    .from(symptomProperty)
    .orderBy(asc(symptomProperty.sortOrder));
  return rows.map((r) => ({
    code: r.code,
    display: r.display,
    valueType: r.valueType as PropertyValueType,
    common: r.common,
  }));
}

/** A clerkship history-section pick-list item (migration 0046). */
export interface PicklistItem {
  code: string;
  listType: string;
  display: string;
  synonyms: string[];
  /** list-specific extras (e.g. { complications: string[] }). */
  meta: Record<string, unknown>;
  ugandaFlag: string | null;
}

/** All active clerkship pick-lists, grouped by list_type (one query). */
export async function loadClerkshipPicklists(): Promise<Record<string, PicklistItem[]>> {
  const rows = await db
    .select({
      code: clerkshipPicklist.code,
      listType: clerkshipPicklist.listType,
      display: clerkshipPicklist.display,
      synonyms: clerkshipPicklist.synonyms,
      meta: clerkshipPicklist.meta,
      ugandaFlag: clerkshipPicklist.ugandaFlag,
    })
    .from(clerkshipPicklist)
    .where(eq(clerkshipPicklist.active, true))
    .orderBy(asc(clerkshipPicklist.listType), asc(clerkshipPicklist.sortOrder));
  const grouped: Record<string, PicklistItem[]> = {};
  for (const r of rows) {
    (grouped[r.listType] ??= []).push({
      code: r.code,
      listType: r.listType,
      display: r.display,
      synonyms: r.synonyms ?? [],
      meta: (r.meta ?? {}) as Record<string, unknown>,
      ugandaFlag: r.ugandaFlag ?? null,
    });
  }
  return grouped;
}

/** A screening symptom for the Review-of-Systems sweep (migration 0045). */
export interface RosScreenSymptom {
  code: string;
  display: string;
  system: string;
  isPain: boolean;
  mustNotMiss: boolean;
  ugandaFlag: string | null;
}

/** The ROS screening symptoms (ros_screen = true), ordered by system + sort. */
export async function loadRosCatalog(): Promise<RosScreenSymptom[]> {
  const rows = await db
    .select({
      code: symptomCatalog.code,
      display: symptomCatalog.display,
      system: symptomCatalog.system,
      isPain: symptomCatalog.isPain,
      mustNotMiss: symptomCatalog.mustNotMiss,
      ugandaFlag: symptomCatalog.ugandaFlag,
    })
    .from(symptomCatalog)
    .where(and(eq(symptomCatalog.active, true), eq(symptomCatalog.rosScreen, true)))
    .orderBy(asc(symptomCatalog.system), asc(symptomCatalog.sortOrder));
  return rows.map((r) => ({
    code: r.code,
    display: r.display,
    system: r.system,
    isPain: r.isPain,
    mustNotMiss: r.mustNotMiss,
    ugandaFlag: r.ugandaFlag ?? null,
  }));
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
