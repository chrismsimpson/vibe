# Vibe 🌊

**Vibe** is a simple scripting language that turns regular Markdown files into powerful, multi-step AI workflows.

If you've ever felt frustrated trying to get ChatGPT to output *exactly* a JSON list, or wanted to string multiple AI tasks together without writing complex Python scripts, Vibe is for you.

---

### What is it?
It's a Turing-complete superset of Markdown (provided here via a command-line tool, but the code could be shipped in anything - a React app for example). The sytax is standard Markdown files (`.md`) with additional runtime abilities tucked neatly inside the existing comment syntax of Markdown (so `<!-- ... -->`). Vibe uses these comments to inject logic, chain prompts together, swap out AI models (OpenAI or Gemini), and force the AI to return exactly the data format you ask for.

### Why might you want to use it?
* **Guaranteed Formats:** Tell Vibe `<!-- expect: { "name": string }[] -->` and it will automatically parse the AI's "slop" (rambling text) and extract exactly the structured data you need. 
* **Multi-Step Pipelines:** Chain prompts together. Step 1 can brainstorm 10 ideas. Step 2 can score them. Step 3 can pick the highest score and expand on it.
* **Math & Randomness:** Embed simple logic right in your prompt. Randomize the number of ideas you want, pick a random word from a list, or calculate parameters before the AI even sees the prompt.
* **Multi-modal & File Includes:** Easily drop local images (`<!-- ~/image.jpg -->`) or code files into your prompt with a single line.
* **Cost Tracking:** Automatically tracks your token usage and calculates exactly how many fractions of a cent your workflow cost to run.

---

### How to use it

You write a Markdown file using Vibe's special comments. 

#### Example 1: A simple, randomized prompt
```md
<!-- let maxWords = 2 + floor(random() * 3) -->
<!-- expect: string[]; thinking: off -->

Generate 5 entirely unique, non-existent band names. 
They must be a maximum of ${maxWords} words. 
Do not write anything else, just return the list.
```

#### Example 2: A multi-step pipeline
```md
<!-- step: ideate; expect: { "title": string, "hook": string }[] -->
Generate 5 original song ideas. Return as JSON.

<!-- step: score; expect: { "title": string, "score": number }[]; from ideate -->
You are a brutally honest A&R. Score each idea from 0-10.

<!-- step: pickBest; from score; maxBy("score"); named best -->

<!-- step: final_output -->
Take this winning idea: ${best}
Write a 3-paragraph press release for this song.
```

#### Running your script
Assuming you have your API keys set (`OPENAI_API_KEY`, `GEMINI_API_KEY`), simply pass your Markdown file to the Vibe engine:

```bash
node run.js path/to/your-script.md
```

Vibe will evaluate your math, ping the AI models, pass the data between steps, format the output, and log your total cost at the very end.