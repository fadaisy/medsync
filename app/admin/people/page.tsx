import type { Metadata } from "next";
import { asc, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { userRoles } from "@/db/schema/user-roles";
import { users } from "@/db/schema/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PeopleRow } from "./_row";

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
 * GATE D — People &amp; access.
 *
 * Search + manage users across tenants. Every action runs on
 * operational fields only (no decrypted PHI ever appears here).
 * Sensitive actions (Create superadmin) wire through the four-eyes
 * helper — auto-satisfies today, will enforce a second approval
 * once a 2nd real superadmin exists.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  // Re-gate at the page level.
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

  // Resolve roles for the returned users in one batched query.
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
          .where(sql`${userRoles.userId} = ANY(${ids})`);
  const rolesByUser = new Map<string, Array<{ role: string; hospitalId: string | null }>>();
  for (const r of rolesRows) {
    const arr = rolesByUser.get(r.userId) ?? [];
    arr.push({ role: r.role, hospitalId: r.hospitalId });
    rolesByUser.set(r.userId, arr);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Area 3 · People &amp; access
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.02em] sm:text-[36px]"
          style={{ fontWeight: 400 }}
        >
          People &amp; access
        </h1>
        <p className="text-muted-foreground text-[13.5px]">
          Operational fields only — no PHI. Every action is audited.
        </p>
      </header>

      <form className="border-border bg-card flex items-center gap-2 rounded-lg border p-3">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by email or name…"
          className="border-input bg-background flex-1 rounded-sm border px-2.5 py-1.5 text-[13px] outline-none focus-visible:border-teal-500"
        />
        <button
          type="submit"
          className="rounded-md bg-teal-600 px-3 py-1.5 text-[12.5px] font-medium text-white dark:bg-teal-500"
        >
          Search
        </button>
      </form>

      <section className="border-border bg-card overflow-hidden rounded-lg border">
        {list.length === 0 ? (
          <div className="text-muted-foreground p-6 text-center text-[13.5px]">No users match.</div>
        ) : (
          <ul className="divide-border divide-y">
            {list.map((u) => (
              <PeopleRow
                key={u.id}
                userId={u.id}
                email={u.email}
                fullName={u.fullName}
                state={u.state}
                roles={rolesByUser.get(u.id) ?? []}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
