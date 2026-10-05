import type { NcdContext } from "@/lib/ncdreg/context";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { facilityStatus } from "@/lib/ncdreg/admin";
import { can } from "@/lib/ncdreg/context";
import { DEMO_COPY } from "@/lib/ncdreg/demo/source";
import { EmptyState } from "./kit";

/**
 * §10.2 / I5: while the facility has no persons and is not approved for patient data, the catalogue's
 * empty-state line; "Turn on demo data" only for holders of the demo capability.
 */
export async function DemoEmpty({ ctx }: { ctx: NcdContext }) {
  const status = await facilityStatus(ctx);
  if (status.persons > 0 || status.approved) return null;
  return (
    <EmptyState title={DEMO_COPY.empty_state}>
      {can(ctx, "demo_data_manage") ? (
        <Link href="/ncd/admin?demo=on#demo" className={buttonVariants({ variant: "primary" })}>
          {DEMO_COPY.switch_on}
        </Link>
      ) : null}
    </EmptyState>
  );
}
