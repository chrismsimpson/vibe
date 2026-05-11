import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

import { computeCostUsd, type LLMCompleteChat, type LLMModel } from './genai';
import { estimateTokensForText } from './genai-base';
import { resolvePrompt } from './resolve-prompt';
import { parseVibeScript, typeCheckVibeScript } from './vibe';
import { execVibeScript } from './vibe-machine';

const COUNT_ESTIMATE_MODEL: LLMModel = 'gpt-5.4';

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
    return new Error('completeChat() called in count mode (bug)');
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

  console.log(`Count '${promptName}':`);

  if (result.steps.length === 0) {
    console.log('No steps rendered');
    console.log('\nTotal estimated tokens: 0');
    console.log(
      `Total estimated input cost (${COUNT_ESTIMATE_MODEL}): $0.000000`
    );

    return;
  }

  let totalEstimatedTokens = 0;

  let totalEstimatedInputCostUsd = 0;

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];

    if (!step) {
      continue;
    }

    const estimatedTokens = estimateTokensForText(step.prompt);

    totalEstimatedTokens += estimatedTokens;

    const estimatedCost = computeCostUsd({
      model: COUNT_ESTIMATE_MODEL,
      usage: {
        inputTokens: estimatedTokens,
        outputTokens: 0,
        thinkingTokens: 0,
      },
    });

    totalEstimatedInputCostUsd += estimatedCost.totalUsd;

    const stepLabel =
      result.steps.length > 1
        ? `Step ${i + 1}${step.name ? ` (${step.name})` : ''}`
        : 'Step';

    console.log(`\n${stepLabel}:`);
    // console.log(step.prompt);
    console.log(`Estimated tokens: ${estimatedTokens}`);
    console.log(
      `Estimated input cost (${COUNT_ESTIMATE_MODEL}): $${estimatedCost.totalUsd.toFixed(6)}`
    );
  }

  console.log(`\nTotal estimated tokens: ${totalEstimatedTokens}`);
  console.log(
    `Total estimated input cost (${COUNT_ESTIMATE_MODEL}): $${totalEstimatedInputCostUsd.toFixed(6)}`
  );
}

main(process.argv[2]).catch(err => {
  console.error(err);
  process.exit(1);
});
