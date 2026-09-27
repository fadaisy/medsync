"use client";

import type { Catalogue } from "@/lib/clerking/catalogue";
import { useEffect, useState } from "react";

import { parseCatalogue } from "@/lib/clerking/catalogue";

/**
 * The clerking catalogue in the browser: fetched once per session from the desk payload's
 * immutable URL (keyed by its hash) and parsed once; every desk on the page shares the promise.
 * A failed fetch is forgotten so the next mount retries.
 */
const cache = new Map<string, Promise<Catalogue>>();

export function loadCatalogue(url: string): Promise<Catalogue> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Catalogue ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then(parseCatalogue);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export function useCatalogue(url: string | undefined): { cat: Catalogue | null; failed: boolean } {
  const [state, setState] = useState<{ cat: Catalogue | null; failed: boolean }>({
    cat: null,
    failed: false,
  });
  useEffect(() => {
    if (!url) return;
    let live = true;
    loadCatalogue(url).then(
      (cat) => live && setState({ cat, failed: false }),
      () => live && setState({ cat: null, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return state;
}
