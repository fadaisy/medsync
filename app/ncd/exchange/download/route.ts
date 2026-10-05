import { NcdError } from "@/lib/ncdreg/context";
import { aggregateCsv, dhis2DataValueSet, fhirBundle, fullExport, researchExtract } from "@/lib/ncdreg/exchange";
import { LEGACY_TEMPLATE } from "@/lib/ncdreg/exchange/legacy";
import { requireNcdScope } from "@/lib/ncdreg/scope";

/** H1–H5 downloads. Each export is logged; refusals come back as plain text with the reason. */
export async function GET(req: Request) {
  const { ctx } = await requireNcdScope();
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind");
  const month = u.searchParams.get("month") ?? "";
  try {
    if (!/^\d{4}-\d{2}$/.test(month) && (kind === "aggregate_csv" || kind === "dhis2")) throw new NcdError("invalid", "Choose a month.");
    const f =
      kind === "aggregate_csv"
        ? await aggregateCsv(ctx, month)
        : kind === "dhis2"
          ? await dhis2DataValueSet(ctx, month)
          : kind === "fhir"
            ? await fhirBundle(ctx)
            : kind === "research"
              ? await researchExtract(ctx, u.searchParams.get("request") ?? "")
              : kind === "full"
                ? await fullExport(ctx)
                : kind === "template"
                  ? { fileName: "ncd-legacy-import-template.csv", contentType: "text/csv", body: LEGACY_TEMPLATE }
                  : null;
    if (!f) return new Response("Unknown export.", { status: 404 });
    return new Response(f.body, { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.fileName}"`, "cache-control": "no-store" } });
  } catch (e) {
    const status = e instanceof NcdError && e.code === "forbidden" ? 403 : 409;
    return new Response(e instanceof Error ? e.message : "Refused.", { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
