def pp(p): return f"{p['feature']} {p['op']} {p.get('value','')}".strip()
def pc(c):
    s=[]
    if c.get('all'): s.append('ALL['+'; '.join(pp(p) for p in c['all'])+']')
    if c.get('any'): s.append('ANY['+'; '.join(pp(p) for p in c['any'])+']')
    if c.get('atLeast'): s.append(f"ATLEAST{c['atLeast']['n']}["+'; '.join(pp(p) for p in c['atLeast']['of'])+']')
    return ' & '.join(s)
