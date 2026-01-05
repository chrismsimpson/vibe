import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

import { exec, markdownifyStep } from './vibe-machine';
import { completeChat } from './genai-env';

import { resolvePrompt } from './resolve-prompt';

import { Agent, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(
  new Agent({
    // handshake/DNS/TLS
    connect: { timeout: 120_000 }, // 120s
    // wait for first byte of headers
    headersTimeout: 600_000, // 10 min
    // time between body chunks
    bodyTimeout: 900_000, // 15 min
  })
);

const LOG_LEVEL: 'log' = 'log';

async function main(arg?: string) {
  const prompt = resolvePrompt(arg);

  const generationsDir = path.join(process.cwd(), 'generations');

  const now = new Date();

  const startedAt = now
    .toLocaleString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
    .replace(/,/g, '');

  console.log(`Started at: ${startedAt}\n`);

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

  const promptName = path.basename(prompt.file, '.md');

  const contents = await fs.readFile(prompt.path, 'utf-8');

  const modelForFile = (model: string): string => {
    return (model ?? 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_');
  };

  const responsePath = path.join(generationsDir, 'response.md');

  fsSync.writeFileSync(responsePath, '');

  const result = await exec({
    contents,
    completeChat,
    logLevel: LOG_LEVEL,
    onStepStart: async ({ index, totalSteps, prompt }) => {
      const stepSuffix = totalSteps > 1 ? `-${index + 1}` : '';

      const userPromptFilename = `userPrompt-${stamp}-${promptName}${stepSuffix}.md`;

      fsSync.writeFileSync(
        path.join(generationsSubDir, userPromptFilename),
        prompt
      );

      // maintain latest current prompt link

      fsSync.writeFileSync(path.join(generationsDir, 'userPrompt.md'), prompt);

      return null;
    },
    onStepResult: async ({ index, totalSteps, result }) => {
      const stepSuffix = totalSteps > 1 ? `-${index + 1}` : '';

      const _modelForFile = modelForFile(result.model);

      const responseFilename = `response-${stamp}-${promptName}${stepSuffix}-${_modelForFile}.md`;

      const response = result.raw ?? '';

      fsSync.writeFileSync(
        path.join(generationsSubDir, responseFilename),
        response
      );

      // maintain latest current response link

      fsSync.writeFileSync(responsePath, response);

      return null;
    },
  });

  if (result instanceof Error) {
    console.error('Error during execution:');

    console.error(result);

    process.exit(1);
  }

  if (result.steps.length === 0) {
    console.log('Vibe script executed but produced no steps');

    return;
  }

  const lastStep = result.steps[result.steps.length - 1];

  if (lastStep) {
    const markdown = markdownifyStep(lastStep);

    const firstLine = (() => {
      const i = markdown.indexOf('\n');
      return i === -1 ? markdown : markdown.slice(0, i);
    })();

    const truncate = (s: string, max = 20) =>
      s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;

    const diff = Date.now() - now.getTime();
    const diffSeconds = Math.floor(diff / 1000);

    if (diffSeconds > 90) {
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffRemainingSeconds = diffSeconds % 60;

      console.log(
        `\nCompletion time: ${diffMinutes}m ${diffRemainingSeconds}s`
      );
    } else {
      console.log(`\nCompletion time: ${diffSeconds} seconds`);
    }

    console.log('\nOutput:');

    console.log(truncate(firstLine, 30));
  }
}

main(process.argv[2]).catch(err => {
  console.error(err);
  process.exit(1);
});
