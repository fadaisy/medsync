import raw from "@/data/clerking/clerking-exam-catalogue.v1.json";

/**
 * The signed examination catalogue (MS-EMR-EXAM-CAT-001), fetched once per session by the v2 desk
 * (PROMPT-CLERKING-EXAM-V2 §6). Reference content, no patient data. Prerendered at build and served
 * minified; the desk asks for it with `?v=<hash>`, so a new catalogue is a new URL.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(raw, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
