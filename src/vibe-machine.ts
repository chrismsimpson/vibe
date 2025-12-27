import * as path from 'node:path';
import * as fsSync from 'node:fs';
import type {
  ChatCompletionMessage,
  LLMAccounting,
  LLMThinking,
  LLMTokenUsage,
} from './llm-base';
import type { LLMCompleteChat, LLMModel } from './llm';
import {
  type CheckedVibeScript,
  type CheckedVibeScriptExpression,
  type VibeScriptContext,
  type VibeScriptTransform,
  VibeScriptUnaryOperator,
  VibeScriptBinaryOperator,
  typeNameForTypeId,
  type CheckedVibeScriptBlock,
  parseVibeScript,
  typeCheckVibeScript,
} from './vibe';

export type VibeScriptRuntimeEnv = Record<string, unknown>;

export type VibeScriptStepResult = {
  name: string | null;
  expectsTypeId: number; // raw expects (what we parsed/validated)
  outputTypeId: number; // after transforms
  prompt: string;
  model: string;
  raw: string | null;
  value: unknown;
  accounting: LLMAccounting;
};

export type VibeScriptResult = {
  env: VibeScriptRuntimeEnv;
  messages: ChatCompletionMessage[];
  steps: VibeScriptStepResult[];
  accounting: LLMAccounting;
};

const getBuiltinTypeId = (
  context: VibeScriptContext,
  name: 'void' | 'boolean' | 'number' | 'string'
): number | Error => {
  for (let i = 0; i < context.types.length; i++) {
    const t = context.types[i];

    if (!t) {
      continue;
    }

    if (t.kind === 'builtin' && t.name === name) {
      return i;
    }
  }

  return new Error(`internal error: builtin type '${name}' not found`);
};

const runtimeToString = (value: unknown): string | Error => {
  if (value === null || value === undefined) {
    return '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return new Error('failed to stringify interpolation value');
  }
};

const parseOutputForTypeId = (
  context: VibeScriptContext,
  typeId: number,
  raw: string | null
): unknown | Error => {
  if (raw === null) {
    return new Error('llm returned null output');
  }

  ///

  const normalized = (() => {
    const start = '```json\n';
    const end = '\n```';

    if (raw.startsWith(start) && raw.endsWith(end)) {
      return raw.slice(start.length, raw.length - end.length);
    }

    return raw;
  })();

  ///

  const t = context.types[typeId];

  if (!t) {
    return new Error('unknown expected type id');
  }

  // For now: string is always “accept raw”.

  if (t.kind === 'builtin' && t.name === 'string') {
    return normalized;
  }

  if (t.kind === 'builtin' && t.name === 'void') {
    return null;
  }

  // For non-string: try to parse JSON, then do minimal shape checks.

  let parsed: unknown;

  try {
    parsed = JSON.parse(normalized);
  } catch {
    // Fallbacks for number/bool if model doesn't output strict JSON.
    if (t.kind === 'builtin' && t.name === 'number') {
      const n = Number(normalized.trim());

      if (Number.isNaN(n)) {
        return new Error(
          `expected '${typeNameForTypeId(context, typeId)}' output, but could not parse number`
        );
      }

      return n;
    }

    if (t.kind === 'builtin' && t.name === 'boolean') {
      const v = normalized.trim().toLowerCase();

      if (v === 'true') {
        return true;
      }

      if (v === 'false') {
        return false;
      }

      return new Error(
        `expected '${typeNameForTypeId(context, typeId)}' output, but could not parse boolean`
      );
    }

    return new Error(
      `expected '${typeNameForTypeId(context, typeId)}' output, but could not parse JSON`
    );
  }

  if (t.kind === 'builtin') {
    if (t.name === 'number') {
      if (typeof parsed !== 'number') {
        return new Error(
          `expected '${typeNameForTypeId(context, typeId)}', got '${typeof parsed}'`
        );
      }

      return parsed;
    }

    if (t.name === 'boolean') {
      if (typeof parsed !== 'boolean') {
        return new Error(
          `expected '${typeNameForTypeId(context, typeId)}', got '${typeof parsed}'`
        );
      }

      return parsed;
    }

    // string handled earlier, void handled earlier

    return parsed;
  }

  if (t.kind === 'array' || t.kind === 'tuple') {
    if (!Array.isArray(parsed)) {
      return new Error(
        `expected '${typeNameForTypeId(context, typeId)}', got non-array JSON`
      );
    }

    return parsed;
  }

  if (t.kind === 'object') {
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return new Error(
        `expected '${typeNameForTypeId(context, typeId)}', got non-object JSON`
      );
    }

    return parsed;
  }

  return parsed;
};

const takeLastRuntime = (
  value: unknown,
  count: number | null
): unknown | Error => {
  if (!Array.isArray(value)) {
    return new Error('takeLast transform expects an array value');
  }

  if (count === null) {
    if (value.length === 0) {
      return null;
    }

    return value[value.length - 1];
  }

  if (!Number.isInteger(count) || count < 0) {
    return new Error(`takeLast(N) requires integer N >= 0, got '${count}'`);
  }

  if (count === 0) {
    return [];
  }

  if (value.length <= count) {
    return value.slice(0);
  }

  return value.slice(value.length - count);
};

const maxByRuntime = (value: unknown, key: string): unknown | Error => {
  if (!Array.isArray(value)) {
    return new Error('maxBy transform expects an array value');
  }

  if (typeof key !== 'string' || key.length === 0) {
    return new Error('maxBy(key) requires a non-empty key');
  }

  if (value.length === 0) {
    return null;
  }

  let best: unknown = null;

  let bestScore = Number.NEGATIVE_INFINITY;

  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return new Error('maxBy expects an array of objects');
    }

    // biome-ignore lint/suspicious/noExplicitAny: runtime indexing
    const raw = (item as any)[key];

    const n = typeof raw === 'number' ? raw : Number(raw);

    if (Number.isNaN(n)) {
      return new Error(`maxBy(${key}) encountered non-numeric value`);
    }

    if (best === null || n > bestScore) {
      best = item;
      bestScore = n;
    }
  }

  return best;
};

const applyTransformsRuntime = (
  value: unknown,
  transforms: VibeScriptTransform[] | null
): unknown | Error => {
  let out: unknown = value;

  for (const tr of transforms ?? []) {
    if (tr.kind === 'takeLast') {
      const last = takeLastRuntime(out, tr.count);

      if (last instanceof Error) {
        return last;
      }

      out = last;

      continue;
    }

    if (tr.kind === 'maxBy') {
      const max = maxByRuntime(out, tr.key);

      if (max instanceof Error) {
        return max;
      }

      out = max;

      continue;
    }

    return new Error('unknown transform at runtime');
  }

  return out;
};

export type VibeScriptLogLevel = 'off' | 'log' | 'dir';

const evalExpression = (
  expr: CheckedVibeScriptExpression,
  env: VibeScriptRuntimeEnv,
  context: VibeScriptContext
): unknown | Error => {
  // literals

  if (expr.kind === 'boolean') {
    return expr.value;
  }

  if (expr.kind === 'number') {
    return expr.value;
  }

  if (expr.kind === 'string') {
    return expr.value;
  }

  // var

  if (expr.kind === 'var') {
    if (!(expr.name in env)) {
      return new Error(`variable '${expr.name}' not found at runtime`);
    }

    return env[expr.name];
  }

  // call

  if (expr.kind === 'call') {
    const args: unknown[] = [];

    for (const a of expr.args) {
      const result = evalExpression(a, env, context);

      if (result instanceof Error) {
        return result;
      }

      args.push(result);
    }

    if (expr.name === 'random') {
      if (args.length !== 0) {
        return new Error('random() takes 0 arguments');
      }

      return Math.random();
    }

    if (expr.name === 'floor') {
      if (args.length !== 1) {
        return new Error('floor(...) takes 1 argument');
      }

      const n = Number(args[0]);

      if (Number.isNaN(n)) {
        return new Error('floor(...) expects a number');
      }

      return Math.floor(n);
    }

    if (expr.name === 'ceil') {
      if (args.length !== 1) {
        return new Error('ceil(...) takes 1 argument');
      }

      const n = Number(args[0]);

      if (Number.isNaN(n)) {
        return new Error('ceil(...) expects a number');
      }

      return Math.ceil(n);
    }

    if (expr.name === 'round') {
      if (args.length !== 1) {
        return new Error('round(...) takes 1 argument');
      }

      const n = Number(args[0]);

      if (Number.isNaN(n)) {
        return new Error('round(...) expects a number');
      }

      return Math.round(n);
    }

    return new Error(`unknown function '${expr.name}' at runtime`);
  }

  // unary
  if (expr.kind === 'unary') {
    if (expr.operator === VibeScriptUnaryOperator.LogicalNot) {
      const v = evalExpression(expr.expr, env, context);

      if (v instanceof Error) {
        return v;
      }

      if (typeof v !== 'boolean') {
        return new Error('logical not used on non-boolean');
      }

      return !v;
    }

    // For now: only support ++/-- on variables

    if (expr.expr.kind !== 'var') {
      return new Error('++/-- only supported on variables at runtime');
    }

    const name = expr.expr.name;

    if (!(name in env)) {
      return new Error(`variable '${name}' not found at runtime`);
    }

    const current = Number(env[name]);

    if (Number.isNaN(current)) {
      return new Error(`variable '${name}' is not a number at runtime`);
    }

    if (expr.operator === VibeScriptUnaryOperator.PostIncrement) {
      env[name] = current + 1;

      return current;
    }

    if (expr.operator === VibeScriptUnaryOperator.PostDecrement) {
      env[name] = current - 1;

      return current;
    }

    if (expr.operator === VibeScriptUnaryOperator.PreIncrement) {
      env[name] = current + 1;

      return env[name];
    }

    if (expr.operator === VibeScriptUnaryOperator.PreDecrement) {
      env[name] = current - 1;

      return env[name];
    }

    return new Error('unknown unary operator at runtime');
  }

  // binary

  if (expr.kind === 'binary') {
    const op = expr.operator;

    // assignment needs special casing (LHS must be var, don’t eagerly coerce numbers, etc)

    if (op === VibeScriptBinaryOperator.Assign) {
      if (expr.lhs.kind !== 'var') {
        return new Error('left-hand side of assignment must be a var');
      }

      const rhs = evalExpression(expr.rhs, env, context);

      if (rhs instanceof Error) {
        return rhs;
      }

      env[expr.lhs.name] = rhs;

      return rhs;
    }

    const lhs = evalExpression(expr.lhs, env, context);

    if (lhs instanceof Error) {
      return lhs;
    }

    const rhs = evalExpression(expr.rhs, env, context);

    if (rhs instanceof Error) {
      return rhs;
    }

    if (
      op === VibeScriptBinaryOperator.Add ||
      op === VibeScriptBinaryOperator.Subtract ||
      op === VibeScriptBinaryOperator.Multiply ||
      op === VibeScriptBinaryOperator.Divide ||
      op === VibeScriptBinaryOperator.Modulo
    ) {
      const ln = Number(lhs);
      const rn = Number(rhs);

      if (Number.isNaN(ln) || Number.isNaN(rn)) {
        return new Error('arithmetic operator used on non-numbers');
      }

      if (op === VibeScriptBinaryOperator.Add) {
        return ln + rn;
      }

      if (op === VibeScriptBinaryOperator.Subtract) {
        return ln - rn;
      }

      if (op === VibeScriptBinaryOperator.Multiply) {
        return ln * rn;
      }

      if (op === VibeScriptBinaryOperator.Divide) {
        return ln / rn;
      }

      if (op === VibeScriptBinaryOperator.Modulo) {
        return ln % rn;
      }
    }

    if (
      op === VibeScriptBinaryOperator.LogicalAnd ||
      op === VibeScriptBinaryOperator.LogicalOr
    ) {
      if (typeof lhs !== 'boolean' || typeof rhs !== 'boolean') {
        return new Error('logical operator used on non-booleans');
      }

      if (op === VibeScriptBinaryOperator.LogicalAnd) {
        return lhs && rhs;
      }

      if (op === VibeScriptBinaryOperator.LogicalOr) {
        return lhs || rhs;
      }
    }

    if (op === VibeScriptBinaryOperator.Equal) {
      return lhs === rhs;
    }

    if (op === VibeScriptBinaryOperator.NotEqual) {
      return lhs !== rhs;
    }

    if (
      op === VibeScriptBinaryOperator.LessThan ||
      op === VibeScriptBinaryOperator.LessThanOrEqual ||
      op === VibeScriptBinaryOperator.GreaterThan ||
      op === VibeScriptBinaryOperator.GreaterThanOrEqual
    ) {
      // Prefer numeric compare when possible
      if (typeof lhs === 'number' && typeof rhs === 'number') {
        if (op === VibeScriptBinaryOperator.LessThan) {
          return lhs < rhs;
        }

        if (op === VibeScriptBinaryOperator.LessThanOrEqual) {
          return lhs <= rhs;
        }

        if (op === VibeScriptBinaryOperator.GreaterThan) {
          return lhs > rhs;
        }

        return lhs >= rhs;
      }

      if (typeof lhs === 'string' && typeof rhs === 'string') {
        if (op === VibeScriptBinaryOperator.LessThan) {
          return lhs < rhs;
        }

        if (op === VibeScriptBinaryOperator.LessThanOrEqual) {
          return lhs <= rhs;
        }

        if (op === VibeScriptBinaryOperator.GreaterThan) {
          return lhs > rhs;
        }

        return lhs >= rhs;
      }

      const ln = Number(lhs);
      const rn = Number(rhs);

      if (Number.isNaN(ln) || Number.isNaN(rn)) {
        return new Error('comparison operator used on incompatible values');
      }

      if (op === VibeScriptBinaryOperator.LessThan) {
        return ln < rn;
      }

      if (op === VibeScriptBinaryOperator.LessThanOrEqual) {
        return ln <= rn;
      }

      if (op === VibeScriptBinaryOperator.GreaterThan) {
        return ln > rn;
      }

      return ln >= rn;
    }

    return new Error('unsupported binary operator at runtime');
  }

  // unknown

  return new Error('unknown expression kind at runtime');
};

const renderFileIncludeBlock = (
  block: CheckedVibeScriptBlock
): string | Error => {
  if (block.kind !== 'file-include') {
    return new Error('internal error: expected file-include block');
  }

  let out = '';

  for (const file of block.files) {
    const resolvedFilePath = path.join(block.resolvedParent, file);

    let contents: string;

    try {
      contents = fsSync.readFileSync(resolvedFilePath, 'utf8');
    } catch {
      return new Error(
        `failed to read vibe script include file: ${resolvedFilePath}`
      );
    }

    const ext = path.extname(file);
    const base = path.basename(file);

    const lang = ext.length > 0 ? ext.slice(1) : base;

    const displayPath =
      file.startsWith('/') || file.startsWith('~') || file.startsWith('./')
        ? file
        : `./${file}`;

    out += `\n\`${displayPath}\`:\n\n`;
    out += `\`\`\`${lang}\n`;
    out += contents.endsWith('\n') ? contents : `${contents}\n`;
    out += '```\n';
  }

  out += '\n';

  return out;
};

const renderTextBlock = (
  block: CheckedVibeScriptBlock,
  env: VibeScriptRuntimeEnv,
  context: VibeScriptContext
): string | Error => {
  if (block.kind !== 'text') {
    return new Error('internal error: expected text block');
  }

  let out = '';

  for (const p of block.parts) {
    if (p.kind === 'quasis') {
      out += p.value;

      continue;
    }

    if (p.kind === 'expr') {
      const result = evalExpression(p.expr, env, context);

      if (result instanceof Error) {
        return result;
      }

      const s = runtimeToString(result);

      if (s instanceof Error) {
        return s;
      }

      out += s;

      continue;
    }

    return new Error('unknown text part at runtime');
  }

  return out;
};

export const execVibeScript = async ({
  script,
  completeChat,
  models,
  thinking,
  logLevel,
}: {
  script: CheckedVibeScript;
  completeChat: LLMCompleteChat;
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  thinking?: LLMThinking;
  logLevel?: VibeScriptLogLevel;
}): Promise<VibeScriptResult | Error> => {
  const env: VibeScriptRuntimeEnv = {};

  let messages: ChatCompletionMessage[] = [];

  const results: VibeScriptStepResult[] = [];

  const usesSteps = script.blocks.some(b => b.kind === 'step');

  const _logLevel: VibeScriptLogLevel = logLevel ?? 'off';

  const canWriteSameLine =
    typeof process !== 'undefined' &&
    // biome-ignore lint/suspicious/noExplicitAny: runtime feature detection
    typeof (process as any).stdout?.write === 'function';

  const writeSameLine = (text: string) => {
    if (canWriteSameLine) {
      // biome-ignore lint/suspicious/noExplicitAny: runtime feature detection
      (process as any).stdout.write(text);
      return;
    }

    console.log(text);
  };

  const endSameLine = (ok: boolean, cost: number) => {
    const green = '\x1b[32m';
    const red = '\x1b[31m';
    const reset = '\x1b[0m';

    const mark = ok ? `${green}✓${reset}` : `${red}✗${reset}`;

    if (canWriteSameLine) {
      writeSameLine(` ${mark} cost=${cost}\n`);
      return;
    }

    console.log(`${mark} cost=${cost}`);
  };

  const sumTokenUsage = (a: LLMTokenUsage, b: LLMTokenUsage): LLMTokenUsage => {
    return {
      inputTokens: a.inputTokens + b.inputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
      thinkingTokens: a.thinkingTokens + b.thinkingTokens,
      totalTokens: a.totalTokens + b.totalTokens,
      estimated: a.estimated || b.estimated,
    };
  };

  let totalAccounting: LLMAccounting = {
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: 0,
      estimated: false,
    },
    costUnits: 0,
  };

  const implicitStepExpectsTypeId = (() => {
    if (usesSteps) {
      return getBuiltinTypeId(script.context, 'string');
    }

    if (script.expectsTypeId !== null) {
      return script.expectsTypeId;
    }

    return getBuiltinTypeId(script.context, 'string');
  })();

  if (implicitStepExpectsTypeId instanceof Error) {
    return implicitStepExpectsTypeId;
  }

  const implicitStepOutputTypeId = (() => {
    if (usesSteps) {
      return implicitStepExpectsTypeId;
    }

    if (script.expectsOutputTypeId !== null) {
      return script.expectsOutputTypeId;
    }

    return implicitStepExpectsTypeId;
  })();

  const implicitStepTransforms = usesSteps
    ? null
    : (script.expectsTransforms ?? null);

  ///

  type CurrentStep = {
    name: string | null;
    expectsTypeId: number; // raw
    outputTypeId: number; // transformed
    transforms: VibeScriptTransform[] | null;
    outputName: string | null;
    inputName: string | null; // when set: do not call LLM; consume env[inputName] and apply transforms
    prompt: string;
  };

  let current: CurrentStep | null = null;

  const flushStep = async (): Promise<Error | null> => {
    if (!current) {
      return null;
    }

    const stepNameForLog = current.name || '<unnamed>';

    if (_logLevel !== 'off') {
      writeSameLine(`Step: ${stepNameForLog}`);
    }

    const zeroAccounting: LLMAccounting = {
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        totalTokens: 0,
        estimated: false,
      },
      costUnits: 0,
    };

    // Transform-only step (no LLM call)
    if (current.inputName !== null) {
      if (current.prompt.trim().length !== 0) {
        const stepErr = new Error(
          'step has `from ...` but also has prompt text (LLM should not fire)'
        );

        if (_logLevel !== 'off') {
          endSameLine(false, zeroAccounting.costUnits);
        }

        current = null;

        return stepErr;
      }

      if (!(current.inputName in env)) {
        const stepErr = new Error(
          `step input variable '${current.inputName}' not found`
        );

        if (_logLevel !== 'off') {
          endSameLine(false, zeroAccounting.costUnits);
        }

        current = null;

        return stepErr;
      }

      const base = env[current.inputName];

      const t = applyTransformsRuntime(base, current.transforms);

      const stepResult: VibeScriptStepResult = {
        name: current.name,
        expectsTypeId: current.expectsTypeId,
        outputTypeId: current.outputTypeId,
        prompt: current.prompt,
        model: 'transform',
        raw: null,
        value: t,
        accounting: zeroAccounting,
      };

      results.push(stepResult);

      if (_logLevel !== 'off') {
        endSameLine(!(t instanceof Error), zeroAccounting.costUnits);

        if (_logLevel === 'dir') {
          console.dir(stepResult.value, { depth: null });
        }
      }

      if (t instanceof Error) {
        return t;
      }

      if (current.outputName !== null) {
        if (current.outputName in env) {
          const stepErr = new Error(
            `redefinition of variable '${current.outputName}' at runtime`
          );

          current = null;

          return stepErr;
        }

        env[current.outputName] = t;
      }

      current = null;

      return null;
    }

    // Normal LLM step
    const prompt = current.prompt;

    if (prompt.trim().length === 0) {
      const stepErr = new Error('empty step prompt');

      if (_logLevel !== 'off') {
        endSameLine(false, 0);
      }

      current = null;

      return stepErr;
    }

    const nextMessages: ChatCompletionMessage[] = [
      ...messages,
      {
        role: 'user',
        content: prompt,
      },
    ];

    const completion = await completeChat({
      models,
      messages: nextMessages,
      thinking,
    });

    if (completion instanceof Error) {
      if (_logLevel !== 'off') {
        endSameLine(false, 0);
      }

      current = null;

      return completion;
    }

    const [model, raw, accounting] = completion;

    totalAccounting = {
      tokens: sumTokenUsage(totalAccounting.tokens, accounting.tokens),
      costUnits: totalAccounting.costUnits + accounting.costUnits,
    };

    const parsed = parseOutputForTypeId(
      script.context,
      current.expectsTypeId,
      raw
    );

    const t = applyTransformsRuntime(parsed, current.transforms);

    const stepResult: VibeScriptStepResult = {
      name: current.name,
      expectsTypeId: current.expectsTypeId,
      outputTypeId: current.outputTypeId,
      prompt,
      model,
      raw,
      value: t,
      accounting,
    };

    results.push(stepResult);

    const err =
      parsed instanceof Error ? parsed : t instanceof Error ? t : null;

    if (_logLevel !== 'off') {
      endSameLine(err === null, accounting.costUnits);

      if (_logLevel === 'dir') {
        console.dir(stepResult.value, { depth: null });
      }
    }

    if (err) {
      current = null;

      return err;
    }

    if (current.outputName !== null) {
      if (current.outputName in env) {
        const assignErr = new Error(
          `redefinition of variable '${current.outputName}' at runtime`
        );

        current = null;

        return assignErr;
      }

      env[current.outputName] = t;
    }

    messages = [
      ...nextMessages,
      {
        role: 'assistant',
        content: raw ?? '',
      },
    ];

    current = null;

    return null;
  };

  ///

  for (const b of script.blocks) {
    // ignore regular comments

    if (b.kind === 'comment') {
      continue;
    }

    // ignore top-level expects at runtime (it already influenced type checking / expectsTypeId)

    if (b.kind === 'preamble') {
      continue;
    }

    // var decl

    if (b.kind === 'varDecl') {
      const result = evalExpression(b.expression, env, script.context);

      if (result instanceof Error) {
        return result;
      }

      env[b.name] = result;

      continue;
    }

    // step boundary

    if (b.kind === 'step') {
      const flushErr = await flushStep();

      if (flushErr) {
        return flushErr;
      }

      current = {
        name: b.name,
        expectsTypeId: b.expectsTypeId,
        outputTypeId: b.outputTypeId,
        transforms: b.transforms ?? null,
        outputName: b.step.outputName ?? null,
        inputName: b.step.inputName ?? null,
        prompt: '',
      };

      continue;
    }

    // file includes

    if (b.kind === 'file-include') {
      if (!current) {
        current = {
          name: null,
          expectsTypeId: implicitStepExpectsTypeId,
          outputTypeId: implicitStepOutputTypeId,
          transforms: implicitStepTransforms,
          outputName: null,
          inputName: null,
          prompt: '',
        };
      }

      const text = renderFileIncludeBlock(b);

      if (text instanceof Error) {
        return text;
      }

      current.prompt += text;

      continue;
    }

    // text block belongs to “current step”; if none, it’s the implicit step

    if (b.kind === 'text') {
      if (!current) {
        current = {
          name: null,
          expectsTypeId: implicitStepExpectsTypeId,
          outputTypeId: implicitStepOutputTypeId,
          transforms: implicitStepTransforms,
          outputName: null,
          inputName: null,
          prompt: '',
        };
      }

      const text = renderTextBlock(b, env, script.context);

      if (text instanceof Error) {
        return text;
      }

      current.prompt += text;

      continue;
    }

    return new Error('unknown checked block kind at runtime');
  }

  ///

  const flush = await flushStep();

  if (flush instanceof Error) {
    return flush;
  }

  if (_logLevel !== 'off') {
    console.log(`Total cost: ${totalAccounting.costUnits}`);
  }

  return {
    env,
    messages,
    steps: results,
    accounting: totalAccounting,
  };
};

export const exec = async ({
  contents,
  completeChat,
  models,
  thinking,
  logLevel,
}: {
  contents: string;
  completeChat: LLMCompleteChat;
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  thinking?: LLMThinking;
  logLevel?: VibeScriptLogLevel;
}): Promise<VibeScriptResult | Error> => {
  const parsed = parseVibeScript(contents);

  if (parsed instanceof Error) {
    return parsed;
  }

  const checked = typeCheckVibeScript(parsed);

  if (checked instanceof Error) {
    return checked;
  }

  return execVibeScript({
    script: checked,
    completeChat,
    models,
    thinking,
    logLevel,
  });
};

export const markdownify = (result: VibeScriptResult): string => {
  const last = result.steps[result.steps.length - 1];

  if (!last) {
    return '';
  }

  const clampHeadingLevel = (level: number): number => {
    if (!Number.isFinite(level) || level <= 0) {
      return 1;
    }

    if (level > 6) {
      return 6;
    }

    return Math.floor(level);
  };

  const heading = (level: number, text: string): string => {
    const l = clampHeadingLevel(level);

    return `${'#'.repeat(l)} ${text}`;
  };

  const isStringArray = (value: unknown): value is string[] => {
    return Array.isArray(value) && value.every(v => typeof v === 'string');
  };

  const asMarkdownList = (items: string[]): string => {
    if (items.length === 0) {
      return '';
    }

    return items.map(i => `- ${i}`).join('\n');
  };

  const fallbackMarkdown = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }

    try {
      return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
    } catch {
      return String(value);
    }
  };

  const renderValue = (value: unknown, level: number): string => {
    if (value === null || value === undefined) {
      return '';
    }

    // string: output as-is (markdown)

    if (typeof value === 'string') {
      return value;
    }

    // array of strings: markdown list

    if (isStringArray(value)) {
      return asMarkdownList(value);
    }

    // object: recursively render

    if (typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;

      const lines: string[] = [];

      for (const k of Object.keys(obj)) {
        // biome-ignore lint/suspicious/noExplicitAny: runtime indexing
        const v = (obj as any)[k];

        // string field => heading: "# key: value"

        if (typeof v === 'string') {
          lines.push(heading(level, `${k}: ${v}`));

          lines.push('');

          continue;
        }

        // array of strings field => heading + list

        if (isStringArray(v)) {
          lines.push(heading(level, k));

          lines.push('');

          const list = asMarkdownList(v);

          if (list.length > 0) {
            lines.push(list);

            lines.push('');
          }

          continue;
        }

        // nested object field => heading + recurse

        if (v && typeof v === 'object' && !Array.isArray(v)) {
          lines.push(heading(level, k));

          lines.push('');

          const inner = renderValue(v, level + 1);

          if (inner.length > 0) {
            lines.push(inner);

            lines.push('');
          }

          continue;
        }

        // fallback: still give the key a heading, then dump something readable

        lines.push(heading(level, k));

        lines.push('');

        const fb = fallbackMarkdown(v);

        if (fb.length > 0) {
          lines.push(fb);

          lines.push('');
        }
      }

      return lines.join('\n').trimEnd();
    }

    // everything else

    return fallbackMarkdown(value);
  };

  return renderValue(last.value, 1);
};
