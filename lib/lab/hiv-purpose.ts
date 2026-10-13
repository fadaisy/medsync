/** D-LAB3-21: the HIV testing purpose (migration 0117 `encounter_orders.test_purpose`). Pure. */
export const HIV_PURPOSES = [
  "hct",
  "emtct",
  "clinical_diagnosis",
  "smc",
  "verification",
  "recency",
] as const;

/** The HIV rapid tests in the catalogue (0072 seed, 0108 CFC v1.6). */
export const HIV_PURPOSE_TESTS = ["test.hiv_rapid", "test.dual_hiv_syphilis_rdt"] as const;

export const needsHivPurpose = (testCode: string): boolean =>
  (HIV_PURPOSE_TESTS as readonly string[]).includes(testCode);
