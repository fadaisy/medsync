import { expiryText } from "@/content/pharmacy-stock";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { getPutAway } from "@/lib/pharmacy/stores/shelves";
import { PutAwayList } from "./_components/put-away";

/** Put away (0272), under the store's deliveries: nothing shows until the migration is applied. */
export async function PutAwayBody() {
  const actor = await requirePharmacyActor();
  const rows = await getPutAway(actor);
  if (!rows) return null;
  return (
    <PutAwayList
      rows={rows.map((r) => ({ ...r, expiryText: expiryText(r) }))}
      canPut={actor.access.permissions.has("pharmacy.store")}
    />
  );
}
