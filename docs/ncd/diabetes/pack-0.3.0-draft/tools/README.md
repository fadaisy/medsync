# Builder

`python3 build/build.py --check` validates the pack and runs every vignette. `python3 build/build.py && python3 build/make_docs.py` rebuilds it into `tools/out/`.

- `build/k_refs.py`, `k_fixes.py`: the reference catalogue and the corrections from the source re-read
- `build/k_features.py`, `k_dx.py`, `k_strat.py`, `k_act.py`: the first draft of the content, by lane
- `build/k_review.py`: every change made in answer to the three reviews, tagged with the finding id
- `build/k_clerk.py`, `k_wire.py`: the clerking-desk and wiring proposals
- `build/k_vignettes.py`, `k_decisions.py`: the test patients and the decision list
- `build/build.py`: the validator and the reference evaluator (`run_vignette`)
- `research/`: the claims every citation is built from
- `verify/`, `review/`: the raw results of the re-read and the reviews, and the briefs the reviewers were given
