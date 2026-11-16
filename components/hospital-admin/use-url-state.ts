"use client";

import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

/**
 * State that starts from a URL value and follows it when the URL changes (a soft navigation to the same page with
 * another `?tab=`, the browser's back button, or the guide's walkthroughs, ADR 0522). The page still changes it
 * itself in between; only a new value from the URL replaces it. Adjusts state while rendering, as React advises,
 * not in an effect.
 */
export function useUrlState<T>(fromUrl: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(fromUrl);
  const [seen, setSeen] = useState<T>(fromUrl);
  if (!Object.is(seen, fromUrl)) {
    setSeen(fromUrl);
    setValue(fromUrl);
  }
  return [value, setValue];
}
