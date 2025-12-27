// import { runKeypressMenu } from './menu';

// async function main() {
//   const result = await runKeypressMenu({
//     Foo: () => console.log('doing foo…'),
//     Jane: async () => console.log('doing jane…'),
//     Lorem: () => console.log('doing lorem…'),
//   } as const);

//   if (result instanceof Error) {
//     console.error('Error:', result.message);
//     process.exit(1);
//   }

//   const [key] = result;
//   console.log(`You selected: ${key}`);

//   process.exit(0);
// }

// main().catch(err => {
//   console.error(err);
//   process.exit(1);
// });

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import * as vibe from './vibe';

async function main() {
  // const promptName = 'test01';
  const promptName = 'test02';
  // const promptName = 'untitled';

  const promptsDir = path.join(process.cwd(), 'prompts');

  const untitledPrompt = path.join(promptsDir, `${promptName}.md`);

  const contents = await fs.readFile(untitledPrompt, 'utf-8');

  const parsed = vibe.parseVibeScript(contents);

  if (parsed instanceof Error) {
    console.error(parsed);

    process.exit(1);
  }

  // console.dir(parsed, { depth: null });

  const checked = vibe.typeCheckVibeScript(parsed);

  if (checked instanceof Error) {
    console.error(checked);

    process.exit(1);
  }

  console.dir(checked, { depth: null });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
