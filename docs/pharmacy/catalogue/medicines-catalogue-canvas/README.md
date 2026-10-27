# Medicines Catalogue and Stocking: canvas export

Reference for PROMPT-PHARMACY-CATALOGUE.md. Brands are demo brands, registration numbers are placeholders, barcodes are GS1 example numbers, and prices and counts are examples. Boards 11 to 15 share one consistent set of numbers; use them as the test fixture. Do not paste this markup into the app.

| File | Board |
|---|---|
| Main.dc.html | 0 Read me |
| Receive.dc.html | 1 Count a delivery: scan, pick or type |
| Pick.dc.html | 2 Pick from the catalogue |
| NewBarcode.dc.html | 3 A new barcode |
| Manual.dc.html | 4 Not in the catalogue |
| Medicine.dc.html | 5 A medicine |
| Prices.dc.html | 6 Products and prices |
| Import.dc.html | 7 Import a spreadsheet |
| Curate.dc.html | 8 MedSync catalogue team |
| Bill.dc.html | 9 The patient's bill (later slice) |
| StockMap.dc.html | 10 Every place that holds medicines |
| Requisition.dc.html | 11 Issue a requisition, picked by scan |
| Confirm.dc.html | 12 The ward confirms arrival (phone) |
| Ward.dc.html | 13 A ward's stock: counted use against charted doses |
| Cart.dc.html | 14 Check and restock an emergency cart |
| Trace.dc.html | 15 Follow one medicine |
| ws.css, rx.css, rx2.css, rx3.css | Desk styles; rx3.css holds the pieces new here |
| ds/medsync-tide/tokens.json | MedSync Tide tokens |

Each .dc.html loads ./support.js, which only the design canvas provides; read them as source.
