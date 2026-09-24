import type { PeopleItem } from "../_components/people/types";
import type { Metadata } from "next";
import { asc, ilike, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { userRoles } from "@/db/schema/user-roles";
import { users } from "@/db/schema/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PeopleTable } from "../_components/people/table";

export const metadata: Metadata = {
  title: "People · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SEARCH_LIMIT = 50;

interface SearchParams {
  q?: string;
}

/**
 * People — search + manage users across tenants. Server runs the
 * (server-controlled) search, normalises to PeopleItem[], and hands
 * off to the client PeopleTable which renders the DataTable + slide-
 * out multi-action detail panel.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const service = createServiceClient();
  const { data: callerRoles } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (!callerRoles?.some((r) => r.role === "superadmin")) {
    return <div className="mx-auto max-w-2xl px-5 py-12">Superadmin only.</div>;
  }

  const baseQuery = db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      state: users.state,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.fullName))
    .limit(SEARCH_LIMIT);

  const list = q
    ? await baseQuery.where(or(ilike(users.email, `%${q}%`), ilike(users.fullName, `%${q}%`)))
    : await baseQuery;

  const ids = list.map((u) => u.id);
  const rolesRows =
    ids.length === 0
      ? []
      : await db
          .select({
            userId: userRoles.userId,
            role: userRoles.role,
            hospitalId: userRoles.hospitalId,
          })
          .from(userRoles)
          .where(inArray(userRoles.userId, ids));
  const rolesByUser = new Map<string, Array<{ role: string; hospitalId: string | null }>>();
  for (const r of rolesRows) {
    const arr = rolesByUser.get(r.userId) ?? [];
    arr.push({ role: r.role, hospitalId: r.hospitalId });
    rolesByUser.set(r.userId, arr);
  }

  const items: PeopleItem[] = list.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    state: u.state,
    createdAtIso: u.createdAt.toISOString(),
    roles: rolesByUser.get(u.id) ?? [],
  }));

  return <PeopleTable items={items} currentUserId={userData.user.id} initialQuery={q} />;
}
