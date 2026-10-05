from h import *
build.validate(); build.check_neutral_proposals(); build.check_decisions()
v = build.check_vignettes()
g = build.k_grid.check(build.run_vignette, build.E)
print("grid", g)
print("errors", len(build.errors)); [print("E", e) for e in build.errors[:40]]
print("warnings", len(build.warnings)); [print("W", e) for e in build.warnings[:20]]
print(type(v), len(v) if hasattr(v,'__len__') else v)
