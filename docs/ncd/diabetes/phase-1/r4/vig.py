import json, r4lib
d = json.load(open(r4lib.PACK + "/vignettes/golden-vignettes.json"))
for v in d["vignettes"]:
    n = int(v["id"].split("-")[1])
    if n >= 61:
        r4lib.run(v["values"], v["site"], v["established"], v["ageBand"], label=v["id"] + " " + v["title"])
