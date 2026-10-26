import sys, pdfplumber
src, dst = sys.argv[1], sys.argv[2]
with pdfplumber.open(src) as pdf, open(dst, "w") as f:
    for i, p in enumerate(pdf.pages):
        f.write(f"\n=====PAGE {i+1}=====\n")
        f.write(p.extract_text() or "")
