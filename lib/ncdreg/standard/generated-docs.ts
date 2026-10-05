import { renderConditionModules, renderStandard } from "./document";

/** Path (from the repository root) → renderer. Later phases add INDICATORS.md and DATA-INVENTORY.md. */
export const GENERATED_DOCS: Record<string, () => string> = {
  "docs/ncd/NCDREG-v0.1-DRAFT.md": renderStandard,
  "docs/ncd/CONDITION-MODULES.md": renderConditionModules,
};
