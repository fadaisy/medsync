import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { visitView } from "@/lib/ncdreg/read/views";
import { requireNcdScope } from "@/lib/ncdreg/scope";
import { Num } from "../../../_components/kit";
import { NursePart } from "../_components/nurse-part";

export const dynamic = "force-dynamic";

/** The nurse part on a phone (§11.3 item 4 at 390 px): large numeric inputs, one Save, works offline. */
export default async function NursePhonePage({ params }: { params: Promise<{ visitId: string }> }) {
  const { ctx } = await requireNcdScope();
  const { visitId } = await params;
  const v = await visitView(ctx, visitId);
  if (!v) notFound();
  const glucose = v.person.modules.some(({ module: m }) => m.visit_fields.some((f) => f.code === "glucose"));
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 py-3">
      <header className="flex items-center gap-2">
        <Link href="/ncd" aria-label="Back to today's clinic" className="hover:bg-ink-100 grid size-11 place-items-center rounded-lg">
          <ChevronLeftIcon className="size-5" aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">{v.person.identity.name}</span>
          <Num className="text-muted-foreground text-[12px]">
            {v.person.identity.registryNumber} · {v.person.identity.sex === "female" ? "F" : "M"} · {v.person.identity.age} y
          </Num>
        </div>
      </header>
      <NursePart
        big
        visitId={v.visit.id}
        personId={v.visit.personId}
        initial={{ weightKg: v.visit.weightKg, bp: v.visit.bp, glucose: v.visit.glucose }}
        heightCm={v.heightCm}
        glucose={glucose}
        glucoseUnit={v.glucoseUnit}
        closed={v.visit.status === "closed"}
      />
    </div>
  );
}
