import type { Palette } from "@/theme/tokens";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

import { dark, light } from "@/theme/tokens";

/**
 * Light, dark, or whatever the phone is set to.
 *
 * The web app stores the same three words under the same key
 * (`next-themes`, `storageKey: "medsync-theme"`); the two stores are separate
 * — localStorage there, AsyncStorage here — but the vocabulary is one, so a
 * future account-level preference has nothing to translate.
 */
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "medsync-theme";

interface ThemeContextValue {
  colors: Palette;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /**
   * False until the stored preference has been read. The root layout holds
   * the navigator on this the way it holds it on the fonts: a first frame in
   * the phone's scheme that then flips to the patient's is a flash on every
   * cold start, and the read costs a few milliseconds.
   */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // `useColorScheme` only follows the phone when `userInterfaceStyle` in
  // app.json is "automatic"; on "light" it is pinned and "system" means light.
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (isPreference(stored)) setPreferenceState(stored);
        setReady(true);
      })
      // An unreadable store is "no preference", not a dead app.
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    // Fire and forget: the screen has already changed, and a write that
    // fails only means the phone forgets by next launch.
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const scheme = preference === "system" ? (system ?? "light") : preference;
  const colors = scheme === "dark" ? dark : light;

  return (
    <ThemeContext.Provider value={{ colors, preference, setPreference, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}

/**
 * Theme-aware styles for one file.
 *
 *   const styles = useStyles(makeStyles);
 *   …
 *   const makeStyles = (c: Palette) => StyleSheet.create({ root: { backgroundColor: c.background } });
 *
 * `make` is a module-level constant and `colors` is one of two module-level
 * objects, so with the React Compiler on the call below is memoised per
 * theme for free — no `useMemo` to write and none to forget.
 */
export function useStyles<T>(make: (colors: Palette) => T): T {
  const { colors } = useTheme();
  return make(colors);
}
