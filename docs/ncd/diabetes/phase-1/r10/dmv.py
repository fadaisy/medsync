from h import *
import k_vignettes, json
VS={v["id"]:v for v in k_vignettes.VIGNETTES}
for i in ["DMV-26","DMV-28","DMV-128","DMV-133","DMV-136","DMV-137","DMV-138","DMV-139","DMV-140","DMV-141"]:
    v=VS[i]; print("\n=====",i,v.get("title") or v.get("name"),"site",v["site"],"est",v["established"],"band",v["ageBand"])
    print(" values:",json.dumps(v["values"]))
    print(" expect:",json.dumps(v["expect"]))
    r=build.run_vignette(v)
    print(" fired:",{k:r["urgency"].get(k,r["fired"][k]) for k in r["fired"]}, "interrupt", r["interrupt"])
    print(" targets",r["targets"],"bands",r["bands"],"gaps",r["gaps"],"caveats",r["caveats"],"risk",r["risk"], "override", r.get("actionOverride"))
