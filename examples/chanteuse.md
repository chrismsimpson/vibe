<!-- let candidates = 7 -->
<!-- let maxWords = 2 + floor(random() * 3) -->
<!-- let seed = floor(random() * 1000000) -->
<!-- let minBpm = 78 + floor(random() * 16) -->
<!-- let maxBpm = minBpm + 36 -->

<!-- step: ideate; expect: { "title": string, "bpm": number, "key": string, "time": string, "hook": string, "palette": string, "twist": string }[]; named ideas -->
You are a producer-songwriter (ambient / IDM adjacent, but with an emotional hook).
Generate ${candidates} ORIGINAL song ideas.

Constraints:
- Title Case, max ${maxWords} words
- BPM between ${minBpm} and ${maxBpm}
- Key as string like "D minor" or "F# mixolydian"
- Time signature as string like "4/4", "7/8"
- hook: 1 sentence describing the core musical hook
- palette: 1 sentence describing the sound palette (instruments / synths / textures)
- twist: 1 sentence describing the unexpected element that makes it memorable

Use this uniqueness seed: ${seed}

Return RAW JSON only: an array of objects with keys exactly:
{ "title": string, "bpm": number, "key": string, "time": string, "hook": string, "palette": string, "twist": string }

<!-- step: score; expect: { "title": string, "bpm": number, "key": string, "time": string, "hook": string, "palette": string, "twist": string, "score": number, "reason": string }[]; named scored -->
You are a brutally honest A&R plus mix engineer.
Score each idea 0–10 based on: originality, emotional impact, producibility.
Keep "reason" to 1 sentence.

Here are the ideas (JSON): ${ideas}

Return RAW JSON only: an array of objects (one per idea), with keys exactly:
{ "title": string, "bpm": number, "key": string, "time": string, "hook": string, "palette": string, "twist": string, "score": number, "reason": string }

<!-- step: pickBest; expect: { "title": string, "bpm": number, "key": string, "time": string, "hook": string, "palette": string, "twist": string, "score": number, "reason": string }[]; maxBy(score); from scored; named best -->

<!-- step: blueprint; expect: { "title": string, "bpm": number, "key": string, "time": string, "logline": string, "sections": string[], "chords": string[], "leadMotifDegrees": string[], "drumPlan": string[], "lyrics": string[], "mixNotes": string[] } -->
Take this winning idea (JSON): ${best}

Write a DAW-ready blueprint for a 2–3 minute track.

Rules:
- "sections": array of section labels with bar ranges (e.g. "Intro (bars 1-8)", "Drop (bars 17-32)")
- "chords": array of chord symbols in order (8–16 chords total)
- "leadMotifDegrees": array of scale-degree tokens for an 8-bar motif (e.g. "1", "b3", "4", "5", "6", "5", "4", "1")
- "drumPlan": array of concise production directives (kick/snare/hat patterns, swing, fills)
- "lyrics": exactly 4 lines, sparse and evocative, fitting the title
- "mixNotes": array of mixing/sound-design notes (space, saturation, reverb, automation)

Return RAW JSON only, exactly matching:
{ "title": string, "bpm": number, "key": string, "time": string, "logline": string, "sections": string[], "chords": string[], "leadMotifDegrees": string[], "drumPlan": string[], "lyrics": string[], "mixNotes": string[] }