import { z } from "zod";

/**
 * Loose UUID validator for foreign-key fields that reference our
 * seeded reference data.
 *
 * Why not `z.string().uuid()`: Zod 4 tightened the spec on `.uuid()`
 * to enforce RFC 4122 version (1-8) AND variant (8/9/a/b) bits. Our
 * seeded reference-data IDs (regions, districts, subcounties,
 * councils, cadres, cadre_grades, specialties, roles, etc.) use
 * structured human-readable suffixes like
 *   00000000-0000-0000-0000-000000000101
 * which are syntactically valid UUIDs (right shape, right length, all
 * hex) but have version=0 and variant=0 — so strict .uuid() rejects
 * them. The forms then surface "Pick a district." even when the user
 * picked one and the correct FK shipped.
 *
 * For user-generated rows (auth.users.id from Supabase Auth) the
 * loose check is just as safe — those ARE proper v4 UUIDs and would
 * pass either validator. The loose check costs nothing for them.
 *
 * Use the `pickFromList(label)` builder so each field gets a useful
 * user-facing error.
 */
const LOOSE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const looseUuid = (message: string) => z.string().regex(LOOSE_UUID, message);

/** Shorthand for the common combobox case. */
export const pickFromList = (label: string) =>
  looseUuid(`Pick ${label.startsWith("a ") || label.startsWith("an ") ? label : "a " + label}.`);
