import raw from "@/data/clerking/clerking-history-catalogue.v1.json";

/**
 * The signed clerking catalogue (MS-EMR-CLERK-CAT-001), fetched once per session by the v2 desk.
 * Reference content, no patient data. Prerendered at build; the desk asks for it with `?v=<hash>`,
 * so a new catalogue is a new URL and the browser may keep this one for a year.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(raw, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
