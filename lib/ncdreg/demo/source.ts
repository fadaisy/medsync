/** The demo catalogue (§10.1), the only source of demo patients, validated when first imported. */
import raw from "@/docs/ncd/demo/ncd-demo-catalog.v1.json";
import { parseCatalogue } from "./catalogue";

export const DEMO_CATALOGUE = parseCatalogue(raw);
export const DEMO_COPY = DEMO_CATALOGUE.ui_copy;
export const DEMO_ACTORS: Record<string, string> = Object.fromEntries(
  DEMO_CATALOGUE.demo_actors.map((a) => [a.role, a.label]),
);
