import readline from 'node:readline';

export type MenuHandler<R = void> = () => R | Promise<R>;
export type MenuSpec<R = void> = Record<string, MenuHandler<R>>;

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

// biome-ignore lint/suspicious/noConfusingVoidType: ¯\_(ツ)_/¯
type NormalizeVoid<T> = [T] extends [void] ? undefined : T;

type Choice<K extends string, R> = {
  digit: string; // "1".."9"
  key: K;
  run: MenuHandler<R>;
};

const toError = (err: unknown): Error => {
  if (err instanceof Error) return err;
  if (typeof err === 'string') return new Error(err);
  try {
    return new Error(JSON.stringify(err));
  } catch {
    return new Error(String(err));
  }
};

export async function runKeypressMenu<R, T extends MenuSpec<R>>(
  spec: T,
  opts: RunKeypressMenuOptions = {}
): Promise<[keyof T & string, NormalizeVoid<Awaited<R>>] | Error> {
  try {
    const stdout = opts.stdout ?? process.stdout;
    const stdin = opts.stdin ?? process.stdin;

    const keys = Object.keys(spec) as Array<keyof T & string>;
    if (keys.length === 0) return new Error('Menu spec is empty.');

    // single-keystroke digits => max 9 options
    if (keys.length > 9) {
      return new Error(
        `Too many options (${keys.length}). This menu supports up to 9 for single-key selection.`
      );
    }

    if (!stdin.isTTY) {
      return new Error(
        'stdin is not a TTY (raw key capture requires an interactive terminal)'
      );
    }
    if (typeof stdin.setRawMode !== 'function') {
      return new Error(
        'stdin.setRawMode is not available (expected a TTY stream)'
      );
    }

    const choices: Array<Choice<keyof T & string, R>> = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!key) return new Error('Unexpected empty key.');

      const run = spec[key];
      if (typeof run !== 'function') {
        return new Error(
          `Menu handler for "${key}" is missing or not a function.`
        );
      }

      choices.push({
        digit: String(i + 1),
        key,
        run,
      });
    }

    const digitToChoice = new Map<string, Choice<keyof T & string, R>>(
      choices.map(c => [c.digit, c])
    );

    const title = opts.title ?? 'Choose an option:';
    stdout.write(`${title}\n`);
    for (const c of choices) stdout.write(`  ${c.digit}) ${c.key}\n`);

    const promptPrefix = opts.promptPrefix ?? 'Press ';
    const promptSuffix = opts.promptSuffix ?? ': ';
    const digitsStr = choices.map(c => c.digit).join('/');
    stdout.write(`\n${promptPrefix}${digitsStr}${promptSuffix}`);

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    const cleanup = (onKeypress: (str: string, key: readline.Key) => void) => {
      try {
        stdin.setRawMode(false);
      } catch {
        // ignore
      }
      stdin.pause();
      stdin.removeListener('keypress', onKeypress);
    };

    return await new Promise<
      [keyof T & string, NormalizeVoid<Awaited<R>>] | Error
    >(resolve => {
      const finish = (
        value: [keyof T & string, NormalizeVoid<Awaited<R>>] | Error,
        onKeypress: (str: string, key: readline.Key) => void
      ) => {
        cleanup(onKeypress);
        resolve(value);
      };

      const onKeypress = (str: string, key: readline.Key) => {
        // Ctrl+C
        if (key.sequence === '\u0003') {
          stdout.write('\n');
          finish(new MenuInterruptedError(), onKeypress);
          return;
        }

        const choice = digitToChoice.get(str);
        if (!choice) return;

        // echo the keystroke on the same line as the prompt
        stdout.write(`${choice.digit}\n`);

        (async () => {
          try {
            if (opts.printSelectedLine ?? true) {
              stdout.write(`Selected: ${choice.key}\n`);
            }

            const raw = await choice.run();
            const value = raw as NormalizeVoid<Awaited<R>>; // runtime is already undefined for void
            finish([choice.key, value], onKeypress);
          } catch (err) {
            finish(toError(err), onKeypress);
          }
        })().catch(err => finish(toError(err), onKeypress));
      };

      stdin.on('keypress', onKeypress);
    });
  } catch (err) {
    return toError(err);
  }
}
