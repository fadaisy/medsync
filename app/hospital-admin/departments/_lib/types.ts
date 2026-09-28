/** What every hub server action returns (kept out of the "use server" file — Turbopack treats its exports as actions). */
export type HubResult = { ok: true; data?: Record<string, unknown> } | { ok: false; error: string };
