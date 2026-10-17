"use client";

import { Button } from "@/components/ui/button";

/** IC-13: print the weekly digest for the IPC committee (aggregates only; the page prints black on white). */
export function PrintDigest() {
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-fit print:hidden"
      onClick={() => window.print()}
    >
      Print the weekly digest
    </Button>
  );
}
