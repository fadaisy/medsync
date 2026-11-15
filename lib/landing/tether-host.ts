import "server-only";

import type { Metadata } from "next";
import { headers } from "next/headers";

import { NAV } from "@/content/tether-landing/copy";
import { isTetherHost } from "./feature";

/** True when this request came in on the Tether site's own domain (ADR 0499). */
export async function onTetherHost(): Promise<boolean> {
  return isTetherHost((await headers()).get("host"));
}

/** Tab titles end in "· Tether" on the Tether domain; elsewhere the root layout's "· MedSync" stands. */
export async function tetherTitles(): Promise<Metadata> {
  return (await onTetherHost())
    ? { title: { template: `%s · ${NAV.brand}`, default: NAV.brand } }
    : {};
}
