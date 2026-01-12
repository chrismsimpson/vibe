
### VibeScript as an LLM **contract-test + canary** system in CI

Already have the key ingredients:
- typed expectations (`expect: { ... }[]`)
- transforms (`maxBy`, `takeLast`)
- deterministic artifact logging in `run.ts` (`generations/...`)
- cost accounting + token estimation
- “output mode” placeholders (already implemented!) for dry runs

**Idea:** treat each `.md` as a *contract test* for an LLM capability you rely on, and run them nightly (or on model/provider upgrades). The pipeline:

1) **Generate** multiple candidate outputs (step `ideate`)
2) **Self-grade** with a stricter rubric model (step `score`)
3) **Select best** (`maxBy(score)`)
4) **Validate** parsing + URL liveness checks (you already have `typeCheckSlop(..., mode: 'liveness')` support)
5) Fail CI if:
   - output no longer parses into the expected type
   - URLs are dead (when enabled)
   - average score regresses
   - cost exceeds budget

This turns “LLM drift” into something you detect like normal regressions.

If you want, I can propose a *single additional surgical change* to make this even stronger: a built-in `seed(...)` function (or seeded PRNG) so your `random()`-driven scripts become reproducible in CI. But I didn’t include it above because you asked for the most minimal fix-set.
