import sys, html, re
t = open(sys.argv[1], encoding="utf-8").read()
t = re.sub(r"(?s)<(script|style).*?</\1>", "", t)
t = re.sub(r"</(tr|p|h\d|li|caption|div)>", "\n", t)
t = re.sub(r"</t[dh]>", " | ", t)
t = re.sub(r"<[^>]+>", "", t)
t = html.unescape(t)
print(re.sub(r"\n\s*\n+", "\n", t))
