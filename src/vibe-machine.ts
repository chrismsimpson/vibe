import * as path from 'node:path';
import * as fsSync from 'node:fs';
import {
  type ChatCompletionMessage,
  type LLMAccounting,
  type LLMThinking,
  type LLMTokenUsage,
  estimateTokensForMessages,
} from './llm-base';
import {
  type LLMCompleteChat,
  type LLMModel,
  type LLMProvider,
  inferProviderForModel,
  getModel,
  computeCostUnits,
} from './llm';
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
  StringTypeId,
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

export type VibeScriptExecMode = 'run' | 'output';

const placeholderForTypeId = (
  context: VibeScriptContext,
  typeId: number,
  label: string
): unknown => {
  const t = context.types[typeId];

  if (!t) {
    return `<${label}: unknown>`;
  }

  if (t.kind === 'builtin') {
    if (t.name === 'string') return `<${label}: string>`;
    if (t.name === 'number') return 0;
    if (t.name === 'boolean') return false;
    if (t.name === 'void') return null;
    return `<${label}: ${t.name}>`;
  }

  if (t.kind === 'array' || t.kind === 'tuple') {
    return [];
  }

  if (t.kind === 'object') {
    return {};
  }

  // unknown / anything else

  return `<${label}: ${typeNameForTypeId(context, typeId)}>`;
};

const placeholderToAssistantContent = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);

  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
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

type MarkdownCodeBlock = {
  lang: string | null;
  content: string;
};

const stripSingleOuterCodeBlock = (raw: string): MarkdownCodeBlock | null => {
  const trimmed = raw.trim();

  // whole response is exactly one fenced block

  const m = trimmed.match(
    /^```([a-zA-Z0-9_-]+)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/
  );

  if (!m) {
    return null;
  }

  return {
    lang: (m[1] ?? null)?.toLowerCase() ?? null,
    content: m[2] ?? '',
  };
};

const extractMarkdownCodeBlocks = (raw: string): MarkdownCodeBlock[] => {
  const blocks: MarkdownCodeBlock[] = [];

  // non-greedy capture between fences, allow any fence language, allow CRLF

  const re = /```([a-zA-Z0-9_-]+)?[ \t]*\r?\n([\s\S]*?)```/g;

  let m: RegExpExecArray | null;

  do {
    m = re.exec(raw);

    if (!m) {
      break;
    }

    blocks.push({
      lang: (m[1] ?? null)?.toLowerCase() ?? null,
      content: m[2] ?? '',
    });
  } while (m);

  return blocks;
};

const findBalancedJsonValue = (
  s: string,
  start: number
): { text: string; end: number } | null => {
  const open = s[start];

  if (open !== '{' && open !== '[') {
    return null;
  }

  const stack: string[] = [open === '{' ? '}' : ']'];

  let inQuote: '"' | "'" | null = null;

  let escaped = false;

  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i];

    if (inQuote) {
      if (escaped) {
        escaped = false;

        continue;
      }

      if (ch === '\\') {
        escaped = true;

        continue;
      }

      if (ch === inQuote) {
        inQuote = null;
      }

      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;

      continue;
    }

    if (ch === '{') {
      stack.push('}');

      continue;
    }

    if (ch === '[') {
      stack.push(']');

      continue;
    }

    if (ch === '}' || ch === ']') {
      const expected = stack[stack.length - 1];

      if (expected !== ch) {
        return null;
      }

      stack.pop();

      if (stack.length === 0) {
        return {
          text: s.slice(start, i + 1),
          end: i,
        };
      }
    }
  }

  return null;
};

const extractBalancedJsonSnippets = (raw: string, max = 10): string[] => {
  const out: string[] = [];

  for (let i = 0; i < raw.length && out.length < max; i++) {
    const ch = raw[i];

    if (ch !== '{' && ch !== '[') {
      continue;
    }

    const found = findBalancedJsonValue(raw, i);

    if (!found) {
      continue;
    }

    out.push(found.text);

    i = found.end; // skip forward
  }

  return out;
};

const convertSingleQuotedStringsToDouble = (input: string): string => {
  let out = '';

  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    // inside double-quoted string: preserve, just track escapes

    if (inDouble) {
      out += ch;

      if (escaped) {
        escaped = false;

        continue;
      }

      if (ch === '\\') {
        escaped = true;

        continue;
      }

      if (ch === '"') {
        inDouble = false;
      }

      continue;
    }

    // inside single-quoted string: emit JSON double-quoted string
    if (inSingle) {
      if (escaped) {
        escaped = false;

        // handle \' -> '
        if (ch === "'") {
          out += "'";

          continue;
        }

        // keep typical escapes (\n, \t, \\ ...)
        // but if the escaped char is a double quote, it must remain escaped

        out += `\\${ch}`;

        continue;
      }

      if (ch === '\\') {
        escaped = true;

        continue;
      }

      if (ch === "'") {
        inSingle = false;

        out += '"';

        continue;
      }

      // if we see a literal double quote inside a single-quoted string,
      // it must be escaped because our output delimiter is "

      if (ch === '"') {
        out += '\\"';

        continue;
      }

      out += ch;

      continue;
    }

    // not in string
    if (ch === '"') {
      inDouble = true;

      out += ch;

      continue;
    }

    if (ch === "'") {
      inSingle = true;

      out += '"';

      continue;
    }

    out += ch;
  }

  return out;
};

const removeTrailingCommasOutsideStrings = (input: string): string => {
  let out = '';

  let inQuote: '"' | "'" | null = null;
  let escaped = false;

  const nextNonWs = (from: number): string | null => {
    for (let i = from; i < input.length; i++) {
      const ch = input[i];

      if (ch !== ' ' && ch !== '\t' && ch !== '\r' && ch !== '\n') {
        return ch ?? null;
      }
    }

    return null;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuote) {
      out += ch;

      if (escaped) {
        escaped = false;

        continue;
      }

      if (ch === '\\') {
        escaped = true;

        continue;
      }

      if (ch === inQuote) {
        inQuote = null;
      }

      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;

      out += ch;

      continue;
    }

    if (ch === ',') {
      const nxt = nextNonWs(i + 1);

      if (nxt === '}' || nxt === ']') {
        continue; // drop trailing comma
      }
    }

    out += ch;
  }

  return out;
};

const quoteUnquotedKeys = (input: string): string => {
  // heuristic; avoids most “JS object literal” outputs
  return input.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
};

const normalizeJsonLike = (raw: string): string => {
  let s = raw.trim();

  // Sometimes code block content starts with a "json" line:
  // ```\njson\n{...}\n```

  const label = s.match(/^(json|javascript|js|ts)\s*\r?\n([\s\S]*)$/i);

  if (label) {
    const rest = (label[2] ?? '').trim();

    if (rest.startsWith('{') || rest.startsWith('[')) {
      s = rest;
    }
  }

  // smart quotes

  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  // python-ish literals

  s = s
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false');

  // tolerate JS-ish object literals

  s = quoteUnquotedKeys(s);

  // single quotes + trailing commas

  s = convertSingleQuotedStringsToDouble(s);
  s = removeTrailingCommasOutsideStrings(s);

  return s.trim();
};

const tryParseJsonFromCandidate = (candidate: string): unknown | Error => {
  const trimmed = candidate.trim();

  if (trimmed.length === 0) {
    return new Error('empty JSON candidate');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // try relaxed normalization
  }

  const relaxed = normalizeJsonLike(trimmed);

  try {
    return JSON.parse(relaxed);
  } catch {
    return new Error('could not parse JSON from candidate');
  }
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
};

const coerceContainerForExpectedTypeId = (
  context: VibeScriptContext,
  typeId: number,
  parsed: unknown
): unknown => {
  const t = context.types[typeId];

  if (!t) {
    return parsed;
  }

  // expected array/tuple but got { something: [...] }

  if ((t.kind === 'array' || t.kind === 'tuple') && !Array.isArray(parsed)) {
    if (isPlainObject(parsed)) {
      const keys = Object.keys(parsed);

      if (keys.length === 1) {
        const k = keys[0] as string;

        // biome-ignore lint/suspicious/noExplicitAny: runtime indexing
        const inner = (parsed as any)[k];

        if (Array.isArray(inner)) {
          return inner;
        }
      }
    }
  }

  // expected object but got [ { ... } ]
  if (t.kind === 'object' && Array.isArray(parsed) && parsed.length === 1) {
    const inner = parsed[0];

    if (isPlainObject(inner)) {
      return inner;
    }
  }

  return parsed;
};

const parseOutputForTypeId = (
  context: VibeScriptContext,
  typeId: number,
  raw: string | null
): unknown | Error => {
  if (raw === null) {
    return new Error('llm returned null output');
  }

  const t = context.types[typeId];

  if (!t) {
    return new Error('unknown expected type id');
  }

  // if we couldn't type-check the output type, be permissive: return raw text

  if (t.kind === 'unknown') {
    return raw;
  }

  // for string: keep behavior mostly the same, but also unwrap a single code block

  if (t.kind === 'builtin' && t.name === 'string') {
    const single = stripSingleOuterCodeBlock(raw);

    if (single) {
      return single.content;
    }

    // keep existing exact ```json normalization too (harmless)

    const start = '```json\n';

    const end = '\n```';

    if (raw.startsWith(start) && raw.endsWith(end)) {
      return raw.slice(start.length, raw.length - end.length);
    }

    return raw;
  }

  if (t.kind === 'builtin' && t.name === 'void') {
    return null;
  }

  // build candidates in priority order:
  // 1) entire-response single code block (common)
  // 2) any fenced code blocks (prefer ```json)
  // 3) balanced {...} / [...] snippets from within those
  // 4) balanced snippets from whole raw
  // 5) raw itself

  const candidates: string[] = [];

  const seen = new Set<string>();

  const push = (s: string) => {
    const key = s.trim();

    if (key.length === 0) {
      return;
    }

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    candidates.push(s);
  };

  const single = stripSingleOuterCodeBlock(raw);

  if (single) {
    push(single.content);

    for (const snippet of extractBalancedJsonSnippets(single.content)) {
      push(snippet);
    }
  }

  const blocks = extractMarkdownCodeBlocks(raw);

  // prefer json-labeled first
  for (const b of blocks.filter(b => b.lang === 'json')) {
    push(b.content);

    for (const snippet of extractBalancedJsonSnippets(b.content)) {
      push(snippet);
    }
  }

  for (const b of blocks.filter(b => b.lang !== 'json')) {
    push(b.content);

    for (const snippet of extractBalancedJsonSnippets(b.content)) {
      push(snippet);
    }
  }

  for (const snippet of extractBalancedJsonSnippets(raw)) {
    push(snippet);
  }

  push(raw);

  let lastErr: Error | null = null;

  for (const cand of candidates) {
    const parsed = tryParseJsonFromCandidate(cand);

    if (parsed instanceof Error) {
      lastErr = parsed;

      continue;
    }

    const coerced = coerceContainerForExpectedTypeId(context, typeId, parsed);

    // Validate minimal shape (same spirit as your original code)
    if (t.kind === 'builtin') {
      if (t.name === 'number') {
        if (typeof coerced !== 'number') {
          lastErr = new Error(
            `expected '${typeNameForTypeId(context, typeId)}', got '${typeof coerced}'`
          );

          continue;
        }

        return coerced;
      }

      if (t.name === 'boolean') {
        if (typeof coerced !== 'boolean') {
          lastErr = new Error(
            `expected '${typeNameForTypeId(context, typeId)}', got '${typeof coerced}'`
          );

          continue;
        }

        return coerced;
      }

      return coerced;
    }

    if (t.kind === 'array' || t.kind === 'tuple') {
      if (!Array.isArray(coerced)) {
        lastErr = new Error(
          `expected '${typeNameForTypeId(context, typeId)}', got non-array JSON`
        );

        continue;
      }

      return coerced;
    }

    if (t.kind === 'object') {
      if (!isPlainObject(coerced)) {
        lastErr = new Error(
          `expected '${typeNameForTypeId(context, typeId)}', got non-object JSON`
        );

        continue;
      }

      return coerced;
    }

    return coerced;
  }

  // Final fallbacks for number/bool if response is mostly prose (no JSON candidates worked)
  if (t.kind === 'builtin' && t.name === 'number') {
    const m = raw.match(/-?\d+(\.\d+)?/);

    if (m) {
      const n = Number(m[0]);

      if (!Number.isNaN(n)) {
        return n;
      }
    }
  }

  if (t.kind === 'builtin' && t.name === 'boolean') {
    const m = raw.match(/\b(true|false)\b/i);

    if (m) {
      return m[1]?.toLowerCase() === 'true';
    }
  }

  return (
    lastErr ??
    new Error(
      `expected '${typeNameForTypeId(context, typeId)}' output, but could not parse/validate it`
    )
  );
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
  if (value instanceof Error) {
    // preserve original parse/type errors rather
    // than masking them with transform errors

    return value;
  }

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

  if (expr.kind === 'array') {
    const out: unknown[] = [];

    for (const e of expr.elements) {
      const v = evalExpression(e, env, context);

      if (v instanceof Error) {
        return v;
      }

      out.push(v);
    }

    return out;
  }

  // lambda

  if (expr.kind === 'lambda') {
    return () => evalExpression(expr.body, env, context);
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

    // builtins

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

    if (expr.name === 'sample') {
      if (args.length !== 1) {
        return new Error('sample(...) takes 1 argument');
      }

      const a0 = args[0];

      if (!Array.isArray(a0)) {
        return new Error('sample(...) expects an array');
      }

      if (a0.length === 0) {
        return null;
      }

      const i = Math.floor(Math.random() * a0.length);

      return a0[i];
    }

    // maybe user-defined

    const maybeFn = env[expr.name];

    if (typeof maybeFn === 'function') {
      try {
        const fn = maybeFn as (...xs: unknown[]) => unknown;
        return fn(...args);
      } catch (e) {
        return e instanceof Error ? e : new Error(String(e));
      }
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
      if (
        op === VibeScriptBinaryOperator.Add &&
        (typeof lhs === 'string' || typeof rhs === 'string')
      ) {
        // if either side is a string, perform concatenation

        if (typeof lhs === 'string' || typeof rhs === 'string') {
          return String(lhs) + String(rhs);
        }
      }

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
      // prefer numeric compare when possible

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

export type VibeScriptStepStartArgs = {
  index: number;
  totalSteps: number;
  name: string | null;
  prompt: string;
};

export type VibeScriptStepResultArgs = {
  index: number;
  totalSteps: number;
  result: VibeScriptStepResult;
};

export type VibeScriptCallbacks = {
  onStepStart?: (args: VibeScriptStepStartArgs) => Promise<null>;
  onStepResult?: (args: VibeScriptStepResultArgs) => Promise<null>;
};

export type VibeScriptExecProps = (
  | {
      script: CheckedVibeScript;
      completeChat: LLMCompleteChat;
      models: (() => LLMModel[]) | LLMModel[] | LLMModel;
      thinking?: LLMThinking;
      logLevel?: VibeScriptLogLevel;
      mode?: VibeScriptExecMode;
    }
  | {
      script: CheckedVibeScript;
      completeChat: LLMCompleteChat;
      thinking?: LLMThinking;
      provider?: LLMProvider;
      logLevel?: VibeScriptLogLevel;
      mode?: VibeScriptExecMode;
    }
) &
  VibeScriptCallbacks;

export const execVibeScript = async (
  props: VibeScriptExecProps
): Promise<VibeScriptResult | Error> => {
  const env: VibeScriptRuntimeEnv = {};

  const script = props.script;

  let messages: ChatCompletionMessage[] = [];

  const results: VibeScriptStepResult[] = [];

  const usesSteps = props.script.blocks.some(b => b.kind === 'step');

  const _logLevel: VibeScriptLogLevel = props.logLevel ?? 'off';

  const _mode: VibeScriptExecMode = props.mode ?? 'run';

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

  const DEFAULT_THINKING: LLMThinking = 'medium';

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

    if (script.outputTypeId !== null) {
      return script.outputTypeId;
    }

    return implicitStepExpectsTypeId;
  })();

  const implicitStepThinking = usesSteps
    ? null
    : (script.defaultThinking ?? null);

  const implicitStepProvider = usesSteps
    ? null
    : (script.defaultProvider ?? null);

  const implicitStepModel = usesSteps ? null : (script.defaultModel ?? null);

  const implicitStepTransforms = usesSteps ? null : (script.transforms ?? null);

  ///

  type CurrentStep = {
    name: string | null;
    expectsTypeId: number; // raw
    outputTypeId: number; // transformed
    thinking: LLMThinking | null;
    provider: LLMProvider | null;
    model: LLMModel | null;
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

    const totalSteps = script.steps.length;

    const stepIndex = results.length;

    if (props.onStepStart) {
      await props.onStepStart({
        index: stepIndex,
        totalSteps,
        name: current.name,
        prompt: current.prompt,
      });
    }

    const stepNameForLog = current.name || '<unnamed>';

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

    // transform-only step (no LLM call)

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

      if (props.onStepResult) {
        await props.onStepResult({
          index: stepIndex,
          totalSteps,
          result: stepResult,
        });
      }

      if (_logLevel !== 'off') {
        writeSameLine(`Step: ${stepNameForLog}; transform`);

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

    // normal LLM step

    const prompt = current.prompt;

    if (prompt.trim().length === 0) {
      const stepErr = new Error('empty step prompt');

      if (_logLevel !== 'off') {
        writeSameLine(`Step: ${stepNameForLog}; input≈0`);
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

    ///

    // resolve (provider/thinking/model) *now*, so logs match reality

    const thinkingHint = current.thinking ?? props.thinking ?? null;

    type PlannedLLMCall = {
      models: (() => LLMModel[]) | LLMModel[] | LLMModel;
      thinking: LLMThinking;
      provider: LLMProvider | null;
      model: LLMModel | null; // concrete model if known
    };

    const planned: PlannedLLMCall | Error = (() => {
      // 1) step forces model

      if (current.model !== null) {
        const resolvedThinking = thinkingHint ?? DEFAULT_THINKING;

        return {
          models: current.model,
          thinking: resolvedThinking,
          provider: inferProviderForModel(current.model),
          model: current.model,
        };
      }

      // 2) step forces provider => pick a model now

      if (current.provider !== null) {
        const picked = getModel({
          thinking: thinkingHint ?? undefined,
          provider: current.provider,
        });

        if (picked instanceof Error) {
          return picked;
        }

        const [provider, resolvedThinking, model] = picked;

        return {
          models: model, // lock in model so call matches log
          thinking: resolvedThinking,
          provider,
          model,
        };
      }

      // 3) outer call forces models list/single model

      if ('models' in props) {
        const resolvedThinking = thinkingHint ?? DEFAULT_THINKING;

        const modelForEstimate: LLMModel | null =
          typeof props.models === 'function'
            ? null
            : Array.isArray(props.models)
              ? (props.models[0] ?? null)
              : props.models;

        return {
          models: props.models,
          thinking: resolvedThinking,
          provider: modelForEstimate
            ? inferProviderForModel(modelForEstimate)
            : null,
          model: modelForEstimate,
        };
      }

      // 4) no models/provider passed => pick provider + model now

      const picked = getModel({
        thinking: thinkingHint ?? undefined,
        provider: props.provider,
      });

      if (picked instanceof Error) {
        return picked;
      }

      const [provider, resolvedThinking, model] = picked;

      return {
        models: model, // lock in model so call matches log
        thinking: resolvedThinking,
        provider,
        model,
      };
    })();

    if (planned instanceof Error) {
      if (_logLevel !== 'off') {
        writeSameLine(
          `Step: ${stepNameForLog}; input≈${estimateTokensForMessages(nextMessages)}`
        );
        endSameLine(false, 0);
      }

      current = null;

      return planned;
    }

    const inputTokenEstimate = estimateTokensForMessages(nextMessages);

    const estimatedUsage: LLMTokenUsage = {
      inputTokens: inputTokenEstimate,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: inputTokenEstimate,
      estimated: true,
    };

    const inputCost =
      planned.model !== null
        ? computeCostUnits(estimatedUsage, planned.model)
        : null;

    if (_logLevel !== 'off') {
      writeSameLine(
        `Step: ${stepNameForLog}${inputCost !== null ? `; inputCost=${inputCost}` : ''}; thinking: ${planned.thinking}; model: ${current.model !== null ? current.model : planned.model}`
      );
    }

    ///

    // OUTPUT MODE: don’t call the LLM, but still “advance” with placeholders

    if (_mode === 'output') {
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

      const label = current.name ?? `step_${stepIndex}`;

      const placeholder = placeholderForTypeId(
        script.context,
        current.outputTypeId,
        label
      );

      const stepResult: VibeScriptStepResult = {
        name: current.name,
        expectsTypeId: current.expectsTypeId,
        outputTypeId: current.outputTypeId,
        prompt,
        model: 'output',
        raw: null,
        value: placeholder,
        accounting: zeroAccounting,
      };

      results.push(stepResult);

      if (props.onStepResult) {
        await props.onStepResult({
          index: stepIndex,
          totalSteps,
          result: stepResult,
        });
      }

      if (current.outputName) {
        if (current.outputName in env) {
          const name = current.outputName;

          current = null;

          return new Error(`redefinition of variable '${name}' at runtime`);
        }

        env[current.outputName] = placeholder;
      }

      // keep the “conversation shape” moving forward (optional but nice)

      messages = [
        ...nextMessages,
        {
          role: 'assistant',
          content: placeholderToAssistantContent(placeholder),
        },
      ];

      if (_logLevel !== 'off') {
        endSameLine(true, 0);
      }

      current = null;

      return null;
    }

    // RUN MODE: do the real LLM call

    const completion = await props.completeChat({
      models: planned.models,
      messages: nextMessages,
      thinking: planned.thinking,
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

    // we intentionally bypass parseOutputForTypeId because the
    // response of the LLM completion maps directly to 'string',
    // if 'string' is the expected output type, irrespective of
    // whether it was implicit or not

    const value: unknown =
      current.expectsTypeId === StringTypeId
        ? raw
        : applyTransformsRuntime(
            parseOutputForTypeId(script.context, current.expectsTypeId, raw),
            current.transforms
          );

    const stepResult: VibeScriptStepResult = {
      name: current.name,
      expectsTypeId: current.expectsTypeId,
      outputTypeId: current.outputTypeId,
      prompt,
      model,
      raw,
      value,
      accounting,
    };

    results.push(stepResult);

    if (props.onStepResult) {
      await props.onStepResult({
        index: stepIndex,
        totalSteps,
        result: stepResult,
      });
    }

    const err = value instanceof Error ? value : null;

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

      env[current.outputName] = value;
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
        thinking: b.thinking,
        provider: b.provider,
        model: b.model,
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
          thinking: implicitStepThinking,
          provider: implicitStepProvider,
          model: implicitStepModel,
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
          thinking: implicitStepThinking,
          provider: implicitStepProvider,
          model: implicitStepModel,
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

export const exec = async (
  props: (
    | {
        contents: string;
        completeChat: LLMCompleteChat;
        models: (() => LLMModel[]) | LLMModel[] | LLMModel;
        thinking?: LLMThinking;
        logLevel?: VibeScriptLogLevel;
      }
    | {
        contents: string;
        completeChat: LLMCompleteChat;
        thinking?: LLMThinking;
        provider?: LLMProvider;
        logLevel?: VibeScriptLogLevel;
      }
  ) &
    VibeScriptCallbacks
): Promise<VibeScriptResult | Error> => {
  const parsed = parseVibeScript(props.contents);

  if (parsed instanceof Error) {
    return parsed;
  }

  const checked = typeCheckVibeScript(parsed);

  if (checked instanceof Error) {
    return checked;
  }

  return 'models' in props
    ? await execVibeScript({
        script: checked,
        completeChat: props.completeChat,
        models: props.models,
        thinking: props.thinking,
        logLevel: props.logLevel,
        onStepStart: props.onStepStart,
        onStepResult: props.onStepResult,
      })
    : await execVibeScript({
        script: checked,
        completeChat: props.completeChat,
        thinking: props.thinking,
        provider: props.provider,
        logLevel: props.logLevel,
        onStepStart: props.onStepStart,
        onStepResult: props.onStepResult,
      });
};

export const markdownifyStep = (stepResult: VibeScriptStepResult): string => {
  if (!stepResult) {
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

  return renderValue(stepResult.value, 1);
};

export const markdownify = (result: VibeScriptResult): string => {
  const last = result.steps[result.steps.length - 1];

  if (!last) {
    return '';
  }

  return markdownifyStep(last);
};
