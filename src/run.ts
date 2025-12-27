import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

import { exec, markdownify } from './vibe-machine';
import { completeChat } from './llm-env';

async function main(arg?: string) {
  const cwd = process.cwd();

  const promptsDir = path.join(cwd, 'prompts');

  const generationsDir = path.join(cwd, 'generations');

  const promptFiles = fsSync.existsSync(promptsDir)
    ? fsSync.readdirSync(promptsDir).filter(f => f.endsWith('.md'))
    : [];

  type Prompt = {
    file: string;
    path: string;
    mtime: Date;
    mtimeMs: number;
    size: number;
  };

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

  let prompt: Prompt | null = null;

  if (arg) {
    const file = `${arg}.md`;

    const matches = prompts.filter(p => p.file === file);

    if (!matches || matches.length === 0) {
      console.error(`Prompt "${arg}" does not exist in ${promptsDir}`);

      process.exit(1);
    }

    prompt = matches[0] ?? null;
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
    console.log(`No prompt specified, running '${prompt.file}'`);
  }

  ///

  const now = new Date();

  const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

  const fullYear = now.getFullYear();
  const year = pad(fullYear % 100);
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  const stamp = `${year}-${month}-${day}-${hours}${minutes}${seconds}`;

  const generationsSubDir = path.join(
    generationsDir,
    fullYear.toString(),
    month,
    day
  );

  const ensureDirSync = (dir: string) => {
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
    }
  };

  ensureDirSync(generationsDir);
  ensureDirSync(generationsSubDir);

  ///

  // first read the raw script

  const contents = await fs.readFile(prompt.path, 'utf-8');

  const result = await exec({
    contents,
    completeChat,
    // models: 'gpt-5.2',
    // thinking: 'off',

    // models: 'gemini-3-pro-preview',
    // thinking: 'low',

    models: 'gpt-4o-mini-2024-07-18',
    thinking: 'off',

    logLevel: 'log',
    // logLevel: 'dir',
  });

  if (result instanceof Error) {
    console.error('Error during execution:');

    console.error(result);

    process.exit(1);
  }

  const lastStep = result.steps[result.steps.length - 1] ?? null;

  const userPromptText = lastStep?.prompt ?? '';

  const markdown = markdownify(result);

  const modelForFile = (lastStep?.model ?? 'unknown').replace(
    /[^a-zA-Z0-9._-]+/g,
    '_'
  );

  fsSync.writeFileSync(
    path.join(generationsDir, 'userPrompt.md'),
    userPromptText
  );
  fsSync.writeFileSync(path.join(generationsDir, 'response.md'), markdown);

  fsSync.writeFileSync(
    path.join(generationsSubDir, `userPrompt-${stamp}.md`),
    userPromptText
  );

  fsSync.writeFileSync(
    path.join(generationsSubDir, `response-${stamp}-${modelForFile}.md`),
    markdown
  );

  const firstLine = (() => {
    const i = markdown.indexOf('\n');
    return i === -1 ? markdown : markdown.slice(0, i);
  })();

  const truncate = (s: string, max = 20) =>
    s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;

  console.log('\nOutput:');

  console.log(truncate(firstLine, 30));
}

main(process.argv[2]).catch(err => {
  console.error(err);
  process.exit(1);
});
