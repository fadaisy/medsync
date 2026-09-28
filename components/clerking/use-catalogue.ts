"use client";

import type { Catalogue } from "@/lib/clerking/catalogue";
import type { ExamCatalogue } from "@/lib/clerking/exam/catalogue";
import type { DxCatalogue } from "@/lib/clerking/impression/catalogue";
import { useEffect, useState } from "react";

import { parseCatalogue } from "@/lib/clerking/catalogue";
import { parseExamCatalogue } from "@/lib/clerking/exam/catalogue";
import { parseDxCatalogue } from "@/lib/clerking/impression/catalogue";

/**
 * The clerking catalogues in the browser: each fetched once per session from the desk payload's
 * immutable URL (keyed by its hash) and parsed once; every desk on the page shares the promise.
 * A failed fetch is forgotten so the next mount retries.
 */
const cache = new Map<string, Promise<unknown>>();

function load<T>(url: string, parse: (json: unknown) => T): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Catalogue ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then(parse);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export const loadCatalogue = (url: string) => load(url, parseCatalogue);

function useParsed<T>(url: string | undefined, parse: (json: unknown) => T) {
  const [state, setState] = useState<{ cat: T | null; failed: boolean }>({
    cat: null,
    failed: false,
  });
  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url, parse).then(
      (cat) => live && setState({ cat, failed: false }),
      () => live && setState({ cat: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [url, parse]);
  return state;
}

export function useCatalogue(url: string | undefined): { cat: Catalogue | null; failed: boolean } {
  return useParsed(url, parseCatalogue);
}

/** The examination catalogue (MS-EMR-EXAM-CAT-001). */
export function useExamCatalogue(url: string | undefined): {
  cat: ExamCatalogue | null;
  failed: boolean;
} {
  return useParsed(url, parseExamCatalogue);
}

/** The diagnosis reasoning catalogue (MS-EMR-DX-CAT-001) and its term map (term uuid → `dx.*`). */
export interface DxData {
  cat: DxCatalogue;
  termIds: Readonly<Record<string, string>>;
  /** `dx.*` → display (REF-DX-TERMS and the addendum; `coded`: seeded in the database). */
  names: Readonly<Record<string, { display: string; restricted: boolean; coded: boolean }>>;
  /** Test id → display (the default menu). */
  tests: Readonly<Record<string, string>>;
  /** Test id → the test_catalogue uuid an order names. */
  testIds: Readonly<Record<string, string>>;
}

const parseDx = (json: unknown): DxData => {
  const j = json as Omit<DxData, "cat"> & { catalogue: unknown };
  return {
    cat: parseDxCatalogue(j.catalogue),
    termIds: j.termIds,
    names: j.names ?? {},
    tests: j.tests ?? {},
    testIds: j.testIds ?? {},
  };
};

export function useDxCatalogue(url: string | undefined): { cat: DxData | null; failed: boolean } {
  return useParsed(url, parseDx);
}
