import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

import type { LLMCompleteChat, LLMModel } from './genai';
import { resolvePrompt } from './resolve-prompt';
import { parseVibeScript, typeCheckVibeScript } from './vibe';
import { execVibeScript } from './vibe-machine';

async function main(arg?: string) {
  const prompt = resolvePrompt(arg);

  ///

  const generationsDir = path.join(process.cwd(), 'generations');

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

  const promptName = path.basename(prompt.file, '.md');

  const contents = await fs.readFile(prompt.path, 'utf-8');

  const parsed = parseVibeScript(contents);

  if (parsed instanceof Error) {
    console.error(parsed.message);

    process.exit(1);

    return;
  }

  const checked = typeCheckVibeScript(parsed);

  if (checked instanceof Error) {
    console.error(checked.message);

    process.exit(1);

    return;
  }

  const shouldNeverRun: LLMCompleteChat = async () => {
    return new Error('completeChat() called in output mode (bug)');
  };

  const noModels: LLMModel[] = [];

  const result = await execVibeScript({
    script: checked,
    completeChat: shouldNeverRun,
    models: noModels,
    mode: 'output',
    logLevel: 'off',
    onStepStart: async ({ index, totalSteps, prompt: stepPrompt }) => {
      const stepSuffix = totalSteps > 1 ? `-${index + 1}` : '';

      const userPromptFilename = `userPrompt-${stamp}-${promptName}${stepSuffix}.md`;

      fsSync.writeFileSync(
        path.join(generationsSubDir, userPromptFilename),
        stepPrompt,
        'utf8'
      );

      // maintain latest current prompt link

      fsSync.writeFileSync(
        path.join(generationsDir, 'userPrompt.md'),
        stepPrompt,
        'utf8'
      );

      return null;
    },
  });

  if (result instanceof Error) {
    console.error(result.message);

    process.exit(1);

    return;
  }

  console.log(`Output '${promptName}':`);

  for (const step of result.steps) {
    console.log(step.prompt);
  }
}

main(process.argv[2]).catch(err => {
  console.error(err);
  process.exit(1);
});
