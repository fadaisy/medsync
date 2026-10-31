import Link from "next/link";

import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";

export default function PlaceNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-3 px-4 py-6 sm:px-6">
      <p className="text-body-s text-foreground">{PHWS2.kit.notFound}</p>
      <Link
        href="/pharmacy/store"
        className="text-body-s text-primary font-medium underline-offset-4 hover:underline"
      >
        {fill(PHWS2.kit.notFoundBack, { place: PHWS2.shell.titles.store })}
      </Link>
    </div>
  );
}
