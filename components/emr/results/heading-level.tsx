"use client";

import type { ReactNode } from "react";
import { createContext } from "react";

/**
 * The result entry's own heading level. A page whose top bar already holds the h1 (the lab's Bench, Lab
 * Workspace v2) sets 2; every other page keeps the h1 it always had.
 */
export const EntryHeadingLevel = createContext<1 | 2>(1);

export function EntryHeadingAs({ level, children }: { level: 1 | 2; children: ReactNode }) {
  return <EntryHeadingLevel value={level}>{children}</EntryHeadingLevel>;
}
