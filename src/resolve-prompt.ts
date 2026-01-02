import * as fsSync from 'node:fs';
import * as path from 'node:path';

export type Prompt = {
  file: string;
  path: string;
  mtime: Date;
  mtimeMs: number;
  size: number;
};

export const resolvePrompt = (arg?: string) => {
  const cwd = process.cwd();

  ///

  const promptsDir = path.join(cwd, 'prompts');

  const promptFiles = fsSync.existsSync(promptsDir)
    ? fsSync.readdirSync(promptsDir).filter(f => f.endsWith('.md'))
    : [];

  const prompts = promptFiles
    .map(file => {
      const fullPath = path.join(promptsDir, file);

      const st = fsSync.statSync(fullPath);

      return {
        file,
        path: fullPath,
        mtime: st.mtime,
        mtimeMs: st.mtimeMs,
        size: st.size,
      } satisfies Prompt;
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  ///

  const examplesDir = path.join(cwd, 'examples');

  const exampleFiles = fsSync.existsSync(examplesDir)
    ? fsSync.readdirSync(examplesDir).filter(f => f.endsWith('.md'))
    : [];

  const examples = exampleFiles
    .map(file => {
      const fullPath = path.join(examplesDir, file);

      const st = fsSync.statSync(fullPath);

      return {
        file,
        path: fullPath,
        mtime: st.mtime,
        mtimeMs: st.mtimeMs,
        size: st.size,
      } satisfies Prompt;
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  ///

  let prompt: Prompt | null = null;

  if (arg) {
    const file = arg.endsWith('.md') ? arg : `${arg}.md`;

    const promptMatches = prompts.filter(p => p.file === file);

    const exampleMatches = examples.filter(e => e.file === file);

    if (
      (!promptMatches || promptMatches.length === 0) &&
      (!exampleMatches || exampleMatches.length === 0)
    ) {
      console.error(`Prompt "${arg}" does not exist in ${promptsDir}`);

      process.exit(1);
    }

    prompt = promptMatches[0] || exampleMatches[0] || null;
  }

  if (!prompt && prompts.length === 0) {
    console.error(`No prompts found in ${promptsDir}`);

    process.exit(1);
  }

  let usingMostRecent = false;

  if (!prompt) {
    usingMostRecent = true;

    prompt = prompts[0] ?? null;
  }

  if (!prompt) {
    console.error('Unexpected error: prompt is null');

    process.exit(1);
  }

  if (usingMostRecent) {
    console.log(`No prompt specified, running '${prompt.file}'\n`);
  }

  return prompt;
};
