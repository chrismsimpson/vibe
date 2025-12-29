import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { resolvePrompt } from './resolve-prompt';
import { parseVibeScript } from './vibe';

async function main(arg?: string) {
  const prompt = resolvePrompt(arg);

  ///

  const promptName = path.basename(prompt.file, '.md');

  const contents = await fs.readFile(prompt.path, 'utf-8');

  const parsed = parseVibeScript(contents);

  if (parsed instanceof Error) {
    return parsed;
  }

  console.log(`Parsed '${promptName}':`);

  console.dir(parsed, { depth: null });
}

main(process.argv[2]).catch(err => {
  console.error(err);
  process.exit(1);
});
