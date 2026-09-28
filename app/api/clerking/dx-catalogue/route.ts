import { DX_SERVED } from "@/lib/clerking/impression/load";

/**
 * The signed diagnosis reasoning catalogue (MS-EMR-DX-CAT-001) and its term map, fetched once per
 * session by the v2 desk (PROMPT-CLERKING-SUMMARY-IMPRESSION §6). Reference content, no patient
 * data. Prerendered at build; the desk asks for it with `?v=<hash>`, so a new catalogue is a new
 * URL and the browser may keep this one for a year.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(DX_SERVED, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
