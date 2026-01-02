A wild thing you can do with this tool: **run a multi-model “tournament” (or courtroom debate) where different models produce competing artifacts, a separate judge step scores them in typed JSON, and then you use `maxBy(score)` + `from ...` to select the winner *without* another LLM call—then feed only the winner into a final polishing step.**

This leans on a combo you don’t usually get in simple prompt runners:

- **Per-step model/provider selection** (`model:` / `provider:`)
- **Typed outputs** (so scoring + selection is structured)
- **Runtime transforms without LLM calls** (`maxBy(...)` + `from ...`)
- **File includes** for “ground truth” context (style guide, code, spec)
- Optional: run once in **`mode: "output"`** to get placeholders and check the pipeline shape before spending tokens.

### Example: “Model Tournament + Judge + Winner Polish”

```md
<!-- let seed = floor(random() * 1000000) -->
<!-- let candidates = 2 -->

<!--
~ ~/your-project
  docs/style-guide.md
  docs/product-brief.md
-->

<!-- step: draftA; model: gemini-2.5-pro; expect: { "id": string, "draft": string } ; named a -->
You are writing a launch announcement. Use the style guide + product brief above.
Uniqueness seed: ${seed}
Return RAW JSON only:
{ "id": "A", "draft": "<markdown announcement>" }

<!-- step: draftB; model: o3-mini-2025-01-31; expect: { "id": string, "draft": string } ; named b -->
You are writing a launch announcement. Use the style guide + product brief above.
Uniqueness seed: ${seed}
Return RAW JSON only:
{ "id": "B", "draft": "<markdown announcement>" }

<!-- step: judge; thinking: medium; expect: { "id": string, "score": number, "why": string }[]; named scored -->
You are a harsh editor. Score each draft 0–10 on:
clarity, excitement, specificity, adherence to style guide.
Keep "why" to 1 sentence each.

Draft A:
${a.draft}

Draft B:
${b.draft}

Return RAW JSON only:
[
  { "id": "A", "score": 0, "why": "..." },
  { "id": "B", "score": 0, "why": "..." }
]

<!-- step: winner; expect: { "id": string, "score": number, "why": string }[]; maxBy(score); from scored; named win -->

<!-- step: final; thinking: high; expect: string -->
Take the winning id: ${win.id} with rationale: ${win.why}

Here are the drafts:
A:
${a.draft}

B:
${b.draft}

Produce the final announcement as markdown.
No preamble.
```

**Why this is “wild” in practice:** you’ve built a small, typed, multi-agent selection pipeline where *the selection logic is deterministic and local* (`maxBy`), while generation and judging can be split across different models (or providers) for diversity and robustness.

If you want to push it further, you can make a full bracket (A/B/C/D), have the judge return an array of scores, do `maxBy(score)`, then have a second judge do a “bias check” step, etc.—all still structured and composable.