"use server";

import { z } from "zod";

import { searchPlaces } from "@/lib/geo";
import { requireNcdScope } from "@/lib/ncdreg/scope";

/** District / sub-county lookup for the residence field (D-13: parish and village stay free text). */
export async function placeSearchAction(q: string) {
  await requireNcdScope();
  const query = z.string().max(60).parse(q);
  return searchPlaces(query).map((p) => ({
    code: p.code,
    label: p.label,
    level: p.level,
    district: p.district,
    subcounty: p.level === "subcounty" ? { code: p.code, name: p.name } : null,
  }));
}
