import { getLocales } from "expo-localization";

import en from "@/i18n/en.json";
import lg from "@/i18n/lg.json";

/**
 * English and Luganda strings (scaffold). Luganda is untranslated: every key
 * falls back to English, and nothing is machine-translated. Screens move their
 * copy here as each string is reviewed.
 */
export type Lang = "en" | "lg";
export type StringKey = keyof typeof en;

const tables: Record<Lang, Partial<Record<StringKey, string>>> = { en, lg: lg as Partial<Record<StringKey, string>> };

export function deviceLang(): Lang {
  return getLocales()[0]?.languageCode === "lg" ? "lg" : "en";
}

export function s(key: StringKey, lang: Lang = "en"): string {
  return tables[lang][key] ?? en[key];
}
