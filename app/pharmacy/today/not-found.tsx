import Link from "next/link";

import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";

export default function PlaceNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 px-4 py-6 sm:px-6">
      <p className="text-body-m text-foreground">{PHWS2.kit.notFound}</p>
      <Link href="/pharmacy" className="text-body-s text-primary underline-offset-4 hover:underline">
        {fill(PHWS2.kit.notFoundBack, { place: PHWS2.shell.home })}
      </Link>
    </div>
  );
}
