import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { LLMCompleteChat, LLMModel } from './genai';
import { resolvePrompt } from './resolve-prompt';
import { parseVibeScript, typeCheckVibeScript } from './vibe';
import { execVibeScript } from './vibe-machine';

async function main(arg?: string) {
  const prompt = resolvePrompt(arg);

  ///

  const promptName = path.basename(prompt.file, '.md');

  const contents = await fs.readFile(prompt.path, 'utf-8');

  const parsed = parseVibeScript(contents);

  if (parsed instanceof Error) {
    return parsed;
  }

  const checked = typeCheckVibeScript(parsed);

  if (checked instanceof Error) {
    return checked;
  }

  const shouldNeverRun: LLMCompleteChat = async () => {
    return new Error('completeChat() called in output mode (bug)');
  };

  const result = await execVibeScript({
    script: checked,
    completeChat: shouldNeverRun,
    models: [] as LLMModel[],
    mode: 'output',
    logLevel: 'off',
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
