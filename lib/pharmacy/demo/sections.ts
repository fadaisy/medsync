import "server-only";

import type { DemoState } from "./state";

import { clinicalSection } from "./clinical";
import { controlledSection, downtimeSection, emergencySection } from "./controlled";
import { dispensingSection } from "./dispensing";
import { goliveSection, networkSection } from "./network";
import { storesSection } from "./stores";
import { expirySection, monthEndSection, wardsSection } from "./wards";

/** The sections after setup and stock, in order; each fills its pages and records what it wrote in `s.counts`. */
export const SECTIONS: [name: string, fn: (s: DemoState) => Promise<void>][] = [
  ["dispensing", dispensingSection],
  ["controlled", controlledSection],
  ["downtime", downtimeSection],
  ["emergency", emergencySection],
  ["stores", storesSection],
  ["wards", wardsSection],
  ["expiry", expirySection],
  ["month-end", monthEndSection],
  ["clinical", clinicalSection],
  ["network", networkSection],
  ["golive", goliveSection],
];
