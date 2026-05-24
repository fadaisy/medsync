import { asc } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { users } from "@/db/schema/users";

/**
 * Server-side prefetch for the command palette's entity search.
 *
 * For the workspace's current scale (a few hospitals, dozens of
 * users) the cheapest approach is to fetch the lot at layout time
 * and let the client filter. When this grows past ~500 of either
 * we'll move to a debounced /api/search?q= Server Action.
 *
 * Returns only the fields the palette renders. Failure-tolerant:
 * any query failure yields empty arrays so the palette still loads
 * with navigation entries.
 */

export interface PaletteHospital {
  id: string;
  name: string;
  slug: string;
  state: string;
}

export interface PalettePerson {
  id: string;
  email: string;
  fullName: string;
}

export async function getPaletteEntities(): Promise<{
  hospitals: PaletteHospital[];
  people: PalettePerson[];
}> {
  try {
    const [h, u] = await Promise.all([
      db
        .select({
          id: hospitals.id,
          name: hospitals.name,
          slug: hospitals.slug,
          state: hospitals.state,
        })
        .from(hospitals)
        .orderBy(asc(hospitals.name))
        .limit(200),
      db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
        })
        .from(users)
        .orderBy(asc(users.fullName))
        .limit(200),
    ]);
    return { hospitals: h, people: u };
  } catch {
    return { hospitals: [], people: [] };
  }
}
