"use client";

import { useEffect } from "react";

/** Brings the lot opened from Needs you (`?lot=`) into view and moves focus to it, once. */
export function FocusLot({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "start" });
    el?.focus({ preventScroll: true });
  }, [id]);
  return null;
}
