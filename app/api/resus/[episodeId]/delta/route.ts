import { fetchResusDeltaV2 } from "@/app/nurse/resus/_v2/actions-survey";

export const dynamic = "force-dynamic";

/**
 * The desk's delta read (R5) as a plain GET: the same scoped read as
 * fetchResusDeltaV2 (resusScopeOrNull → prelude → fetchResusEventsSince, plus
 * serverTime), but outside Next's one-at-a-time server-action queue, so a poll
 * or a clock sample never waits behind a write. A lapsed session answers
 * `{ ok: false, signedOut: true }`, never a redirect.
 */
export async function GET(request: Request, ctx: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await ctx.params;
  const sinceIso = new URL(request.url).searchParams.get("since") ?? "";
  const r = await fetchResusDeltaV2({ episodeId, sinceIso });
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
