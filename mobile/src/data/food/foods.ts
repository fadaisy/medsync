/**
 * The built-in Ugandan food list (ADR 0412). Generated from published tables:
 * every per-100 g value and GI below names its source row in `sources`.
 * A food with no published GI has `gi: null` ("unknown"); never fill one in.
 * A portion without `source` is a MedSync household estimate, not a table value.
 * Signed off by the owner as clinical reference data, 18 Oct 2026.
 */
import type { Combo, Food } from "./types";

export const FOODS: Food[] = [
  {
    id: "matooke-mashed",
    name: "Matooke, steamed and mashed",
    localNames: [
      {
        name: "matooke",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 81.0,
      carbsG: 16.9,
      proteinG: 1.2,
      fatG: 0.3,
      fibreG: 3.0,
    },
    gi: 55,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15104 Mashed Bananas",
        where: "PDF p. 174",
      },
      {
        source: "GI-2008",
        item: "Plantain/green banana, 55 ± 6",
        where: "Table 1",
      },
    ],
    note: "Composition: Kenya 'Mashed Bananas'. GI: international average for green banana/plantain; no matooke-specific GI found.",
  },
  {
    id: "matooke-stewed",
    name: "Matooke stew (green bananas, plain)",
    localNames: [
      {
        name: "matooke",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 84.0,
      carbsG: 10.4,
      proteinG: 1.0,
      fatG: 3.8,
      fibreG: 2.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15097 Stewed Green Bananas",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "matooke-meat",
    name: "Matooke with meat",
    localNames: [
      {
        name: "matooke n'ennyama",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 ladle",
        grams: 120,
      },
      {
        label: "1 plate portion",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 118.0,
      carbsG: 13.3,
      proteinG: 6.0,
      fatG: 4.1,
      fibreG: 1.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15056 Matoke (Stewed Green Bananas & Meat)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "green-banana-raw",
    name: "Green cooking banana, peeled, raw weight",
    localNames: [
      {
        name: "matooke",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 finger",
        grams: 100,
      },
      {
        label: "3 fingers",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 97.0,
      carbsG: 20.1,
      proteinG: 1.4,
      fatG: 0.4,
      fibreG: 3.6,
    },
    gi: 55,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "02004 Banana, plantain, green, raw",
        where: "PDF p. 57",
      },
      {
        source: "GI-2008",
        item: "Plantain/green banana, 55 ± 6",
        where: "Table 1",
      },
    ],
    note: "For weighing matooke before cooking. GI: international average for green banana/plantain.",
  },
  {
    id: "posho",
    name: "Posho (refined maize flour)",
    localNames: [
      {
        name: "posho",
        language: "Ugandan English",
      },
      {
        name: "kawunga",
        language: "Luganda",
      },
      {
        name: "ugali",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 fist-sized lump",
        grams: 150,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 148.0,
      carbsG: 27.3,
      proteinG: 3.4,
      fatG: 1.9,
      fibreG: 4.0,
    },
    gi: 74,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15009 Refined Maize Flour Ugali",
        where: "PDF p. 165",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1721: Maize meal porridge, refined, maize-meal:water = 1:3 (South Africa)",
        where: "online appendix, p. 53",
      },
    ],
    note: "GI: refined maize meal porridge, 1:3 meal to water (South Africa).",
  },
  {
    id: "posho-whole",
    name: "Posho, whole maize flour",
    localNames: [
      {
        name: "posho",
        language: "Ugandan English",
      },
      {
        name: "ugali",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 fist-sized lump",
        grams: 150,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 141.0,
      carbsG: 26.0,
      proteinG: 3.3,
      fatG: 1.8,
      fibreG: 3.8,
    },
    gi: 62,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15005 Whole Maize Flour Ugali",
        where: "PDF p. 165",
      },
      {
        source: "KE-GI-2021",
        item: "Whole maize ugali; plain, 62 ± 8.90 (Ebere et al. 2017, FSQM 63:55–63)",
        where: "Table 1",
      },
    ],
  },
  {
    id: "posho-maize-millet",
    name: "Posho, maize and millet flour",
    localNames: [
      {
        name: "ugali",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 fist-sized lump",
        grams: 150,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 133.0,
      carbsG: 24.0,
      proteinG: 3.1,
      fatG: 1.3,
      fibreG: 6.6,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15006 Maize and Finger Millet Flour Ugali",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "kalo",
    name: "Millet bread (finger millet)",
    localNames: [
      {
        name: "kalo",
        language: "Luganda",
      },
      {
        name: "ugali wa wimbi",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 fist-sized lump",
        grams: 150,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 120.0,
      carbsG: 21.0,
      proteinG: 2.9,
      fatG: 0.7,
      fibreG: 8.9,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15100 Finger Millet Ugali",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "sorghum-posho",
    name: "Sorghum, maize and millet bread",
    localNames: [
      {
        name: "ugali",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 fist-sized lump",
        grams: 150,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 150.0,
      carbsG: 32.1,
      proteinG: 1.9,
      fatG: 0.7,
      fibreG: 3.6,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15010 Sorghum, Maize flour & Finger Millet Ugali",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "cassava-posho",
    name: "Cassava flour bread",
    localNames: [
      {
        name: "kawunga ka muwogo",
        language: "Luganda",
      },
      {
        name: "ugali wa muhogo",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 fist-sized lump",
        grams: 150,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 186.0,
      carbsG: 43.7,
      proteinG: 1.1,
      fatG: 0.3,
      fibreG: 2.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15011 Cassava Flour Ugali",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "cassava-boiled",
    name: "Cassava, boiled",
    localNames: [
      {
        name: "muwogo",
        language: "Luganda",
      },
      {
        name: "muhogo",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 piece (palm-sized)",
        grams: 100,
      },
      {
        label: "1 plate portion",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 107.0,
      carbsG: 23.1,
      proteinG: 1.4,
      fatG: 0.2,
      fibreG: 4.0,
    },
    gi: 74.1,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "02024 Cassava, root, yellow, peeled, boiled, drained (without salt)",
        where: "PDF p. 57",
      },
      {
        source: "KE-GI-2021",
        item: "Boiled cassava, 74.10 ± 6.31 (Ebere et al. 2017, FSQM 63:7–12)",
        where: "Table 1",
      },
    ],
  },
  {
    id: "cassava-raw",
    name: "Cassava, fresh, peeled",
    localNames: [
      {
        name: "muwogo",
        language: "Luganda",
      },
      {
        name: "muhogo",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 piece (palm-sized)",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 173.0,
      carbsG: 39.1,
      proteinG: 1.3,
      fatG: 0.3,
      fibreG: 4.6,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "02007 Cassava, root, white, peeled, raw",
        where: "PDF p. 57",
      },
    ],
  },
  {
    id: "sweet-potato-boiled",
    name: "Sweet potato, boiled",
    localNames: [
      {
        name: "lumonde",
        language: "Luganda",
      },
      {
        name: "viazi vitamu",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 medium",
        grams: 151,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 83173: 1 medium = 151 g (FDC 168484)",
        },
      },
      {
        label: "1 cup, mashed",
        grams: 328,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 83172: 1 cup, mashed = 328 g (FDC 168484)",
        },
      },
    ],
    per100g: {
      kcal: 101.0,
      carbsG: 20.8,
      proteinG: 1.7,
      fatG: 0.4,
      fibreG: 4.0,
    },
    gi: 64.54,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "02027 Sweet potato, brown skin, peeled, boiled, drained (without salt)",
        where: "PDF p. 60",
      },
      {
        source: "KE-GI-2021",
        item: "Sweet potato, 64.54 ± 7.11 (Ebere et al. 2017, FSQM 63:7–12)",
        where: "Table 1",
      },
    ],
  },
  {
    id: "sweet-potato-orange",
    name: "Orange-fleshed sweet potato, boiled",
    localNames: [
      {
        name: "lumonde",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 medium",
        grams: 151,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 83173: 1 medium = 151 g (FDC 168484)",
        },
      },
      {
        label: "1 cup, mashed",
        grams: 328,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 83172: 1 cup, mashed = 328 g (FDC 168484)",
        },
      },
    ],
    per100g: {
      kcal: 77.0,
      carbsG: 15.6,
      proteinG: 1.9,
      fatG: 0.1,
      fibreG: 3.0,
    },
    gi: 63,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "02028 Sweetpotato, orange, biofortified, boiled, drained (without salt)",
        where: "PDF p. 60",
      },
      {
        source: "GI-2008",
        item: "Sweet potato, boiled, 63 ± 6",
        where: "Table 1",
      },
    ],
    note: "GI: international average for boiled sweet potato; the orange variety has not been tested in East Africa.",
  },
  {
    id: "sweet-potato-fried",
    name: "Sweet potato, pan-fried",
    localNames: [
      {
        name: "lumonde",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 medium",
        grams: 150,
      },
      {
        label: "1 plate portion",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 248.0,
      carbsG: 25.3,
      proteinG: 3.1,
      fatG: 13.9,
      fibreG: 4.9,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15109 Pan Fried Sweet Potatoes",
        where: "PDF p. 177",
      },
    ],
  },
  {
    id: "irish-potato-boiled",
    name: "Irish potato, boiled",
    localNames: [
      {
        name: "Irish",
        language: "Ugandan English",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 small",
        grams: 125,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 86654: 1 small (1-3/4" to 2-1/2" dia.) = 125 g (FDC 170440)',
        },
      },
      {
        label: "1 medium",
        grams: 167,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 86653: 1 medium (2-1/4" to 3-1/4" dia.) = 167 g (FDC 170440)',
        },
      },
      {
        label: "1 large",
        grams: 300,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 86652: 1 large (3" to 4-1/4" dia.) = 300 g (FDC 170440)',
        },
      },
    ],
    per100g: {
      kcal: 105.0,
      carbsG: 22.7,
      proteinG: 2.4,
      fatG: 0.1,
      fibreG: 1.7,
    },
    gi: 78,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "02025 Potato, Irish (English), white variety, peeled, boiled, drained (without salt)",
        where: "PDF p. 57",
      },
      {
        source: "GI-2008",
        item: "Potato, boiled, 78 ± 4",
        where: "Table 1",
      },
    ],
  },
  {
    id: "irish-potato-mashed",
    name: "Irish potato, mashed",
    localNames: [
      {
        name: "Irish",
        language: "Ugandan English",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 cup",
        grams: 210,
      },
    ],
    per100g: {
      kcal: 106.0,
      carbsG: 22.8,
      proteinG: 2.5,
      fatG: 0.2,
      fibreG: 1.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15103 Mashed Potatoes",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "irish-potato-stew",
    name: "Potato curry (stewed Irish potatoes)",
    localNames: [
      {
        name: "Irish",
        language: "Ugandan English",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 ladle",
        grams: 120,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 145.0,
      carbsG: 17.3,
      proteinG: 2.2,
      fatG: 7.0,
      fibreG: 2.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15127 Potato Curry",
        where: "PDF p. 177",
      },
    ],
  },
  {
    id: "rice-boiled",
    name: "Rice, white, boiled",
    localNames: [
      {
        name: "omuceere",
        language: "Luganda",
      },
      {
        name: "wali",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 cup",
        grams: 158,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 83928: 1 cup = 158 g (FDC 168878)",
        },
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 119.0,
      carbsG: 26.2,
      proteinG: 2.6,
      fatG: 0.3,
      fibreG: 0.2,
    },
    gi: 77,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01059 Rice, white, milled, polished grain, dry, boiled (without salt)",
        where: "PDF p. 51",
      },
      {
        source: "KE-GI-2021",
        item: "Boiled white rice (mwea pishori), 77 ± 5.69 (Ebere et al. 2017, FSQM 63:64–73)",
        where: "Table 1",
      },
    ],
  },
  {
    id: "pilau",
    name: "Pilau (spiced rice)",
    localNames: [
      {
        name: "pilawo",
        language: "Luganda",
      },
      {
        name: "pilau",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 cup",
        grams: 158,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 213.0,
      carbsG: 24.8,
      proteinG: 6.9,
      fatG: 9.4,
      fibreG: 1.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15036 Pilau (Spiced Rice)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "rice-beans",
    name: "Rice with beans",
    localNames: [
      {
        name: "omuceere n'ebijanjaalo",
        language: "Luganda",
      },
      {
        name: "mseto wa maharagwe",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 plate portion",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 193.0,
      carbsG: 23.5,
      proteinG: 5.0,
      fatG: 7.9,
      fibreG: 3.8,
    },
    gi: 62,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15038 Mseto wa Maharagwe (Add Rice with Beans)",
        where: "PDF p. 168",
      },
      {
        source: "KE-GI-2021",
        item: "Rice; beans, 62 ± 5.16 (Ebere et al. 2017, FSQM 63:64–73)",
        where: "Table 1",
      },
    ],
  },
  {
    id: "rice-green-grams",
    name: "Rice with green grams",
    localNames: [
      {
        name: "mseto wa ndengu",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 plate portion",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 103.0,
      carbsG: 18.4,
      proteinG: 3.7,
      fatG: 1.3,
      fibreG: 1.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15037 Mseto wa Ndengu (Rice with green grams)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "yam-boiled",
    name: "Yam, boiled",
    localNames: [
      {
        name: "balugu",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 piece (palm-sized)",
        grams: 100,
      },
      {
        label: "1 plate portion",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 118.0,
      carbsG: 24.9,
      proteinG: 2.0,
      fatG: 0.2,
      fibreG: 4.3,
    },
    gi: 74,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "02030 Yam, white, boiled, drained (without salt)",
        where: "PDF p. 60",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1700: Yam (Dioscorea spp.), boiled (Nigeria)",
        where: "online appendix, p. 52",
      },
    ],
    note: "GI: yam (Dioscorea), boiled (Nigeria).",
  },
  {
    id: "cocoyam-boiled",
    name: "Cocoyam (taro), boiled",
    localNames: [
      {
        name: "jjuuni",
        language: "Luganda",
      },
      {
        name: "magimbi",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 cup, sliced",
        grams: 132,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 83176: 1 cup, sliced = 132 g (FDC 168486)",
        },
      },
      {
        label: "1 piece (palm-sized)",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 142.0,
      carbsG: 29.5,
      proteinG: 0.52,
      fatG: 0.11,
      fibreG: 5.1,
    },
    gi: 53,
    giCategory: "low",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 168486 (NDB 11519) Taro, cooked, without salt",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
      {
        source: "GI-2008",
        item: "Taro, boiled, 53 ± 2",
        where: "Table 1",
      },
    ],
  },
  {
    id: "chapati",
    name: "Chapati",
    localNames: [
      {
        name: "chapati",
        language: "Ugandan English",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 chapati",
        grams: 70,
      },
      {
        label: "half a chapati",
        grams: 35,
      },
    ],
    per100g: {
      kcal: 424.0,
      carbsG: 49.6,
      proteinG: 7.8,
      fatG: 21.1,
      fibreG: 2.5,
    },
    gi: 52,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15019 White Chapati",
        where: "PDF p. 165",
      },
      {
        source: "GI-2008",
        item: "Chapatti, 52 ± 4",
        where: "Table 1",
      },
    ],
  },
  {
    id: "chapati-brown",
    name: "Chapati, brown (wholemeal)",
    localNames: [
      {
        name: "chapati",
        language: "Ugandan English",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 chapati",
        grams: 70,
      },
      {
        label: "half a chapati",
        grams: 35,
      },
    ],
    per100g: {
      kcal: 413.0,
      carbsG: 40.9,
      proteinG: 7.3,
      fatG: 22.9,
      fibreG: 7.2,
    },
    gi: 52,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15020 Brown Chapati",
        where: "PDF p. 165",
      },
      {
        source: "GI-2008",
        item: "Chapatti, 52 ± 4",
        where: "Table 1",
      },
    ],
    note: "GI: international average for chapatti; wholemeal not tested separately.",
  },
  {
    id: "bread-white",
    name: "Bread, white",
    localNames: [
      {
        name: "omugaati",
        language: "Luganda",
      },
      {
        name: "mkate",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 slice",
        grams: 29,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 95169: 1 slice = 29 g (FDC 174924)",
        },
      },
      {
        label: "2 slices",
        grams: 58,
      },
    ],
    per100g: {
      kcal: 249.0,
      carbsG: 48.8,
      proteinG: 7.7,
      fatG: 1.9,
      fibreG: 3.1,
    },
    gi: 75,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01007 Bread, White",
        where: "PDF p. 42",
      },
      {
        source: "GI-2008",
        item: "White wheat bread, 75 ± 2",
        where: "Table 1",
      },
    ],
  },
  {
    id: "bread-brown",
    name: "Bread, brown",
    localNames: [
      {
        name: "omugaati",
        language: "Luganda",
      },
      {
        name: "mkate",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 slice",
        grams: 29,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 95169: 1 slice = 29 g (FDC 174924)",
        },
      },
      {
        label: "2 slices",
        grams: 58,
      },
    ],
    per100g: {
      kcal: 245.0,
      carbsG: 46.9,
      proteinG: 8.0,
      fatG: 1.5,
      fibreG: 5.9,
    },
    gi: 74,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01005 Bread, Brown",
        where: "PDF p. 42",
      },
      {
        source: "GI-2008",
        item: "Whole wheat/whole meal bread, 74 ± 2",
        where: "Table 1",
      },
    ],
  },
  {
    id: "bread-sweet",
    name: "Sweet bread / bun",
    localNames: [
      {
        name: "omugaati",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 slice",
        grams: 30,
      },
      {
        label: "1 bun",
        grams: 60,
      },
    ],
    per100g: {
      kcal: 368.0,
      carbsG: 50.6,
      proteinG: 8.3,
      fatG: 14.4,
      fibreG: 1.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01006 Bread, Sweet",
        where: "PDF p. 42",
      },
    ],
  },
  {
    id: "maize-fresh-boiled",
    name: "Fresh maize (corn on the cob), boiled",
    localNames: [
      {
        name: "kasooli",
        language: "Luganda",
      },
      {
        name: "mahindi",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 cob (grain only)",
        grams: 150,
      },
      {
        label: "half a cob",
        grams: 75,
      },
    ],
    per100g: {
      kcal: 146.0,
      carbsG: 20.0,
      proteinG: 3.8,
      fatG: 2.3,
      fibreG: 15.0,
    },
    gi: 52,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01051 Green maize, white, whole, grain, fresh, boiled, drained (without salt)",
        where: "PDF p. 48",
      },
      {
        source: "GI-2008",
        item: "Sweet corn, 52 ± 5",
        where: "Table 1",
      },
    ],
    note: "GI: international average for sweet corn; East African field maize not tested.",
  },
  {
    id: "githeri",
    name: "Maize and beans, stewed",
    localNames: [
      {
        name: "empeke",
        language: "Luganda",
      },
      {
        name: "githeri",
        language: "Swahili",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 ladle",
        grams: 120,
      },
      {
        label: "1 plate portion",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 157.0,
      carbsG: 19.7,
      proteinG: 6.7,
      fatG: 4.2,
      fibreG: 7.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15053 Githeri (stewed Maize & Beans)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "spaghetti",
    name: "Spaghetti / macaroni, boiled",
    localNames: [
      {
        name: "spaghetti",
        language: "Ugandan English",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 cup",
        grams: 140,
      },
      {
        label: "1 plate portion",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 122.0,
      carbsG: 24.5,
      proteinG: 4.4,
      fatG: 0.5,
      fibreG: 1.1,
    },
    gi: 49,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01063 Pasta, spaghetti, dry, imported, boiled, drained (without salt)",
        where: "PDF p. 51",
      },
      {
        source: "GI-2008",
        item: "Spaghetti, white, 49 ± 2",
        where: "Table 1",
      },
    ],
  },
  {
    id: "plantain-ripe-roasted",
    name: "Gonja (ripe plantain), roasted",
    localNames: [
      {
        name: "gonja",
        language: "Luganda",
      },
    ],
    group: "staples",
    portions: [
      {
        label: "1 gonja",
        grams: 150,
      },
      {
        label: "1 cup",
        grams: 139,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 84304: 1 cup = 139 g (FDC 169131)",
        },
      },
    ],
    per100g: {
      kcal: 155.0,
      carbsG: 39.2,
      proteinG: 1.52,
      fatG: 0.16,
      fibreG: 2.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 169131 (NDB 9278) Plantains, yellow, baked",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
    ],
    note: "Composition: USDA 'Plantains, yellow, baked', the nearest published match for roasted ripe plantain.",
  },
  {
    id: "beans-stew",
    name: "Beans, stewed (sauce)",
    localNames: [
      {
        name: "ebijanjaalo",
        language: "Luganda",
      },
      {
        name: "maharagwe",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 63.0,
      carbsG: 7.2,
      proteinG: 3.5,
      fatG: 1.4,
      fibreG: 3.7,
    },
    gi: 44,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15045 Mchuzi wa Maharagwe (Bean Stew)",
        where: "PDF p. 168",
      },
      {
        source: "KE-GI-2021",
        item: "Bean stew, 44 ± 10.00 (Ebere et al. 2017, FSQM 63:64–73)",
        where: "Table 1",
      },
    ],
  },
  {
    id: "beans-boiled",
    name: "Beans (kidney), boiled",
    localNames: [
      {
        name: "ebijanjaalo",
        language: "Luganda",
      },
      {
        name: "maharagwe",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 177,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 95822: 1 cup = 177 g (FDC 175194)",
        },
      },
      {
        label: "1 tablespoon",
        grams: 11,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 95823: 1 tbsp = 11 g (FDC 175194)",
        },
      },
    ],
    per100g: {
      kcal: 117.0,
      carbsG: 15.5,
      proteinG: 7.9,
      fatG: 0.8,
      fibreG: 8.1,
    },
    gi: 24,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03029 Beans, kidney, dry, unsoaked, boiled, drained (without salt)",
        where: "PDF p. 63",
      },
      {
        source: "GI-2008",
        item: "Kidney beans, 24 ± 4",
        where: "Table 1",
      },
    ],
  },
  {
    id: "beans-milk-cream",
    name: "Beans stewed with milk and cream",
    localNames: [
      {
        name: "ebijanjaalo",
        language: "Luganda",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 139.0,
      carbsG: 14.3,
      proteinG: 7.2,
      fatG: 4.5,
      fibreG: 6.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15115 Bean Stew with Milk and Cream",
        where: "PDF p. 177",
      },
    ],
  },
  {
    id: "beans-skinned-stew",
    name: "Skinned bean stew",
    localNames: [
      {
        name: "ebijanjaalo",
        language: "Luganda",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 93.0,
      carbsG: 10.2,
      proteinG: 5.2,
      fatG: 2.3,
      fibreG: 5.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15142 Firinda (Skinned bean Stew)",
        where: "PDF p. 180",
      },
    ],
  },
  {
    id: "cowpeas-boiled",
    name: "Cowpeas, boiled",
    localNames: [
      {
        name: "empindi",
        language: "Luganda",
      },
      {
        name: "kunde",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 117.0,
      carbsG: 16.2,
      proteinG: 9.5,
      fatG: 0.4,
      fibreG: 5.4,
    },
    gi: 52,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03045 Cowpeas, dry, unsoaked, boiled, drained (without salt)",
        where: "PDF p. 69",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1087: Blackeyed peas (Vigna unguiculata), boiled (Nigeria)",
        where: "online appendix, p. 33",
      },
    ],
    note: "GI: black-eyed peas (Vigna unguiculata), boiled (Nigeria).",
  },
  {
    id: "peas-boiled",
    name: "Green peas, boiled",
    localNames: [
      {
        name: "kaawo",
        language: "Luganda",
      },
      {
        name: "njegere",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 160,
      },
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 98.0,
      carbsG: 10.4,
      proteinG: 8.3,
      fatG: 0.7,
      fibreG: 8.5,
    },
    gi: 51,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03050 Garden peas, fresh, boiled, drained (without salt)",
        where: "PDF p. 69",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1611: Pea, frozen, boiled (Canada)",
        where: "online appendix, p. 49",
      },
    ],
    note: "GI: peas, frozen, boiled (Canada).",
  },
  {
    id: "peas-dry-boiled",
    name: "Dry peas, boiled",
    localNames: [
      {
        name: "kaawo",
        language: "Luganda",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 120.0,
      carbsG: 17.7,
      proteinG: 7.6,
      fatG: 0.7,
      fibreG: 6.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03051 Garden peas, dry, unsoaked, boiled, drained (without salt)",
        where: "PDF p. 69",
      },
    ],
  },
  {
    id: "pigeon-peas-boiled",
    name: "Pigeon peas, boiled",
    localNames: [
      {
        name: "mbaazi",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 132.0,
      carbsG: 16.9,
      proteinG: 9.1,
      fatG: 0.9,
      fibreG: 9.6,
    },
    gi: 22,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03067 Pigeon peas, dry, unsoaked, boiled, drained (without salt)",
        where: "PDF p. 75",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1121: Pigeon Pea (Cajanus cajan Linn. Huth.), soaked, boiled 45 min (Philippines)",
        where: "online appendix, p. 34",
      },
    ],
    note: "GI: pigeon pea, soaked, boiled 45 min (Philippines).",
  },
  {
    id: "pigeon-peas-stew",
    name: "Pigeon pea stew",
    localNames: [
      {
        name: "mchuzi wa mbaazi",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 118.0,
      carbsG: 11.0,
      proteinG: 5.7,
      fatG: 4.4,
      fibreG: 6.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15092 Mchuzi wa Mbaazi (Pigeon Peas Stew)",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "green-grams-boiled",
    name: "Green grams (mung beans), boiled",
    localNames: [
      {
        name: "choroko",
        language: "Luganda",
      },
      {
        name: "ndengu",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 116.0,
      carbsG: 14.3,
      proteinG: 10.1,
      fatG: 0.6,
      fibreG: 6.2,
    },
    gi: 31,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03059 Gram, green, dry, unsoaked, boiled, drained (without salt)",
        where: "PDF p. 72",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1117: Mung bean (Phaseolus areus Roxb), soaked, boiled 20 min (Philippines)",
        where: "online appendix, p. 34",
      },
    ],
    note: "GI: mung bean, soaked, boiled 20 min (Philippines).",
  },
  {
    id: "green-grams-stew",
    name: "Green gram stew",
    localNames: [
      {
        name: "choroko",
        language: "Luganda",
      },
      {
        name: "mchuzi wa ndengu",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 109.0,
      carbsG: 9.3,
      proteinG: 6.3,
      fatG: 4.2,
      fibreG: 4.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15044 Mchuzi wa ndengu (Green Gram Stew)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "lentils-boiled",
    name: "Lentils, boiled",
    localNames: [
      {
        name: "dengu",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 120.0,
      carbsG: 15.6,
      proteinG: 10.7,
      fatG: 0.2,
      fibreG: 6.3,
    },
    gi: 32,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03063 Lentils, whole, dry, unsoaked, boiled, drained (without salt)",
        where: "PDF p. 72",
      },
      {
        source: "GI-2008",
        item: "Lentils, 32 ± 5",
        where: "Table 1",
      },
    ],
  },
  {
    id: "soybeans-boiled",
    name: "Soybeans, boiled",
    localNames: [
      {
        name: "soya",
        language: "Ugandan English",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 cup",
        grams: 170,
      },
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 159.0,
      carbsG: 4.0,
      proteinG: 14.0,
      fatG: 7.9,
      fibreG: 7.9,
    },
    gi: 16,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "03071 Soybean, dry, unsoaked, boiled, drained (without salt)",
        where: "PDF p. 75",
      },
      {
        source: "GI-2008",
        item: "Soya beans, 16 ± 1",
        where: "Table 1",
      },
    ],
  },
  {
    id: "groundnut-sauce",
    name: "Groundnut sauce",
    localNames: [
      {
        name: "binyeebwa",
        language: "Luganda",
      },
      {
        name: "mchuzi wa karanga",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 298.0,
      carbsG: 9.6,
      proteinG: 10.6,
      fatG: 23.4,
      fibreG: 3.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15063 Groundnut Sauce",
        where: "PDF p. 171",
      },
    ],
  },
  {
    id: "groundnuts",
    name: "Groundnuts, raw, with skin",
    localNames: [
      {
        name: "ebinyeebwa",
        language: "Luganda",
      },
      {
        name: "karanga",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 handful",
        grams: 30,
      },
      {
        label: "1 cup",
        grams: 146,
      },
    ],
    per100g: {
      kcal: 593.0,
      carbsG: 15.0,
      proteinG: 20.1,
      fatG: 48.4,
      fibreG: 8.3,
    },
    gi: 7,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "10009 Nut, ground nut, with skin, unsalted, dry, raw",
        where: "PDF p. 141",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1324: Peanuts, crushed (South Africa)",
        where: "online appendix, p. 40",
      },
    ],
    note: "GI: peanuts, crushed (South Africa).",
  },
  {
    id: "groundnuts-roasted",
    name: "Groundnuts, dry-roasted",
    localNames: [
      {
        name: "ebinyeebwa ebyokye",
        language: "Luganda",
      },
      {
        name: "karanga",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 handful",
        grams: 28.35,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 93281: 1 oz = 28.35 g (FDC 173806)",
        },
      },
      {
        label: "1 cup",
        grams: 146,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 93280: 1 cup = 146 g (FDC 173806)",
        },
      },
    ],
    per100g: {
      kcal: 587.0,
      carbsG: 12.9,
      proteinG: 24.35,
      fatG: 49.66,
      fibreG: 8.4,
    },
    gi: 7,
    giCategory: "low",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 173806 (NDB 16390) Peanuts, all types, dry-roasted, without salt",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1324: Peanuts, crushed (South Africa)",
        where: "online appendix, p. 40",
      },
    ],
    note: "GI: peanuts, crushed (South Africa).",
  },
  {
    id: "gnut-paste",
    name: "Groundnut paste (peanut butter)",
    localNames: [
      {
        name: "binyeebwa",
        language: "Luganda",
      },
      {
        name: "siagi ya karanga",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 tablespoon",
        grams: 16,
      },
      {
        label: "2 tablespoons",
        grams: 32,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 90673: 2 tbsp = 32 g (FDC 172470)",
        },
      },
    ],
    per100g: {
      kcal: 593.0,
      carbsG: 15.0,
      proteinG: 20.1,
      fatG: 48.4,
      fibreG: 8.3,
    },
    gi: 23,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "10012 Peanut Butter",
        where: "PDF p. 144",
      },
      {
        source: "GI-2008",
        item: "Table A1 #1164: Peanut butter",
        where: "online appendix, p. 35",
      },
    ],
    note: "Kenya's table gives peanut butter the same values as raw groundnuts.",
  },
  {
    id: "simsim",
    name: "Simsim (sesame) seeds / paste",
    localNames: [
      {
        name: "entungo",
        language: "Luganda",
      },
      {
        name: "ufuta",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 tablespoon",
        grams: 10,
      },
      {
        label: "2 tablespoons",
        grams: 20,
      },
    ],
    per100g: {
      kcal: 602.0,
      carbsG: 6.4,
      proteinG: 15.3,
      fatG: 54.1,
      fibreG: 14.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "10014 Seed, sesame (sim sim) unsalted, dry, raw",
        where: "PDF p. 144",
      },
    ],
  },
  {
    id: "lentil-stew",
    name: "Lentil stew",
    localNames: [
      {
        name: "mchuzi wa dengu",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 108.0,
      carbsG: 11.1,
      proteinG: 7.1,
      fatG: 3.0,
      fibreG: 4.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15046 Mchuzi wa Ndengu Kamande (Lentil Stew)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "bambara-nuts",
    name: "Bambara groundnuts, dried",
    localNames: [
      {
        name: "njugu mawe",
        language: "Swahili",
      },
    ],
    group: "legumes",
    portions: [
      {
        label: "1 handful",
        grams: 30,
      },
    ],
    per100g: {
      kcal: 321.0,
      carbsG: 34.6,
      proteinG: 18.1,
      fatG: 6.0,
      fibreG: 28.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "10001 Bambara groundnuts, dried, raw",
        where: "PDF p. 141",
      },
    ],
  },
  {
    id: "beef-stew",
    name: "Beef stew",
    localNames: [
      {
        name: "ennyama y'ente",
        language: "Luganda",
      },
      {
        name: "nyama ya ng'ombe",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 ladle",
        grams: 120,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 181.0,
      carbsG: 3.8,
      proteinG: 17.7,
      fatG: 10.4,
      fibreG: 0.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15087 Beef Stew",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "beef-boiled",
    name: "Beef, lean, boiled",
    localNames: [
      {
        name: "ennyama y'ente",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 piece (matchbox-sized)",
        grams: 30,
      },
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 209.0,
      carbsG: 0.0,
      proteinG: 41.9,
      fatG: 4.6,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07034 Beef, lean, boiled (without salt)",
        where: "PDF p. 114",
      },
    ],
  },
  {
    id: "beef-grilled",
    name: "Beef, lean, grilled (muchomo)",
    localNames: [
      {
        name: "muchomo",
        language: "Ugandan English",
      },
      {
        name: "nyama choma",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 skewer",
        grams: 60,
      },
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 142.0,
      carbsG: 0.0,
      proteinG: 28.5,
      fatG: 3.1,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07035 Beef, lean, grilled (without salt and fat)",
        where: "PDF p. 114",
      },
    ],
  },
  {
    id: "beef-fry",
    name: "Beef, stir-fried",
    localNames: [
      {
        name: "ennyama y'ente",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 255.0,
      carbsG: 5.0,
      proteinG: 26.7,
      fatG: 14.1,
      fibreG: 1.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15098 Stir Fried Beef",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "beef-fatty-boiled",
    name: "Beef, high fat, boiled",
    localNames: [
      {
        name: "ennyama y'ente",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 piece (matchbox-sized)",
        grams: 30,
      },
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 402.0,
      carbsG: 0.0,
      proteinG: 31.1,
      fatG: 30.8,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07031 Beef, high fat, w/o bones, boiled (without salt)",
        where: "PDF p. 114",
      },
    ],
  },
  {
    id: "liver-boiled",
    name: "Liver (beef), boiled",
    localNames: [
      {
        name: "ekibumba",
        language: "Luganda",
      },
      {
        name: "maini",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 178.0,
      carbsG: 0.0,
      proteinG: 30.2,
      fatG: 6.4,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07037 Beef, liver, boiled (without salt)",
        where: "PDF p. 117",
      },
    ],
  },
  {
    id: "goat-stew",
    name: "Goat stew",
    localNames: [
      {
        name: "ennyama y'embuzi",
        language: "Luganda",
      },
      {
        name: "nyama ya mbuzi",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 ladle",
        grams: 120,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 222.0,
      carbsG: 5.2,
      proteinG: 17.1,
      fatG: 14.6,
      fibreG: 0.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15108 Stewed Goat Meat",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "goat-grilled",
    name: "Goat, lean, grilled",
    localNames: [
      {
        name: "ennyama y'embuzi",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 skewer",
        grams: 60,
      },
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 169.0,
      carbsG: 0.0,
      proteinG: 28.3,
      fatG: 6.2,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07044 Goat, lean, grilled (without salt and fat)",
        where: "PDF p. 120",
      },
    ],
  },
  {
    id: "goat-fry",
    name: "Goat, stir-fried",
    localNames: [
      {
        name: "ennyama y'embuzi",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 383.0,
      carbsG: 10.4,
      proteinG: 32.1,
      fatG: 23.3,
      fibreG: 1.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15099 Stir Fried Goat Meat",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "chicken-stew",
    name: "Chicken stew",
    localNames: [
      {
        name: "enkoko",
        language: "Luganda",
      },
      {
        name: "kuku",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 piece",
        grams: 100,
      },
      {
        label: "1 ladle",
        grams: 120,
      },
    ],
    per100g: {
      kcal: 211.0,
      carbsG: 6.4,
      proteinG: 18.3,
      fatG: 12.3,
      fibreG: 1.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15070 Ingokho (Stewed Chicken)",
        where: "PDF p. 171",
      },
    ],
  },
  {
    id: "chicken-fried",
    name: "Chicken, fried",
    localNames: [
      {
        name: "enkoko",
        language: "Luganda",
      },
      {
        name: "kuku",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 piece",
        grams: 100,
      },
      {
        label: "1 quarter chicken",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 532.0,
      carbsG: 9.1,
      proteinG: 44.6,
      fatG: 35.3,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15073 Ingokho (Fried Chicken)",
        where: "PDF p. 171",
      },
    ],
  },
  {
    id: "chicken-boiled",
    name: "Chicken, boiled (meat and skin)",
    localNames: [
      {
        name: "enkoko",
        language: "Luganda",
      },
      {
        name: "kuku",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 piece",
        grams: 100,
      },
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 226.0,
      carbsG: 0.0,
      proteinG: 23.7,
      fatG: 14.6,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07041 Chicken, unspecified part, w/o bone, meat&skin, boiled (without salt)",
        where: "PDF p. 120",
      },
    ],
  },
  {
    id: "pork-grilled",
    name: "Pork, grilled",
    localNames: [
      {
        name: "ennyama y'embizzi",
        language: "Luganda",
      },
      {
        name: "pork",
        language: "Ugandan English",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
      {
        label: "1 plate portion",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 356.0,
      carbsG: 0.0,
      proteinG: 27.0,
      fatG: 27.6,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07052 Pork, meat, unspecified part, grilled (without salt and fat)",
        where: "PDF p. 123",
      },
    ],
  },
  {
    id: "sausage",
    name: "Sausage, beef, grilled",
    localNames: [
      {
        name: "sausage",
        language: "Ugandan English",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 sausage",
        grams: 50,
      },
      {
        label: "2 sausages",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 223.0,
      carbsG: 0.0,
      proteinG: 16.1,
      fatG: 17.0,
      fibreG: 3.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07055 Sausage, beef, grilled (without salt and fat)",
        where: "PDF p. 126",
      },
    ],
  },
  {
    id: "tilapia-fried",
    name: "Tilapia, fried",
    localNames: [
      {
        name: "ngege",
        language: "Luganda",
      },
      {
        name: "sato",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 small fish",
        grams: 150,
      },
      {
        label: "1 medium fish",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 437.0,
      carbsG: 0.3,
      proteinG: 45.7,
      fatG: 28.1,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15096 Fried tilapia",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "nile-perch-stew",
    name: "Nile perch, stewed",
    localNames: [
      {
        name: "mputa",
        language: "Luganda",
      },
      {
        name: "sangara",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 piece",
        grams: 100,
      },
      {
        label: "1 ladle",
        grams: 120,
      },
    ],
    per100g: {
      kcal: 125.0,
      carbsG: 2.5,
      proteinG: 14.3,
      fatG: 6.3,
      fibreG: 0.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15107 Stewed Nile Perch",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "fish-dried-stew",
    name: "Dried fish, stewed",
    localNames: [
      {
        name: "ekyennyanja ekikalu",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 330.0,
      carbsG: 3.9,
      proteinG: 25.7,
      fatG: 23.2,
      fibreG: 1.4,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15082 Stewed Dried Fish",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "mukene-dried",
    name: "Mukene (silverfish), dried",
    localNames: [
      {
        name: "mukene",
        language: "Luganda",
      },
      {
        name: "dagaa / omena",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 handful",
        grams: 20,
      },
      {
        label: "1 cup",
        grams: 60,
      },
    ],
    per100g: {
      kcal: 333.0,
      carbsG: 0.0,
      proteinG: 59.5,
      fatG: 10.6,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "08002 Dagaa fish (omena), dried, raw",
        where: "PDF p. 129",
      },
    ],
  },
  {
    id: "mukene-stewed",
    name: "Mukene (silverfish) stew",
    localNames: [
      {
        name: "mukene",
        language: "Luganda",
      },
      {
        name: "omena",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 ladle",
        grams: 100,
      },
      {
        label: "1 bowl",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 180.0,
      carbsG: 6.0,
      proteinG: 8.8,
      fatG: 13.3,
      fibreG: 0.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15017 Omena Stew (Silver Sardine Stew)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "mukene-fried",
    name: "Mukene (silverfish), fried",
    localNames: [
      {
        name: "mukene",
        language: "Luganda",
      },
      {
        name: "omena",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 handful",
        grams: 30,
      },
      {
        label: "1 ladle",
        grams: 60,
      },
    ],
    per100g: {
      kcal: 450.0,
      carbsG: 4.6,
      proteinG: 19.2,
      fatG: 39.3,
      fibreG: 0.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15101 Omena wa Kukaangwa (Fried Omena)",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "egg-boiled",
    name: "Egg, boiled",
    localNames: [
      {
        name: "eggi",
        language: "Luganda",
      },
      {
        name: "yai",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 egg",
        grams: 50,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 92500: 1 large = 50 g (FDC 173424)",
        },
      },
      {
        label: "2 eggs",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 134.0,
      carbsG: 2.0,
      proteinG: 12.7,
      fatG: 8.1,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07027 Egg, chicken, whole, boiled (without salt)",
        where: "PDF p. 120",
      },
    ],
  },
  {
    id: "egg-fried",
    name: "Egg, fried",
    localNames: [
      {
        name: "eggi",
        language: "Luganda",
      },
      {
        name: "yai",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 egg",
        grams: 50,
      },
      {
        label: "2 eggs",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 223.0,
      carbsG: 2.5,
      proteinG: 13.1,
      fatG: 17.9,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15022 Fried Egg (Mayai ya Kukaangwa)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "omelette",
    name: "Omelette",
    localNames: [
      {
        name: "omeleti",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1-egg omelette",
        grams: 70,
      },
      {
        label: "2-egg omelette",
        grams: 140,
      },
    ],
    per100g: {
      kcal: 121.0,
      carbsG: 5.3,
      proteinG: 6.6,
      fatG: 7.8,
      fibreG: 1.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15023 Omelette",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "omelette-spanish",
    name: "Spanish omelette (with vegetables)",
    localNames: [
      {
        name: "omeleti",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1-egg omelette",
        grams: 80,
      },
      {
        label: "2-egg omelette",
        grams: 160,
      },
    ],
    per100g: {
      kcal: 161.0,
      carbsG: 3.2,
      proteinG: 7.5,
      fatG: 12.9,
      fibreG: 0.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15024 Spanish Omelette",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "nsenene",
    name: "Grasshoppers, fresh",
    localNames: [
      {
        name: "nsenene",
        language: "Luganda",
      },
      {
        name: "senene",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 handful",
        grams: 30,
      },
      {
        label: "1 cup",
        grams: 80,
      },
    ],
    per100g: {
      kcal: 210.0,
      carbsG: 0.7,
      proteinG: 14.5,
      fatG: 16.3,
      fibreG: 1.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "14002 Grasshopper, Green, Fresh, Raw",
        where: "PDF p. 162",
      },
    ],
  },
  {
    id: "white-ants",
    name: "White ants (termites), fresh",
    localNames: [
      {
        name: "enswa",
        language: "Luganda",
      },
      {
        name: "kumbi kumbi",
        language: "Swahili",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 handful",
        grams: 30,
      },
    ],
    per100g: {
      kcal: 367.0,
      carbsG: 0.0,
      proteinG: 30.9,
      fatG: 27.0,
      fibreG: 2.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "14004 Termite, Fresh, Raw",
        where: "PDF p. 162",
      },
    ],
  },
  {
    id: "guinea-fowl-stew",
    name: "Guinea fowl, stewed",
    localNames: [
      {
        name: "enkofu",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 piece",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 154.0,
      carbsG: 2.0,
      proteinG: 15.8,
      fatG: 9.0,
      fibreG: 0.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15095 Likhanga (Stewed Guinea Fowl)",
        where: "PDF p. 174",
      },
    ],
  },
  {
    id: "rabbit-stewed",
    name: "Rabbit, stewed",
    localNames: [
      {
        name: "akamyu",
        language: "Luganda",
      },
    ],
    group: "meat-fish-eggs",
    portions: [
      {
        label: "1 portion (palm-sized)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 207.0,
      carbsG: 0.0,
      proteinG: 35.8,
      fatG: 7.1,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "07053 Rabbit meat, stewed (without salt)",
        where: "PDF p. 126",
      },
    ],
  },
  {
    id: "dodo-boiled",
    name: "Dodo (amaranth leaves), boiled",
    localNames: [
      {
        name: "doodo",
        language: "Luganda",
      },
      {
        name: "mchicha / terere",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 38.0,
      carbsG: 1.3,
      proteinG: 3.9,
      fatG: 0.3,
      fibreG: 7.6,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04039 Amaranth, leaves, picked, boiled, drained (without salt)",
        where: "PDF p. 75",
      },
    ],
  },
  {
    id: "dodo-fried",
    name: "Dodo (amaranth leaves), stir-fried",
    localNames: [
      {
        name: "doodo",
        language: "Luganda",
      },
      {
        name: "terere",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 83.0,
      carbsG: 2.9,
      proteinG: 3.0,
      fatG: 5.3,
      fibreG: 5.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15030 “Terere” (Stir fried amaranth leaves)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "nsugga-boiled",
    name: "African nightshade leaves, boiled",
    localNames: [
      {
        name: "nsugga",
        language: "Luganda",
      },
      {
        name: "managu",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 29.0,
      carbsG: 1.3,
      proteinG: 3.6,
      fatG: 0.1,
      fibreG: 4.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04042 Black (African) nightshade, indigenous, leaves, picked, boiled, drained (without salt)",
        where: "PDF p. 78",
      },
    ],
  },
  {
    id: "mixed-greens",
    name: "Spider plant, amaranth and nightshade leaves, cooked",
    localNames: [
      {
        name: "eyobyo, doodo ne nsugga",
        language: "Luganda",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 60.0,
      carbsG: 4.5,
      proteinG: 4.3,
      fatG: 1.9,
      fibreG: 3.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15035 Saget, Terere & Managu (Spider plant, Amaranth & African Nightshade leaves)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "sukuma-boiled",
    name: "Sukuma wiki (kale), boiled",
    localNames: [
      {
        name: "sukuma wiki",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 28.0,
      carbsG: 1.2,
      proteinG: 2.9,
      fatG: 0.3,
      fibreG: 4.4,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04074 Kale (sukuma wiki), boiled, drained (without salt)",
        where: "PDF p. 84",
      },
    ],
  },
  {
    id: "sukuma-fried",
    name: "Sukuma wiki (kale), stir-fried",
    localNames: [
      {
        name: "sukuma wiki",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 54.0,
      carbsG: 2.1,
      proteinG: 2.5,
      fatG: 3.2,
      fibreG: 3.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15031 Sukumawiki (Stir fried kales)",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "cabbage-boiled",
    name: "Cabbage, boiled",
    localNames: [
      {
        name: "kabeeji",
        language: "Luganda",
      },
      {
        name: "kabichi",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "half a cup",
        grams: 75,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85799: 0.5 cup, shredded = 75 g (FDC 169976)",
        },
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 19.0,
      carbsG: 2.2,
      proteinG: 1.1,
      fatG: 0.1,
      fibreG: 2.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04050 Cabbage, leaf head, white, boiled, drained (without salt)",
        where: "PDF p. 78",
      },
    ],
  },
  {
    id: "cabbage-fried",
    name: "Cabbage, stir-fried",
    localNames: [
      {
        name: "kabeeji",
        language: "Luganda",
      },
      {
        name: "kabichi",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 100.0,
      carbsG: 3.1,
      proteinG: 1.2,
      fatG: 8.6,
      fibreG: 2.4,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15032 Stir-fried Cabbage",
        where: "PDF p. 168",
      },
    ],
  },
  {
    id: "tomato",
    name: "Tomato, raw",
    localNames: [
      {
        name: "nnyaanya",
        language: "Luganda",
      },
      {
        name: "nyanya",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 medium",
        grams: 123,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 86686: 1 medium whole (2-3/5" dia) = 123 g (FDC 170457)',
        },
      },
      {
        label: "1 slice",
        grams: 20,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 86687: 1 slice, medium (1/4" thick) = 20 g (FDC 170457)',
        },
      },
    ],
    per100g: {
      kcal: 22.0,
      carbsG: 3.3,
      proteinG: 1.0,
      fatG: 0.2,
      fibreG: 1.4,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04036 Tomato, red, ripe, raw",
        where: "PDF p. 90",
      },
    ],
  },
  {
    id: "tomato-cooked",
    name: "Tomato, boiled",
    localNames: [
      {
        name: "nnyaanya",
        language: "Luganda",
      },
      {
        name: "nyanya",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
    ],
    per100g: {
      kcal: 28.0,
      carbsG: 4.2,
      proteinG: 1.3,
      fatG: 0.3,
      fibreG: 1.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04098 Tomato, red, ripe, boiled, drained (without salt)",
        where: "PDF p. 90",
      },
    ],
  },
  {
    id: "onion",
    name: "Onion, raw",
    localNames: [
      {
        name: "katungulu",
        language: "Luganda",
      },
      {
        name: "kitunguu",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 medium",
        grams: 110,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 85860: 1 medium (2-1/2" dia) = 110 g (FDC 170000)',
        },
      },
      {
        label: "1 tablespoon, chopped",
        grams: 10,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85857: 1 tbsp chopped = 10 g (FDC 170000)",
        },
      },
    ],
    per100g: {
      kcal: 42.0,
      carbsG: 7.6,
      proteinG: 1.5,
      fatG: 0.1,
      fibreG: 2.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "13023 Onion, mature, red skinned, peeled, fresh, raw",
        where: "PDF p. 156",
      },
    ],
  },
  {
    id: "eggplant-boiled",
    name: "Eggplant, boiled",
    localNames: [
      {
        name: "biringanya",
        language: "Luganda",
      },
      {
        name: "biringanya",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 medium",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 29.0,
      carbsG: 3.0,
      proteinG: 1.3,
      fatG: 0.3,
      fibreG: 4.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04068 Eggplant / Brinjal, different varieties, whole edible, boiled, drained (without salt)",
        where: "PDF p. 84",
      },
    ],
  },
  {
    id: "eggplant-stewed",
    name: "Eggplant, stewed",
    localNames: [
      {
        name: "biringanya",
        language: "Luganda",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
    ],
    per100g: {
      kcal: 33.0,
      carbsG: 3.4,
      proteinG: 1.5,
      fatG: 0.4,
      fibreG: 5.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04069 Eggplant / Brinjal, different varieties, whole edible, stewed (without salt)",
        where: "PDF p. 84",
      },
    ],
  },
  {
    id: "pumpkin-boiled",
    name: "Pumpkin, boiled",
    localNames: [
      {
        name: "ensujju",
        language: "Luganda",
      },
      {
        name: "malenge",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 piece (palm-sized)",
        grams: 100,
      },
      {
        label: "1 cup",
        grams: 245,
      },
    ],
    per100g: {
      kcal: 35.0,
      carbsG: 5.6,
      proteinG: 1.3,
      fatG: 0.2,
      fibreG: 2.6,
    },
    gi: 64,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04082 Pumpkin, flesh, yellow w/o seeds, boiled, drained (without salt)",
        where: "PDF p. 87",
      },
      {
        source: "GI-2008",
        item: "Pumpkin, boiled, 64 ± 7",
        where: "Table 1",
      },
    ],
  },
  {
    id: "butternut-boiled",
    name: "Butternut squash, boiled",
    localNames: [
      {
        name: "ensujju",
        language: "Luganda",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 piece (palm-sized)",
        grams: 100,
      },
      {
        label: "1 cup",
        grams: 205,
      },
    ],
    per100g: {
      kcal: 48.0,
      carbsG: 8.8,
      proteinG: 1.6,
      fatG: 0.1,
      fibreG: 2.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04092 Squash, butternut, peeled, flesh, boiled, drained (without salt)",
        where: "PDF p. 90",
      },
    ],
  },
  {
    id: "pumpkin-leaves-boiled",
    name: "Pumpkin leaves, boiled",
    localNames: [
      {
        name: "ebikoola by'ensujju",
        language: "Luganda",
      },
      {
        name: "seveve",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 35.0,
      carbsG: 2.1,
      proteinG: 4.0,
      fatG: 0.7,
      fibreG: 2.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04084 Pumpkin, leaves, boiled, drained (without salt)",
        where: "PDF p. 87",
      },
    ],
  },
  {
    id: "cowpea-leaves-boiled",
    name: "Cowpea leaves, boiled",
    localNames: [
      {
        name: "eggobe",
        language: "Luganda",
      },
      {
        name: "kunde",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 28.0,
      carbsG: 0.6,
      proteinG: 3.2,
      fatG: 0.4,
      fibreG: 4.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04066 Cowpea, leaves, picked, boiled, drained (without salt)",
        where: "PDF p. 81",
      },
    ],
  },
  {
    id: "cowpea-leaves-stewed",
    name: "Cowpea leaves, stewed",
    localNames: [
      {
        name: "eggobe",
        language: "Luganda",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 152.0,
      carbsG: 3.5,
      proteinG: 3.2,
      fatG: 13.3,
      fibreG: 3.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15078 Rhikhuvi (Stewed Cowpea Leaves)",
        where: "PDF p. 171",
      },
    ],
  },
  {
    id: "spider-plant-boiled",
    name: "Spider plant leaves, boiled",
    localNames: [
      {
        name: "ejjobyo",
        language: "Luganda",
      },
      {
        name: "saget / mwangani",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 41.0,
      carbsG: 2.0,
      proteinG: 4.6,
      fatG: 0.7,
      fibreG: 4.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04086 Spider plant, leaves, boiled, drained (without salt)",
        where: "PDF p. 87",
      },
    ],
  },
  {
    id: "jute-mallow-boiled",
    name: "Jute mallow leaves, boiled",
    localNames: [
      {
        name: "otigo",
        language: "Acholi",
      },
      {
        name: "mrenda",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 47.0,
      carbsG: 2.2,
      proteinG: 4.9,
      fatG: 0.2,
      fibreG: 8.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04070 Jute mallow, picked leaves, boiled, drained (without salt)",
        where: "PDF p. 84",
      },
    ],
  },
  {
    id: "sweet-potato-leaves",
    name: "Sweet potato leaves, raw",
    localNames: [
      {
        name: "ebikoola bya lumonde",
        language: "Luganda",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 handful",
        grams: 30,
      },
      {
        label: "1 bowl",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 36.0,
      carbsG: 0.8,
      proteinG: 4.3,
      fatG: 0.5,
      fibreG: 5.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04034 Sweet Potato (Leaves)",
        where: "PDF p. 90",
      },
    ],
  },
  {
    id: "spinach-boiled",
    name: "Spinach, boiled",
    localNames: [
      {
        name: "spinach",
        language: "Ugandan English",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 bowl",
        grams: 200,
      },
    ],
    per100g: {
      kcal: 28.0,
      carbsG: 1.2,
      proteinG: 2.9,
      fatG: 0.4,
      fibreG: 4.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04088 Spinach, leaves, boiled, drained (without salt)",
        where: "PDF p. 90",
      },
    ],
  },
  {
    id: "carrot-boiled",
    name: "Carrot, boiled",
    localNames: [
      {
        name: "kaloti",
        language: "Luganda",
      },
      {
        name: "karoti",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 carrot",
        grams: 46,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 86566: 1 carrot = 46 g (FDC 170394)",
        },
      },
      {
        label: "half a cup, sliced",
        grams: 78,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 86565: 0.5 cup slices = 78 g (FDC 170394)",
        },
      },
    ],
    per100g: {
      kcal: 32.0,
      carbsG: 4.8,
      proteinG: 0.8,
      fatG: 0.3,
      fibreG: 3.4,
    },
    gi: 39,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04061 Carrot, peeled, boiled, drained (without salt)",
        where: "PDF p. 81",
      },
      {
        source: "GI-2008",
        item: "Carrots, boiled, 39 ± 4",
        where: "Table 1",
      },
    ],
  },
  {
    id: "carrot-raw",
    name: "Carrot, raw",
    localNames: [
      {
        name: "kaloti",
        language: "Luganda",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 carrot",
        grams: 60,
      },
      {
        label: "half a cup, grated",
        grams: 55,
      },
    ],
    per100g: {
      kcal: 30.0,
      carbsG: 4.5,
      proteinG: 0.7,
      fatG: 0.2,
      fibreG: 3.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04011 Carrot, peeled, raw",
        where: "PDF p. 81",
      },
    ],
  },
  {
    id: "okra-boiled",
    name: "Okra, boiled",
    localNames: [
      {
        name: "bamia",
        language: "Luganda",
      },
      {
        name: "bamia",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "10 pods",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 29.0,
      carbsG: 4.1,
      proteinG: 1.8,
      fatG: 0.2,
      fibreG: 3.4,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04080 Okra, fresh, boiled, drained (without salt)",
        where: "PDF p. 87",
      },
    ],
  },
  {
    id: "green-pepper",
    name: "Green pepper, raw",
    localNames: [
      {
        name: "pilipili hoho",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 medium",
        grams: 120,
      },
      {
        label: "1 tablespoon, chopped",
        grams: 10,
      },
    ],
    per100g: {
      kcal: 23.0,
      carbsG: 2.9,
      proteinG: 1.5,
      fatG: 0.1,
      fibreG: 2.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04008 Capsicum (sweet peper), green, raw",
        where: "PDF p. 78",
      },
    ],
  },
  {
    id: "mushroom-boiled",
    name: "Mushrooms, boiled",
    localNames: [
      {
        name: "obutiko",
        language: "Luganda",
      },
      {
        name: "uyoga",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 ladle",
        grams: 80,
      },
      {
        label: "1 cup",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 48.0,
      carbsG: 6.1,
      proteinG: 3.2,
      fatG: 0.5,
      fibreG: 3.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04077 Mushroom, fresh, boiled, drained (without salt)",
        where: "PDF p. 87",
      },
    ],
  },
  {
    id: "cucumber",
    name: "Cucumber, raw",
    localNames: [
      {
        name: "kukamba",
        language: "Swahili",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 slice",
        grams: 10,
      },
      {
        label: "half a cucumber",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 11.0,
      carbsG: 1.3,
      proteinG: 0.6,
      fatG: 0.1,
      fibreG: 1.4,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04016 Cucumber, green, unpeeled, raw",
        where: "PDF p. 84",
      },
    ],
  },
  {
    id: "lettuce",
    name: "Lettuce, raw",
    localNames: [
      {
        name: "lettuce",
        language: "Ugandan English",
      },
    ],
    group: "greens-vegetables",
    portions: [
      {
        label: "1 cup, shredded",
        grams: 35,
      },
    ],
    per100g: {
      kcal: 17.0,
      carbsG: 1.9,
      proteinG: 1.2,
      fatG: 0.2,
      fibreG: 1.6,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "04022 Lettuce, not further defined, raw",
        where: "PDF p. 84",
      },
    ],
  },
  {
    id: "banana-ripe",
    name: "Banana, ripe (sweet)",
    localNames: [
      {
        name: "menvu / ndiizi",
        language: "Luganda",
      },
      {
        name: "ndizi",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 small",
        grams: 101,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 93514: 1 small (6" to 6-7/8" long) = 101 g (FDC 173944)',
        },
      },
      {
        label: "1 medium",
        grams: 118,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 93515: 1 medium (7" to 7-7/8" long) = 118 g (FDC 173944)',
        },
      },
    ],
    per100g: {
      kcal: 95.0,
      carbsG: 20.6,
      proteinG: 1.08,
      fatG: 0.3,
      fibreG: 2.75,
    },
    gi: 51,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05004 Banana, cavendish, raw",
        where: "PDF p. 93",
      },
      {
        source: "GI-2008",
        item: "Banana, raw, 51 ± 3",
        where: "Table 1",
      },
    ],
  },
  {
    id: "mango",
    name: "Mango, ripe",
    localNames: [
      {
        name: "muyembe",
        language: "Luganda",
      },
      {
        name: "embe",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 cup, pieces",
        grams: 165,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85651: 1 cup pieces = 165 g (FDC 169910)",
        },
      },
      {
        label: "1 whole mango",
        grams: 336,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85652: 1 fruit without refuse = 336 g (FDC 169910)",
        },
      },
    ],
    per100g: {
      kcal: 64.0,
      carbsG: 14.0,
      proteinG: 0.6,
      fatG: 0.3,
      fibreG: 1.6,
    },
    gi: 51,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05019 Mango, ripe, raw",
        where: "PDF p. 99",
      },
      {
        source: "GI-2008",
        item: "Mango, raw, 51 ± 5",
        where: "Table 1",
      },
    ],
  },
  {
    id: "mango-unripe",
    name: "Mango, unripe",
    localNames: [
      {
        name: "muyembe",
        language: "Luganda",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 cup, pieces",
        grams: 165,
      },
    ],
    per100g: {
      kcal: 45.0,
      carbsG: 8.9,
      proteinG: 0.8,
      fatG: 0.1,
      fibreG: 3.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05020 Mango, unripe, raw",
        where: "PDF p. 99",
      },
    ],
  },
  {
    id: "pineapple",
    name: "Pineapple",
    localNames: [
      {
        name: "nnanaansi",
        language: "Luganda",
      },
      {
        name: "nanasi",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 slice",
        grams: 84,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 84290: 1 slice (3-1/2" dia x 3/4" thick) = 84 g (FDC 169124)',
        },
      },
      {
        label: "1 cup, chunks",
        grams: 165,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 84287: 1 cup, chunks = 165 g (FDC 169124)",
        },
      },
    ],
    per100g: {
      kcal: 41.0,
      carbsG: 8.1,
      proteinG: 0.48,
      fatG: 0.2,
      fibreG: 2.3,
    },
    gi: 59,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05030 Pineapple, raw",
        where: "PDF p. 102",
      },
      {
        source: "GI-2008",
        item: "Pineapple, raw, 59 ± 8",
        where: "Table 1",
      },
    ],
  },
  {
    id: "jackfruit",
    name: "Jackfruit",
    localNames: [
      {
        name: "ffene",
        language: "Luganda",
      },
      {
        name: "fenesi",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 cup",
        grams: 165,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 94754: 1 cup, sliced = 165 g (FDC 174687)",
        },
      },
      {
        label: "5 pods",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 95.0,
      carbsG: 20.5,
      proteinG: 1.4,
      fatG: 0.2,
      fibreG: 2.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05012 Jackfruit, fruit, yellow-fleshed, peeled, raw",
        where: "PDF p. 96",
      },
    ],
  },
  {
    id: "papaya",
    name: "Pawpaw (papaya)",
    localNames: [
      {
        name: "ppapaali",
        language: "Luganda",
      },
      {
        name: "papai",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 cup, pieces",
        grams: 145,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 85692: 1 cup 1" pieces = 145 g (FDC 169926)',
        },
      },
      {
        label: "1 slice",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 36.0,
      carbsG: 6.8,
      proteinG: 0.6,
      fatG: 0.3,
      fibreG: 2.1,
    },
    gi: 56,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05024 Papaya, yellow skin, peeled, raw",
        where: "PDF p. 99",
      },
      {
        source: "GI-2008",
        item: "Table A1 #999: Paw paw (Carica papaya) (Australia)",
        where: "online appendix, p. 30",
      },
    ],
    note: "GI: pawpaw (Australia).",
  },
  {
    id: "avocado",
    name: "Avocado",
    localNames: [
      {
        name: "ovakedo",
        language: "Luganda",
      },
      {
        name: "parachichi",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "half an avocado",
        grams: 100,
      },
      {
        label: "1 avocado",
        grams: 201,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 89226: 1 avocado, NS as to Florida or California = 201 g (FDC 171705)",
        },
      },
    ],
    per100g: {
      kcal: 185.0,
      carbsG: 0.0,
      proteinG: 1.6,
      fatG: 19.6,
      fibreG: 4.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05003 Avocado, ripe, raw",
        where: "PDF p. 93",
      },
    ],
  },
  {
    id: "orange",
    name: "Orange",
    localNames: [
      {
        name: "omucungwa",
        language: "Luganda",
      },
      {
        name: "chungwa",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 orange",
        grams: 131,
        source: {
          source: "USDA-SR-LEGACY",
          item: 'food_portion 84230: 1 fruit (2-5/8" dia) = 131 g (FDC 169097)',
        },
      },
      {
        label: "1 cup, sections",
        grams: 180,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 84227: 1 cup, sections = 180 g (FDC 169097)",
        },
      },
    ],
    per100g: {
      kcal: 42.0,
      carbsG: 7.5,
      proteinG: 0.9,
      fatG: 0.2,
      fibreG: 3.1,
    },
    gi: 43,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05023 Orange, pulp, raw",
        where: "PDF p. 99",
      },
      {
        source: "GI-2008",
        item: "Orange, raw, 43 ± 3",
        where: "Table 1",
      },
    ],
  },
  {
    id: "tangerine",
    name: "Tangerine",
    localNames: [
      {
        name: "mangada",
        language: "Luganda",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 tangerine",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 52.0,
      carbsG: 10.8,
      proteinG: 0.87,
      fatG: 0.2,
      fibreG: 1.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05036 Tangerine, pulp, raw",
        where: "PDF p. 105",
      },
    ],
  },
  {
    id: "watermelon",
    name: "Watermelon",
    localNames: [
      {
        name: "watermelon",
        language: "Ugandan English",
      },
      {
        name: "tikiti maji",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 wedge",
        grams: 286,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 81935: 1 wedge (approx 1/16 of melon) = 286 g (FDC 167765)",
        },
      },
      {
        label: "1 cup, diced",
        grams: 152,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 81933: 1 cup, diced = 152 g (FDC 167765)",
        },
      },
    ],
    per100g: {
      kcal: 26.0,
      carbsG: 5.0,
      proteinG: 0.6,
      fatG: 0.3,
      fibreG: 0.93,
    },
    gi: 76,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05038 Watermelon, fruit, green with white stripes, raw",
        where: "PDF p. 105",
      },
      {
        source: "GI-2008",
        item: "Watermelon, raw, 76 ± 4",
        where: "Table 1",
      },
    ],
  },
  {
    id: "passion-fruit",
    name: "Passion fruit",
    localNames: [
      {
        name: "butunda",
        language: "Luganda",
      },
      {
        name: "passion",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 fruit (pulp)",
        grams: 18,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 84256: 1 fruit without refuse = 18 g (FDC 169108)",
        },
      },
      {
        label: "5 fruits (pulp)",
        grams: 90,
      },
    ],
    per100g: {
      kcal: 75.0,
      carbsG: 8.7,
      proteinG: 2.4,
      fatG: 0.9,
      fibreG: 11.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05025 Passion fruit, dark purple skin, raw",
        where: "PDF p. 99",
      },
    ],
  },
  {
    id: "guava",
    name: "Guava",
    localNames: [
      {
        name: "mapeera",
        language: "Luganda",
      },
      {
        name: "pera",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 guava",
        grams: 55,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 91859: 1 fruit, without refuse = 55 g (FDC 173044)",
        },
      },
      {
        label: "1 cup",
        grams: 165,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 91858: 1 cup = 165 g (FDC 173044)",
        },
      },
    ],
    per100g: {
      kcal: 48.0,
      carbsG: 0.9,
      proteinG: 1.1,
      fatG: 1.1,
      fibreG: 15.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05011 Guava, pink-fleshed, raw",
        where: "PDF p. 96",
      },
    ],
  },
  {
    id: "apple",
    name: "Apple",
    localNames: [
      {
        name: "tufaa",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 medium",
        grams: 180,
      },
      {
        label: "1 small",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 57.0,
      carbsG: 12.4,
      proteinG: 0.3,
      fatG: 0.1,
      fibreG: 2.3,
    },
    gi: 36,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05002 Apple, red, unpeeled, raw",
        where: "PDF p. 93",
      },
      {
        source: "GI-2008",
        item: "Apple, raw, 36 ± 2",
        where: "Table 1",
      },
    ],
  },
  {
    id: "tree-tomato",
    name: "Tree tomato",
    localNames: [
      {
        name: "tamarillo",
        language: "Ugandan English",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 fruit",
        grams: 60,
      },
    ],
    per100g: {
      kcal: 43.0,
      carbsG: 4.6,
      proteinG: 2.1,
      fatG: 0.3,
      fibreG: 6.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05037 Tree tomato, dark red skin, peeled, raw",
        where: "PDF p. 105",
      },
    ],
  },
  {
    id: "lemon-juice",
    name: "Lemon juice",
    localNames: [
      {
        name: "ndimu",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 tablespoon",
        grams: 15,
      },
    ],
    per100g: {
      kcal: 47.0,
      carbsG: 9.5,
      proteinG: 0.6,
      fatG: 0.2,
      fibreG: 2.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05013 Lemon, juice, home squeezed",
        where: "PDF p. 96",
      },
    ],
  },
  {
    id: "pear",
    name: "Pear",
    localNames: [
      {
        name: "pear",
        language: "Ugandan English",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 medium",
        grams: 180,
      },
    ],
    per100g: {
      kcal: 48.0,
      carbsG: 9.1,
      proteinG: 0.4,
      fatG: 0.2,
      fibreG: 4.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05028 Pear, unpeeled, raw",
        where: "PDF p. 102",
      },
    ],
  },
  {
    id: "grapes",
    name: "Grapes",
    localNames: [
      {
        name: "zabibu",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 cup",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 71.0,
      carbsG: 16.0,
      proteinG: 0.6,
      fatG: 0.1,
      fibreG: 2.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05010 Grapes, green, raw",
        where: "PDF p. 96",
      },
    ],
  },
  {
    id: "strawberry",
    name: "Strawberries",
    localNames: [
      {
        name: "strawberry",
        language: "Ugandan English",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 cup",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 35.0,
      carbsG: 6.3,
      proteinG: 0.7,
      fatG: 0.2,
      fibreG: 2.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05034 Strawberry, raw",
        where: "PDF p. 102",
      },
    ],
  },
  {
    id: "coconut-flesh",
    name: "Coconut, fresh flesh",
    localNames: [
      {
        name: "nazi",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "1 piece",
        grams: 45,
      },
      {
        label: "1 cup, grated",
        grams: 80,
      },
    ],
    per100g: {
      kcal: 423.0,
      carbsG: 8.5,
      proteinG: 4.4,
      fatG: 39.0,
      fibreG: 10.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "10002 Coconut, fresh, mature fruit, flesh",
        where: "PDF p. 141",
      },
    ],
  },
  {
    id: "dates",
    name: "Dates, dried",
    localNames: [
      {
        name: "tende",
        language: "Swahili",
      },
    ],
    group: "fruits",
    portions: [
      {
        label: "3 dates",
        grams: 24,
      },
    ],
    per100g: {
      kcal: 305.0,
      carbsG: 68.7,
      proteinG: 2.4,
      fatG: 0.2,
      fibreG: 9.7,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05007 Date, dried",
        where: "PDF p. 93",
      },
    ],
  },
  {
    id: "mandazi",
    name: "Mandazi",
    localNames: [
      {
        name: "mandazi",
        language: "Luganda",
      },
      {
        name: "maandazi",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 mandazi",
        grams: 50,
      },
      {
        label: "2 mandazi",
        grams: 100,
      },
    ],
    per100g: {
      kcal: 340.0,
      carbsG: 48.7,
      proteinG: 6.4,
      fatG: 12.9,
      fibreG: 2.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15125 Basic Mandazi (East African Doughnuts; Basic)",
        where: "PDF p. 177",
      },
    ],
  },
  {
    id: "samosa-meat",
    name: "Samosa, meat",
    localNames: [
      {
        name: "sambusa",
        language: "Luganda",
      },
      {
        name: "sambusa",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 samosa",
        grams: 60,
      },
      {
        label: "2 samosas",
        grams: 120,
      },
    ],
    per100g: {
      kcal: 443.0,
      carbsG: 40.5,
      proteinG: 18.8,
      fatG: 22.2,
      fibreG: 3.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15025 Meat Samosa (Sambusa ya Nyama)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "samosa-veg",
    name: "Samosa, vegetable",
    localNames: [
      {
        name: "sambusa",
        language: "Luganda",
      },
      {
        name: "sambusa",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 samosa",
        grams: 60,
      },
      {
        label: "2 samosas",
        grams: 120,
      },
    ],
    per100g: {
      kcal: 325.0,
      carbsG: 40.2,
      proteinG: 8.5,
      fatG: 13.1,
      fibreG: 6.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15026 Vegetable Samosa (Sambusa ya Mboga)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "chips",
    name: "Chips (fried potatoes)",
    localNames: [
      {
        name: "chips",
        language: "Ugandan English",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 small plate",
        grams: 150,
      },
      {
        label: "1 large plate",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 326.0,
      carbsG: 44.4,
      proteinG: 4.8,
      fatG: 13.6,
      fibreG: 3.3,
    },
    gi: 63,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15110 Potato Chips",
        where: "PDF p. 177",
      },
      {
        source: "GI-2008",
        item: "Potato, french fries, 63 ± 5",
        where: "Table 1",
      },
    ],
  },
  {
    id: "crisps",
    name: "Potato crisps",
    localNames: [
      {
        name: "crisps",
        language: "Ugandan English",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 small packet",
        grams: 28,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85331: 1 oz = 28 g (FDC 169677)",
        },
      },
      {
        label: "1 large bag",
        grams: 227,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85334: 1 bag (8 oz) = 227 g (FDC 169677)",
        },
      },
    ],
    per100g: {
      kcal: 532.0,
      carbsG: 50.7,
      proteinG: 6.39,
      fatG: 33.98,
      fibreG: 3.1,
    },
    gi: 56,
    giCategory: "medium",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 169677 (NDB 19411) Snacks, potato chips, plain, salted",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
      {
        source: "GI-2008",
        item: "Potato crisps, 56 ± 3",
        where: "Table 1",
      },
    ],
  },
  {
    id: "popcorn",
    name: "Popcorn, oil-popped",
    localNames: [
      {
        name: "popcorn",
        language: "Ugandan English",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 cup",
        grams: 11,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 81613: 1 cup = 11 g (FDC 167549)",
        },
      },
      {
        label: "1 small packet",
        grams: 28.35,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 81614: 1 oz = 28.35 g (FDC 167549)",
        },
      },
    ],
    per100g: {
      kcal: 583.0,
      carbsG: 37.0,
      proteinG: 7.29,
      fatG: 43.55,
      fibreG: 8.1,
    },
    gi: 65,
    giCategory: "medium",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 167549 (NDB 19035) Snacks, popcorn, oil-popped, microwave, regular flavor, no trans fat",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
      {
        source: "GI-2008",
        item: "Popcorn, 65 ± 5",
        where: "Table 1",
      },
    ],
  },
  {
    id: "biscuits-sweet",
    name: "Biscuits, sweet",
    localNames: [
      {
        name: "biskuti",
        language: "Luganda",
      },
      {
        name: "biskuti",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 biscuit",
        grams: 10,
      },
      {
        label: "1 small packet",
        grams: 50,
      },
    ],
    per100g: {
      kcal: 460.0,
      carbsG: 69.3,
      proteinG: 6.1,
      fatG: 17.2,
      fibreG: 2.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01004 Biscuit, Sweet",
        where: "PDF p. 42",
      },
    ],
  },
  {
    id: "biscuits-savoury",
    name: "Biscuits, savoury (crackers)",
    localNames: [
      {
        name: "biskuti",
        language: "Luganda",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 biscuit",
        grams: 8,
      },
      {
        label: "1 small packet",
        grams: 50,
      },
    ],
    per100g: {
      kcal: 492.0,
      carbsG: 58.9,
      proteinG: 6.6,
      fatG: 24.9,
      fibreG: 3.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01003 Biscuit, Savoury",
        where: "PDF p. 42",
      },
    ],
  },
  {
    id: "cake",
    name: "Cake, plain",
    localNames: [
      {
        name: "keeki",
        language: "Luganda",
      },
      {
        name: "keki",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 slice",
        grams: 60,
      },
      {
        label: "1 cupcake",
        grams: 50,
      },
    ],
    per100g: {
      kcal: 363.0,
      carbsG: 48.8,
      proteinG: 7.1,
      fatG: 15.3,
      fibreG: 1.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01012 Cake or cupcake, plain butter cake, commercial",
        where: "PDF p. 45",
      },
    ],
  },
  {
    id: "kaimati",
    name: "Kaimati (fried dough balls)",
    localNames: [
      {
        name: "kaimati",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "5 balls",
        grams: 50,
      },
    ],
    per100g: {
      kcal: 429.0,
      carbsG: 52.8,
      proteinG: 4.6,
      fatG: 21.8,
      fibreG: 1.6,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15003 Kaimati (Fried Dumplings)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "bhajia",
    name: "Potato bhajia",
    localNames: [
      {
        name: "bhajia",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 piece",
        grams: 30,
      },
      {
        label: "5 pieces",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 471.0,
      carbsG: 37.1,
      proteinG: 8.6,
      fatG: 31.0,
      fibreG: 4.8,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15131 Potato Bhajia",
        where: "PDF p. 177",
      },
    ],
  },
  {
    id: "egg-toast",
    name: "Egg toast",
    localNames: [
      {
        name: "tosti mayai",
        language: "Swahili",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 slice",
        grams: 60,
      },
    ],
    per100g: {
      kcal: 280.0,
      carbsG: 32.4,
      proteinG: 12.5,
      fatG: 10.7,
      fibreG: 1.9,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15028 Tosti Mayai (Egg Toast)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "scone",
    name: "Scone, plain",
    localNames: [
      {
        name: "scone",
        language: "Ugandan English",
      },
    ],
    group: "snacks",
    portions: [
      {
        label: "1 scone",
        grams: 50,
      },
    ],
    per100g: {
      kcal: 375.0,
      carbsG: 51.4,
      proteinG: 7.5,
      fatG: 15.0,
      fibreG: 2.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "01036 Scone, plain, commercial",
        where: "PDF p. 51",
      },
    ],
  },
  {
    id: "tea-milk",
    name: "Milk tea (chai ya maziwa)",
    localNames: [
      {
        name: "caayi",
        language: "Luganda",
      },
      {
        name: "chai ya maziwa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 36.0,
      carbsG: 5.4,
      proteinG: 1.1,
      fatG: 1.2,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15081 Chai ya Maziwa (Mixed Tea)",
        where: "PDF p. 171",
      },
    ],
    note: "Kenya's mixed-tea recipe; the table does not say how much sugar it holds.",
  },
  {
    id: "tea-black",
    name: "Tea, black, no sugar",
    localNames: [
      {
        name: "caayi",
        language: "Luganda",
      },
      {
        name: "chai",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 237,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 92147: 1 cup (8 fl oz) = 237 g (FDC 173227)",
        },
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 1.0,
      carbsG: 0.3,
      proteinG: 0.0,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 173227 (NDB 14355) Beverages, tea, black, brewed, prepared with tap water",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
    ],
  },
  {
    id: "coffee-black",
    name: "Coffee, black, no sugar",
    localNames: [
      {
        name: "kaawa",
        language: "Luganda",
      },
      {
        name: "kahawa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 237,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 89520: 1 cup (8 fl oz) = 237 g (FDC 171890)",
        },
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 1.0,
      carbsG: 0.0,
      proteinG: 0.12,
      fatG: 0.02,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 171890 (NDB 14209) Beverages, coffee, brewed, prepared with tap water",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
    ],
  },
  {
    id: "soda-cola",
    name: "Soda, cola",
    localNames: [
      {
        name: "soda",
        language: "Ugandan English",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 bottle (300 ml)",
        grams: 310,
      },
      {
        label: "1 can or bottle (12 fl oz)",
        grams: 370,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 95017: 1 can or bottle (12 fl oz) = 370 g (FDC 174852)",
        },
      },
    ],
    per100g: {
      kcal: 42.0,
      carbsG: 10.4,
      proteinG: 0.0,
      fatG: 0.25,
      fibreG: 0.0,
    },
    gi: 59,
    giCategory: "medium",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 174852 (NDB 14148) Beverages, carbonated, cola, regular",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
      {
        source: "GI-2008",
        item: "Soft drink/soda, 59 ± 3",
        where: "Table 1",
      },
    ],
  },
  {
    id: "soda-orange",
    name: "Soda, orange",
    localNames: [
      {
        name: "soda",
        language: "Ugandan English",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 bottle (300 ml)",
        grams: 310,
      },
      {
        label: "1 can or bottle (12 fl oz)",
        grams: 372,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 95027: 1 can or bottle (12 fl oz) = 372 g (FDC 174854)",
        },
      },
    ],
    per100g: {
      kcal: 48.0,
      carbsG: 12.3,
      proteinG: 0.0,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: 68,
    giCategory: "medium",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 174854 (NDB 14150) Beverages, carbonated, orange",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
      {
        source: "GI-2008",
        item: "Table A1 #48: Fanta®, orange soft drink (Coca Cola Amatil, Australia)",
        where: "online appendix, p. 2",
      },
    ],
    note: "GI: Fanta, orange soft drink.",
  },
  {
    id: "orange-juice",
    name: "Orange juice, fresh",
    localNames: [
      {
        name: "omubisi gw'emicungwa",
        language: "Luganda",
      },
      {
        name: "juisi ya machungwa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 glass (250 ml)",
        grams: 250,
      },
      {
        label: "1 cup",
        grams: 248,
      },
    ],
    per100g: {
      kcal: 45.0,
      carbsG: 10.2,
      proteinG: 0.7,
      fatG: 0.2,
      fibreG: 0.2,
    },
    gi: 50,
    giCategory: "low",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 169098 (NDB 9206) Orange juice, raw (Includes foods for USDA's Food Distribution Program)",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
      {
        source: "GI-2008",
        item: "Orange juice, 50 ± 2",
        where: "Table 1",
      },
    ],
  },
  {
    id: "passion-juice",
    name: "Passion fruit juice",
    localNames: [
      {
        name: "omubisi gwa butunda",
        language: "Luganda",
      },
      {
        name: "juisi ya pasheni",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 glass (250 ml)",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 96.0,
      carbsG: 22.9,
      proteinG: 0.8,
      fatG: 0.1,
      fibreG: 0.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "05026 Passion Fruit, juice",
        where: "PDF p. 102",
      },
    ],
  },
  {
    id: "pineapple-juice",
    name: "Pineapple juice, unsweetened",
    localNames: [
      {
        name: "omubisi gwa nnanaansi",
        language: "Luganda",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 82628: 1 cup = 250 g (FDC 168187)",
        },
      },
    ],
    per100g: {
      kcal: 53.0,
      carbsG: 12.7,
      proteinG: 0.36,
      fatG: 0.12,
      fibreG: 0.2,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 168187 (NDB 9409) Pineapple juice, canned or bottled, unsweetened, with added ascorbic acid",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
    ],
  },
  {
    id: "sugarcane-juice",
    name: "Sugarcane juice",
    localNames: [
      {
        name: "ebikajjo",
        language: "Luganda",
      },
      {
        name: "miwa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 glass (250 ml)",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 37.0,
      carbsG: 8.5,
      proteinG: 0.1,
      fatG: 0.2,
      fibreG: 0.6,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "11002 Sugarcane, Juice, Raw",
        where: "PDF p. 144",
      },
    ],
  },
  {
    id: "milk-whole",
    name: "Milk, whole, boiled",
    localNames: [
      {
        name: "amata",
        language: "Luganda",
      },
      {
        name: "maziwa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 244,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 88314: 1 cup = 244 g (FDC 171265)",
        },
      },
      {
        label: "half a cup",
        grams: 122,
      },
    ],
    per100g: {
      kcal: 82.0,
      carbsG: 7.2,
      proteinG: 3.9,
      fatG: 4.2,
      fibreG: 0.0,
    },
    gi: 39,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "06029 Milk, cow, whole, fresh, boiled",
        where: "PDF p. 114",
      },
      {
        source: "GI-2008",
        item: "Milk, full fat, 39 ± 3",
        where: "Table 1",
      },
    ],
  },
  {
    id: "milk-skim",
    name: "Milk, skimmed, boiled",
    localNames: [
      {
        name: "amata",
        language: "Luganda",
      },
      {
        name: "maziwa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 244,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 88314: 1 cup = 244 g (FDC 171265)",
        },
      },
      {
        label: "half a cup",
        grams: 122,
      },
    ],
    per100g: {
      kcal: 45.0,
      carbsG: 6.8,
      proteinG: 4.1,
      fatG: 0.1,
      fibreG: 0.0,
    },
    gi: 37,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "06028 Milk, cow, skimmed, boiled",
        where: "PDF p. 111",
      },
      {
        source: "GI-2008",
        item: "Milk, skim, 37 ± 4",
        where: "Table 1",
      },
    ],
  },
  {
    id: "milk-fermented",
    name: "Fermented milk",
    localNames: [
      {
        name: "bongo",
        language: "Ugandan English",
      },
      {
        name: "maziwa lala",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 245,
      },
      {
        label: "half a cup",
        grams: 122,
      },
    ],
    per100g: {
      kcal: 65.0,
      carbsG: 4.1,
      proteinG: 2.8,
      fatG: 4.1,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "06020 Milk, cow, whole, fermented (Lala - Industrial)",
        where: "PDF p. 111",
      },
    ],
  },
  {
    id: "yoghurt",
    name: "Yoghurt, plain",
    localNames: [
      {
        name: "yogati",
        language: "Luganda",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 245,
      },
      {
        label: "1 small tub",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 85.0,
      carbsG: 11.3,
      proteinG: 2.9,
      fatG: 3.1,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "06026 Yoghurt, cow milk, whole, plain",
        where: "PDF p. 114",
      },
    ],
  },
  {
    id: "porridge-maize",
    name: "Maize porridge (uji)",
    localNames: [
      {
        name: "obuugi",
        language: "Luganda",
      },
      {
        name: "uji wa mahindi",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 52.0,
      carbsG: 8.5,
      proteinG: 1.5,
      fatG: 1.1,
      fibreG: 1.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15001 Uji wa mahindi (Maize Porridge)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "porridge-millet",
    name: "Millet porridge",
    localNames: [
      {
        name: "obuugi bw'obulo",
        language: "Luganda",
      },
      {
        name: "uji wa wimbi",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 40.0,
      carbsG: 7.8,
      proteinG: 0.7,
      fatG: 0.2,
      fibreG: 2.1,
    },
    gi: 67,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15014 Finger Millet Porridge (Uji wa Wimbi)",
        where: "PDF p. 165",
      },
      {
        source: "GI-2008",
        item: "Millet porridge, 67 ± 5",
        where: "Table 1",
      },
    ],
  },
  {
    id: "porridge-sorghum-mix",
    name: "Sorghum, millet and maize porridge",
    localNames: [
      {
        name: "obuugi",
        language: "Luganda",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 41.0,
      carbsG: 6.3,
      proteinG: 1.3,
      fatG: 0.9,
      fibreG: 1.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15002 Sorghum, Finger Millet and Maize Porridge",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "porridge-cassava",
    name: "Cassava porridge",
    localNames: [
      {
        name: "uji wa muhogo",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 28.0,
      carbsG: 6.8,
      proteinG: 0.1,
      fatG: 0.0,
      fibreG: 0.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15013 Cassava Porridge (Uji wa Muhogo)",
        where: "PDF p. 165",
      },
    ],
  },
  {
    id: "porridge-rice",
    name: "Rice porridge",
    localNames: [
      {
        name: "uji wa mchele",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 56.0,
      carbsG: 10.2,
      proteinG: 0.6,
      fatG: 1.3,
      fibreG: 0.2,
    },
    gi: 78,
    giCategory: "high",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15016 Rice Flour Porridge (Uji wa Mchele)",
        where: "PDF p. 165",
      },
      {
        source: "GI-2008",
        item: "Rice porridge/congee, 78 ± 9",
        where: "Table 1",
      },
    ],
  },
  {
    id: "porridge-oats",
    name: "Oat porridge",
    localNames: [
      {
        name: "oats",
        language: "Ugandan English",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 bowl",
        grams: 300,
      },
    ],
    per100g: {
      kcal: 86.0,
      carbsG: 15.3,
      proteinG: 1.9,
      fatG: 1.6,
      fibreG: 1.4,
    },
    gi: 55,
    giCategory: "low",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15123 Oat Porridge (Uji wa Shayiri)",
        where: "PDF p. 177",
      },
      {
        source: "GI-2008",
        item: "Porridge, rolled oats, 55 ± 2",
        where: "Table 1",
      },
    ],
  },
  {
    id: "porridge-wheat",
    name: "Wheat flour porridge",
    localNames: [
      {
        name: "uji wa ngano",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 mug",
        grams: 350,
      },
    ],
    per100g: {
      kcal: 111.0,
      carbsG: 16.1,
      proteinG: 2.5,
      fatG: 3.9,
      fibreG: 0.9,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "15136 Wheat Flour Porridge (Uji wa Ngano)",
        where: "PDF p. 177",
      },
    ],
  },
  {
    id: "beer-lager",
    name: "Beer, lager",
    localNames: [
      {
        name: "bbiya",
        language: "Luganda",
      },
      {
        name: "bia",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 bottle (500 ml)",
        grams: 505,
      },
      {
        label: "1 can",
        grams: 356,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 83687: 1 can = 356 g (FDC 168746)",
        },
      },
    ],
    per100g: {
      kcal: 43.0,
      carbsG: 3.5,
      proteinG: 0.46,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 168746 (NDB 14003) Alcoholic beverage, beer, regular, all",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
    ],
  },
  {
    id: "beer-millet",
    name: "Millet beer (local brew)",
    localNames: [
      {
        name: "malwa",
        language: "Ugandan English",
      },
      {
        name: "ajon",
        language: "Ateso",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 calabash (1 litre)",
        grams: 1000,
      },
    ],
    per100g: {
      kcal: 43.0,
      carbsG: 5.7,
      proteinG: 0.7,
      fatG: 0.0,
      fibreG: 0.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "WAFCT-2019",
        item: "12_003 Beer, millet (ca. 3% v/v alcohol)",
        where: "sheet 03 NV_sum_39",
      },
    ],
  },
  {
    id: "beer-maize",
    name: "Maize beer (local brew)",
    localNames: [
      {
        name: "busaa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 cup",
        grams: 250,
      },
      {
        label: "1 litre",
        grams: 1000,
      },
    ],
    per100g: {
      kcal: 33.0,
      carbsG: 3.3,
      proteinG: 0.6,
      fatG: 0.0,
      fibreG: 0.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "WAFCT-2019",
        item: "12_002 Beer, maize (ca. 3% v/v alcohol)",
        where: "sheet 03 NV_sum_39",
      },
    ],
  },
  {
    id: "waragi",
    name: "Waragi (spirit, 40%)",
    localNames: [
      {
        name: "waragi",
        language: "Luganda",
      },
      {
        name: "chang'aa",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 tot (1.5 fl oz)",
        grams: 42,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 94946: 1 jigger (1.5 fl oz) = 42 g (FDC 174815)",
        },
      },
      {
        label: "1 sachet (100 ml)",
        grams: 93,
      },
    ],
    per100g: {
      kcal: 231.0,
      carbsG: 0.0,
      proteinG: 0.0,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "USDA-SR-LEGACY",
        item: "FDC 174815 (NDB 14037) Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey) 80 proof",
        where: "available carbohydrate = carbohydrate by difference − total dietary fibre",
      },
    ],
  },
  {
    id: "wine-red",
    name: "Wine, red",
    localNames: [
      {
        name: "divai",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 glass (150 ml)",
        grams: 150,
      },
    ],
    per100g: {
      kcal: 74.0,
      carbsG: 1.8,
      proteinG: 0.2,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "12007 Wine, Red",
        where: "PDF p. 147",
      },
    ],
  },
  {
    id: "coconut-water",
    name: "Coconut water",
    localNames: [
      {
        name: "maji ya madafu",
        language: "Swahili",
      },
    ],
    group: "drinks",
    portions: [
      {
        label: "1 glass (250 ml)",
        grams: 250,
      },
    ],
    per100g: {
      kcal: 23.0,
      carbsG: 4.8,
      proteinG: 0.8,
      fatG: 0.1,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "12002 Coconut, fresh, water",
        where: "PDF p. 147",
      },
    ],
  },
  {
    id: "sugar",
    name: "Sugar",
    localNames: [
      {
        name: "sukaali",
        language: "Luganda",
      },
      {
        name: "sukari",
        language: "Swahili",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 teaspoon",
        grams: 4.2,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85287: 1 tsp = 4.2 g (FDC 169655)",
        },
      },
      {
        label: "1 tablespoon",
        grams: 12.6,
      },
    ],
    per100g: {
      kcal: 400.0,
      carbsG: 100.0,
      proteinG: 0.0,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: 65,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "11003 Sugar, white, granulated or lump",
        where: "PDF p. 144",
      },
      {
        source: "GI-2008",
        item: "Sucrose, 65 ± 4",
        where: "Table 1",
      },
    ],
  },
  {
    id: "honey",
    name: "Honey",
    localNames: [
      {
        name: "omubisi gw'enjuki",
        language: "Luganda",
      },
      {
        name: "asali",
        language: "Swahili",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 tablespoon",
        grams: 21,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 85265: 1 tbsp = 21 g (FDC 169640)",
        },
      },
      {
        label: "1 teaspoon",
        grams: 7,
      },
    ],
    per100g: {
      kcal: 322.0,
      carbsG: 80.1,
      proteinG: 0.4,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: 61,
    giCategory: "medium",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "11001 Honey, Raw",
        where: "PDF p. 144",
      },
      {
        source: "GI-2008",
        item: "Honey, 61 ± 3",
        where: "Table 1",
      },
    ],
  },
  {
    id: "oil",
    name: "Cooking oil (sunflower)",
    localNames: [
      {
        name: "butto",
        language: "Luganda",
      },
      {
        name: "mafuta",
        language: "Swahili",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 teaspoon",
        grams: 4.5,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 87799: 1 tsp = 4.5 g (FDC 171025)",
        },
      },
      {
        label: "1 tablespoon",
        grams: 13.6,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 87797: 1 tbsp = 13.6 g (FDC 171025)",
        },
      },
    ],
    per100g: {
      kcal: 900.0,
      carbsG: 0.0,
      proteinG: 0.0,
      fatG: 100.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "09013 Sun flower oil",
        where: "PDF p. 138",
      },
    ],
  },
  {
    id: "fat-vegetable",
    name: "Vegetable cooking fat",
    localNames: [
      {
        name: "butto",
        language: "Luganda",
      },
      {
        name: "kimbo",
        language: "Ugandan English",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 teaspoon",
        grams: 4.3,
      },
      {
        label: "1 tablespoon",
        grams: 12.8,
      },
    ],
    per100g: {
      kcal: 900.0,
      carbsG: 0.0,
      proteinG: 0.1,
      fatG: 100.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "09011 Shortening, commercial, vegetable fat",
        where: "PDF p. 138",
      },
    ],
  },
  {
    id: "ghee",
    name: "Ghee",
    localNames: [
      {
        name: "muzigo",
        language: "Luganda",
      },
      {
        name: "samli",
        language: "Swahili",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 teaspoon",
        grams: 4.3,
      },
      {
        label: "1 tablespoon",
        grams: 12.8,
      },
    ],
    per100g: {
      kcal: 898.0,
      carbsG: 0.0,
      proteinG: 0.3,
      fatG: 99.9,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "06008 Ghee (cow milk)",
        where: "PDF p. 108",
      },
    ],
  },
  {
    id: "margarine",
    name: "Margarine",
    localNames: [
      {
        name: "bulubandi",
        language: "Luganda",
      },
      {
        name: "blue band",
        language: "Ugandan English",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 teaspoon (on bread)",
        grams: 5,
      },
      {
        label: "1 tablespoon",
        grams: 14,
      },
    ],
    per100g: {
      kcal: 748.0,
      carbsG: 0.0,
      proteinG: 0.1,
      fatG: 83.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "09006 Margarine,80% fat",
        where: "PDF p. 138",
      },
    ],
  },
  {
    id: "salt",
    name: "Salt, iodised",
    localNames: [
      {
        name: "omunnyo",
        language: "Luganda",
      },
      {
        name: "chumvi",
        language: "Swahili",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 pinch",
        grams: 0.4,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 92597: 1 dash = 0.4 g (FDC 173468)",
        },
      },
      {
        label: "1 teaspoon",
        grams: 6,
        source: {
          source: "USDA-SR-LEGACY",
          item: "food_portion 92594: 1 tsp = 6 g (FDC 173468)",
        },
      },
    ],
    per100g: {
      kcal: 0.0,
      carbsG: 0.0,
      proteinG: 0.0,
      fatG: 0.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "13027 Salt, Iodized",
        where: "PDF p. 156",
      },
    ],
  },
  {
    id: "palm-oil",
    name: "Red palm oil",
    localNames: [
      {
        name: "mafuta ya mawese",
        language: "Swahili",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 tablespoon",
        grams: 13.6,
      },
    ],
    per100g: {
      kcal: 891.0,
      carbsG: 0.0,
      proteinG: 0.0,
      fatG: 99.0,
      fibreG: 0.0,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "09010 Red palm oil",
        where: "PDF p. 138",
      },
    ],
  },
  {
    id: "coconut-milk",
    name: "Coconut milk",
    localNames: [
      {
        name: "tui la nazi",
        language: "Swahili",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 tablespoon",
        grams: 15,
      },
      {
        label: "half a cup",
        grams: 120,
      },
    ],
    per100g: {
      kcal: 140.0,
      carbsG: 1.8,
      proteinG: 1.0,
      fatG: 14.3,
      fibreG: 0.3,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "13010 Coconut, Milk",
        where: "PDF p. 153",
      },
    ],
  },
  {
    id: "tomato-paste",
    name: "Tomato paste",
    localNames: [
      {
        name: "nyaanya",
        language: "Luganda",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 tablespoon",
        grams: 16,
      },
    ],
    per100g: {
      kcal: 78.0,
      carbsG: 13.6,
      proteinG: 3.2,
      fatG: 0.3,
      fibreG: 4.1,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "13032 Tomato, paste, with added salt",
        where: "PDF p. 159",
      },
    ],
  },
  {
    id: "ketchup",
    name: "Tomato sauce (ketchup)",
    localNames: [
      {
        name: "sauce",
        language: "Ugandan English",
      },
    ],
    group: "basics",
    portions: [
      {
        label: "1 tablespoon",
        grams: 17,
      },
    ],
    per100g: {
      kcal: 115.0,
      carbsG: 26.1,
      proteinG: 1.6,
      fatG: 0.2,
      fibreG: 1.5,
    },
    gi: null,
    giCategory: "unknown",
    sources: [
      {
        source: "KE-FCT-2018",
        item: "13031 Tomato, sauce (Ketchup)",
        where: "PDF p. 159",
      },
    ],
  },
];

/** Dishes logged as their parts, so every number still comes from a sourced food. */
export const COMBOS: Combo[] = [
  {
    id: "rolex",
    name: "Rolex (chapati rolled with omelette)",
    localNames: [
      {
        name: "rolex",
        language: "Ugandan English",
      },
    ],
    group: "snacks",
    description: "1 chapati + 2-egg omelette",
    parts: [
      {
        foodId: "chapati",
        grams: 70,
      },
      {
        foodId: "omelette",
        grams: 140,
      },
    ],
  },
  {
    id: "kikomando",
    name: "Kikomando (chapati with beans)",
    localNames: [
      {
        name: "kikomando",
        language: "Luganda",
      },
    ],
    group: "snacks",
    description: "1 chapati + 2 ladles of beans",
    parts: [
      {
        foodId: "chapati",
        grams: 70,
      },
      {
        foodId: "beans-stew",
        grams: 200,
      },
    ],
  },
  {
    id: "chips-chicken",
    name: "Chips and chicken",
    localNames: [
      {
        name: "chips ne nkoko",
        language: "Luganda",
      },
    ],
    group: "snacks",
    description: "1 plate of chips + 1 piece of fried chicken",
    parts: [
      {
        foodId: "chips",
        grams: 200,
      },
      {
        foodId: "chicken-fried",
        grams: 100,
      },
    ],
  },
];
