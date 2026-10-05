import type { GoldenExpectations } from "./document";

import { renderDataInventory } from "../data-inventory";
import { renderConditionModules, renderIndicators, renderStandard } from "./document";

/** Path (from the repository root) → renderer. INDICATORS.md names the golden-dataset patients. */
export function generatedDocs(golden: GoldenExpectations): Record<string, () => string> {
  return {
    "docs/ncd/NCDREG-v0.1-DRAFT.md": renderStandard,
    "docs/ncd/CONDITION-MODULES.md": renderConditionModules,
    "docs/ncd/INDICATORS.md": () => renderIndicators(golden),
    "docs/ncd/DATA-INVENTORY.md": renderDataInventory,
  };
}
