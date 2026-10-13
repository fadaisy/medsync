# The national list (EMHSLU)

`emhslu-2023.csv`: the Essential Medicines and Health Supplies List for Uganda 2023 (Ministry of Health, PDF,
118 pages), converted on 13 Oct 2026 from the copy the owner supplied. 2,721 rows:

- 802 medicines (Section A, pp. 28–51);
- 1,919 health supplies (Sections B and C, and Section D's laboratory supplies, Table 2, pp. 81–113).

Every value is copied as printed, misspellings included. Nothing is corrected. `check_note` carries why a row
was not read with confidence (26 rows); such a row cannot be linked to a medicine until the CSO records a check
against the PDF. The PDF's own summary on p. 23 gives 784 medicines, but its tables hold 802; the file follows
the tables.

Columns:
- `kind`, `list_section`, `generic_name` (a supply's item description), `form`, `strength`;
- `unit` (a supply's specification or unit), `level_of_care`, `ven_class`, `therapeutic_class`;
- `specialist` (under a "Specialist medicines" band), `source_page`, `check_note`.

Load with `scripts/pharmacy/load-national-list.ts` (ADR 0282).
