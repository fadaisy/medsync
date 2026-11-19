"use client";

import type { ComponentProps } from "react";
import { useState } from "react";

import { ReadingForm } from "@/components/tide/reading-dialog";
import { PageHeader } from "@/components/tide/shell";
import { READINGS_COPY } from "@/content/patient/readings";

/**
 * The page's header and the form, together so the header Help steps aside while the danger step draws its own
 * red Help as its main action (ADR 0528, amending L6; as Book's "Something is wrong").
 */
export function ReadingsBody(props: Omit<ComponentProps<typeof ReadingForm>, "onHelpInPage">) {
  const [helpInPage, setHelpInPage] = useState(false);
  return (
    <>
      <PageHeader
        title={READINGS_COPY.title}
        area="readings"
        back={{ href: "/patient/care", label: READINGS_COPY.backToCare }}
        hideHelp={helpInPage}
      />
      <div className="w-full max-w-[720px]">
        <ReadingForm {...props} onHelpInPage={setHelpInPage} />
      </div>
    </>
  );
}
