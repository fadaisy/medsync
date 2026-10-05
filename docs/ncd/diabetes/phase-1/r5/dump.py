import sys, json; ARGS=sys.argv[1:]
import r5lib
from r5lib import IDX
def pp(p): return f"{p['feature']} {p['op']} {p.get('value','')}"
def pc(c, ind="    "):
    out=[f"{ind}[{c.get('id')}] {c.get('label')}"]
    if c.get('all'): out.append(ind+"  ALL: "+" & ".join(pp(p) for p in c['all']))
    if c.get('any'): out.append(ind+"  ANY: "+" | ".join(pp(p) for p in c['any']))
    if c.get('atLeast'): out.append(ind+f"  ATLEAST {c['atLeast']['n']}: "+" | ".join(pp(p) for p in c['atLeast']['of']))
    return "\n".join(out)
for i in ARGS:
    k,it=IDX[i]; x=it['x']
    print(f"\n## {i} ({k}) urg={it.get('urgency') or x.get('urgency')} runWhen={x.get('runWhen')} ages={x.get('ages')} ageBands={it.get('ageBands')} enabled={x.get('enabled')} kind={x.get('kind')} preg={x.get('appliesTo')} cap={x.get('requiresCapability')} review={x.get('review')}")
    print("  display:", it.get('display'))
    print(pc(it['when']))
    for n in x.get('notWhen',[]): print("  NOTWHEN"); print(pc(n,"      "))
    for n in it.get('contraindications',[]): print("  CONTRA"); print(pc(n,"      "))
    for n in x.get('cautions',[]): print("  CAUTION"); print(pc(n,"      "))
    if x.get('needsBeforeActing'): print("  needs:", [g['feature'] for g in x['needsBeforeActing']])
    if it.get('ref_id') or it['when'].get('ref_id'): print("  ref:", it['when'].get('ref_id'))
    if x.get('proposal'): print("  proposal:", x['proposal'], x.get('neutralProposal'))
    if it.get('notes') or x.get('note'): print("  notes:", (it.get('notes') or x.get('note'))[:400])
