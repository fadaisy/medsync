import { asClinicalReader } from "@/lib/emr/db";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { countsCsv } from "@/lib/pharmacy/clinical/interventions";
import { nameWards, queryFacts } from "@/lib/pharmacy/clinical/interventions-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyInterventionReviewLiveFor } from "@/lib/pharmacy/feature";

/** 5.4, S27: counts by type, point and month as CSV, for `pharmacy.manage`; no patient identifiers; logged. */
export async function GET(req: Request) {
  const actor = await requirePharmacyActor();
  if (
    !pharmacyInterventionReviewLiveFor(actor.hospitalId) ||
    !(await managesPharmacy(actor.userId, actor.hospitalId))
  )
    return new Response("Not found", { status: 404 });
  const days = Math.min(366, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const to = new Date();
  const facts = await nameWards(
    await asClinicalReader(actor, (tx) =>
      queryFacts(tx, actor.hospitalId, new Date(to.getTime() - days * 86_400_000), to),
    ),
    actor.hospitalId,
  );
  logger.info("pharmacy.clinical.interventions_downloaded", { days, rows: facts.length });
  return new Response(countsCsv(facts), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="interventions-${days}d.csv"`,
    },
  });
}
