import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { LLMCompleteChat, LLMModel } from './llm';
import { resolvePrompt } from './resolve-prompt';
import { parseVibeScript, typeCheckVibeScript } from './vibe';
import { execVibeScript, VibeScriptResult } from './vibe-machine';

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
    // onPrompt: info => {
    //   const title = info.name
    //     ? `Step ${info.stepIndex}: ${info.name}`
    //     : `Step ${info.stepIndex}`;

    //   console.log(`\n=== ${title} ===`);

    //   console.log(
    //     `expects: ${info.expectsTypeName} -> output: ${info.outputTypeName}`
    //   );

    //   if (info.outputName) {
    //     console.log(`assigns: ${info.outputName}`);
    //   }

    //   if (info.transforms && info.transforms.length > 0) {
    //     console.log(`transforms: ${JSON.stringify(info.transforms)}`);
    //   }

    //   console.log('--- prompt ---');

    //   process.stdout.write(
    //     info.prompt.endsWith('\n') ? info.prompt : `${info.prompt}\n`
    //   );

    //   console.log('--- end prompt ---');
    // },
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
