import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

import { parseVibeScript, typeCheckVibeScript } from './vibe';
import type { Prompt } from './resolve-prompt';

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

async function main() {
  const cwd = process.cwd();

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

  const color = (code: number) => (s: string) =>
    process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;

  const green = color(32);
  const red = color(31);

  ///

  for (const example of examples) {
    const contents = await fs.readFile(example.path, 'utf-8');

    const parsed = parseVibeScript(contents);

    if (!(parsed instanceof Error)) {
      const checked = typeCheckVibeScript(parsed);

      if (!(checked instanceof Error)) {
        console.log(`${example.file}: ${green('✓')}`);

        continue;
      }
    }

    console.log(`${example.file}: ${red('✗')}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
