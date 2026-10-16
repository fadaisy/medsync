"use client";

import { Button } from "@/components/ui/button";

/** Print with CSS only (LB-4): the browser's own print of this page. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="secondary" className="min-h-11" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
