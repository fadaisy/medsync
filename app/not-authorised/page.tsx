import type { Metadata } from "next";
import Link from "next/link";

import { LAB } from "@/content/lab";
import { PHARMACY } from "@/content/pharmacy";
import { TideScope } from "@/components/medsync/tide-scope";

export const metadata: Metadata = {
  title: "No access",
  robots: { index: false, follow: false },
};

/**
 * The not-authorised page (Lab Phase 0 §5.1; Pharmacy Phase 0 §5.1). A workspace guard sends a signed-in user here when
 * they lack the permission the workspace needs. It loads nothing about the user or any patient, so
 * reaching it reveals nothing; `?for=` only picks the wording.
 */
export default async function NotAuthorisedPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const { for: workspace } = await searchParams;
  const body =
    workspace === "lab"
      ? LAB.refused.body
      : workspace === "pharmacy"
        ? PHARMACY.refused.body
        : "You do not have access to this page.";
  return (
    <>
      <TideScope group="public">{null}</TideScope>
    <main className="mx-auto flex min-h-svh w-full max-w-120 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="font-display text-display-s text-foreground">{LAB.refused.title}</h1>
      <p className="text-body-m text-muted-foreground">{body}</p>
      <Link
        href="/"
        className="text-body-s tap inline-flex min-h-11 items-center self-start font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
      >
        {LAB.refused.home}
      </Link>
    </main>
    </>
  );
}
