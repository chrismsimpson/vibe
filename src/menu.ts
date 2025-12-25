import readline from 'node:readline';

export type MenuHandler = () => void | Promise<void>;
export type MenuSpec = Record<string, MenuHandler>;

export type RunKeypressMenuOptions = {
  title?: string; // default: "Choose an option:"
  promptPrefix?: string; // default: "Press "
  promptSuffix?: string; // default: ": "
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  printSelectedLine?: boolean; // default: true
};

class MenuInterruptedError extends Error {
  public readonly code = 'SIGINT' as const;

  public constructor() {
    super('Interrupted');
  }
}

type Choice = {
  digit: string; // "1".."9"
  label: string;
  run: MenuHandler;
};

export async function runKeypressMenu<T extends MenuSpec>(
  spec: T,
  opts: RunKeypressMenuOptions = {}
): Promise<keyof T & string> {
  const stdout = opts.stdout ?? process.stdout;
  const stdin = opts.stdin ?? process.stdin;

  const entries = Object.entries(spec);
  if (entries.length === 0) throw new Error('Menu spec is empty.');

  // single-keystroke digits => max 9 options
  if (entries.length > 9) {
    throw new Error(
      `Too many options (${entries.length}). This menu supports up to 9 for single-key selection.`
    );
  }

  const choices: Choice[] = entries.map(([label, run], i) => ({
    digit: String(i + 1),
    label,
    run,
  }));

  const digitToChoice = new Map<string, Choice>(choices.map(c => [c.digit, c]));

  if (!stdin.isTTY) {
    throw new Error(
      'stdin is not a TTY (raw key capture requires an interactive terminal)'
    );
  }
  if (typeof (stdin as NodeJS.ReadStream).setRawMode !== 'function') {
    throw new Error(
      'stdin.setRawMode is not available (expected a TTY stream)'
    );
  }

  const title = opts.title ?? 'Choose an option:';
  stdout.write(`${title}\n`);
  for (const c of choices) stdout.write(`  ${c.digit}) ${c.label}\n`);

  const promptPrefix = opts.promptPrefix ?? 'Press ';
  const promptSuffix = opts.promptSuffix ?? ': ';
  const digitsStr = choices.map(c => c.digit).join('/');
  stdout.write(`\n${promptPrefix}${digitsStr}${promptSuffix}`);

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  const cleanup = (onKeypress: (str: string, key: readline.Key) => void) => {
    stdin.setRawMode(false);
    stdin.pause();
    stdin.removeListener('keypress', onKeypress);
  };

  return await new Promise((resolve, reject) => {
    const onKeypress = (str: string, key: readline.Key) => {
      // Ctrl+C
      if (key.sequence === '\u0003') {
        cleanup(onKeypress);
        stdout.write('\n');
        reject(new MenuInterruptedError());
        return;
      }

      const choice = digitToChoice.get(str);
      if (!choice) return;

      // echo the keystroke on the same line as the prompt
      stdout.write(`${choice.digit}\n`);

      (async () => {
        try {
          if (opts.printSelectedLine ?? true) {
            stdout.write(`Selected: ${choice.label}\n`);
          }

          await choice.run();

          cleanup(onKeypress);
          resolve(choice.label as keyof T & string);
        } catch (err) {
          cleanup(onKeypress);
          reject(err);
        }
      })().catch(reject);
    };

    stdin.on('keypress', onKeypress);
  });
}
