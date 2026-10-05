# Adversarial verification brief: MedSync diabetes reference catalogue (REF-DM)

You are checking clinical reference values that will drive decision support in a hospital system in Uganda. A wrong number here can hurt a patient. Your job is to try to REFUTE each entry, not to agree with it.

## What you have
A worklist JSON file (path given in your task). Each item is one reference entry:
`ref` (id), `text` (what the entry claims), `value` + `unit` (the number a rule will use; null for text-only entries), `source`, `url`, `section`, `quoteRecorded` (the quote a previous researcher recorded), `conversion` (a stated unit conversion, e.g. "annually = 12 months"), `otherClaimUrls` (other places that support it).

## What to do, for each item
1. Open the `url` with WebFetch and find the passage named in `section`. If the URL fails, try the URLs in `otherClaimUrls`, then another official copy you can reach by URL (publisher page, PMC, NCBI Bookshelf, the body's own site). You have NO web search: WebFetch only. Do not use curl or the shell for web access.
2. Ask the fetch tool for the VERBATIM sentence or table row containing the number. Large PDFs are only partly readable: say so if the passage is beyond what you could read.
3. Compare, with operators and units. `>=` versus `>`, `<` versus `<=`, mg/dL versus mmol/L, mg/g versus mg/mmol, "at least annually" versus "every 2 years" all matter. Check the entry is attributed to the right body and edition (a reprint of another body's table is NOT that body's own recommendation).
4. Give one verdict:
   - `confirmed`: you read the passage and it says what the entry says (value, operator, unit, attribution).
   - `confirmed_with_note`: right, but the wording needs a qualifier the entry lacks (say what).
   - `wrong_value`: the source gives a different number or operator (give the correct one, verbatim).
   - `wrong_attribution`: the number is right but belongs to a different body, edition or section.
   - `not_found`: you opened the source and could not find the passage.
   - `could_not_open`: no copy could be opened.
   Never mark `confirmed` from memory or because a value "is well known". If you did not read it, it is not confirmed.

## Rules
- Do not invent quotes. A quote must be text the fetch tool returned.
- Do not give or record any drug dose.
- Spend effort in proportion to risk: items with `usedByARule: true` and a numeric `value` come first. Text-only items: check the key fact once.
- Batch by URL: fetch a source once and check all its items against it; re-fetch with a narrower question when the first answer is vague.
- Stop retrying a URL after 3 failures; record `could_not_open` and move on.

## Output
Write a JSON array to the output path given in your task, one object per item:
`{"ref": "...", "verdict": "...", "foundQuote": "verbatim text or empty", "correctValue": null or value, "note": "what differs / what you could not read", "urlUsed": "..."}`
Then reply with a short summary: counts per verdict, and every item that is not `confirmed`, with one line each.
