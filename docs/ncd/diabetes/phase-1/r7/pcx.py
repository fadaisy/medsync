from base import *
import json, sys
def pc(c):
    out=[]
    for k in ("all","any"):
        if c.get(k): out.append(k+":"+", ".join(f"{p['feature']}{p['op']}{p.get('value','')}" for p in c[k]))
    if c.get("atLeast"): out.append(f"atLeast{c['atLeast']['n']}:"+", ".join(f"{p['feature']}{p['op']}{p.get('value','')}" for p in c["atLeast"]["of"]))
    return " | ".join(out)
