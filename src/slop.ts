import {
  type Lexer,
  lexerIsEof,
  lexerPeek,
  type Source,
  type Parser,
  parserIsEof,
  lexerMatch,
} from './parsing';

// lexing

export type SlopTokenKind = 'text' | 'punc' | 'newline' | 'whitespace' | 'eof';

export type SlopToken = {
  kind: SlopTokenKind;
  value?: string | null;
};

const isSlopTokenPunc = (char: string): boolean => {
  return (
    char === '[' ||
    char === ']' ||
    char === '{' ||
    char === '}' ||
    char === '(' ||
    char === ')' ||
    char === ',' ||
    char === '"' ||
    char === "'" ||
    char === '`' ||
    char === ':' ||
    char === ';' ||
    char === '.' ||
    char === '-' ||
    char === '_' ||
    char === '@' ||
    char === '~' ||
    char === '#' ||
    char === '$' ||
    char === '%' ||
    char === '^' ||
    char === '&' ||
    char === '|' ||
    char === '!' ||
    char === '?' ||
    char === '+' ||
    char === '=' ||
    char === '*' ||
    char === '/' ||
    char === '\\' ||
    char === '<' ||
    char === '>'
  );
};

const isSlopWhitespace = (char: string): boolean => {
  return char === ' ' || char === '\t' || char === '\r';
};

export const lexSlopToken = (lexer: Lexer): SlopToken | Error => {
  while (!lexerIsEof(lexer)) {
    const peek = lexerPeek(lexer);

    if (peek instanceof Error) {
      return peek;
    }

    // newline

    if (peek === '\n') {
      const startNewline = lexer.position;

      lexer.position += 1;

      return {
        kind: 'newline',
        value: lexer.source.contents.slice(startNewline, lexer.position),
      };
    }

    // whitespace

    if (isSlopWhitespace(peek)) {
      const startWhitespace = lexer.position;

      while (!lexerIsEof(lexer)) {
        const peekWhitespace = lexerPeek(lexer);

        if (
          typeof peekWhitespace === 'string' &&
          isSlopWhitespace(peekWhitespace)
        ) {
          lexer.position += 1;
        } else {
          break;
        }
      }

      return {
        kind: 'whitespace',
        value: lexer.source.contents.slice(startWhitespace, lexer.position),
      };
    }

    // common punc

    if (peek === '<' && lexerMatch(lexer, '!--', 1)) {
      const startPunc = lexer.position;

      lexer.position += 4;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    // comment end token '-->'

    if (peek === '-' && lexerMatch(lexer, '->', 1)) {
      const startPunc = lexer.position;

      lexer.position += 3;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    // fenced code block delimiter '```'

    if (peek === '`' && lexerMatch(lexer, '``', 1)) {
      const startPunc = lexer.position;

      lexer.position += 3;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    // punc

    if (isSlopTokenPunc(peek)) {
      const startPunc = lexer.position;

      lexer.position += 1;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    // text

    const startText = lexer.position;

    while (!lexerIsEof(lexer)) {
      lexer.position += 1;

      const peekText = lexerPeek(lexer);

      if (
        typeof peekText === 'string' &&
        (peekText === '\n' ||
          isSlopTokenPunc(peekText) ||
          isSlopWhitespace(peekText))
      ) {
        break;
      }
    }

    return {
      kind: 'text',
      value: lexer.source.contents.slice(startText, lexer.position),
    };
  }

  return {
    kind: 'eof',
    value: null,
  };
};

export const lexSlopTokensFromSource = (
  source: Source
): SlopToken[] | Error => {
  const lexer: Lexer = {
    source,
    position: 0,
  };

  const tokens: SlopToken[] = [];

  while (!lexerIsEof(lexer)) {
    const token = lexSlopToken(lexer);

    if (token instanceof Error) {
      return token;
    }

    tokens.push(token);
  }

  if (tokens[tokens.length - 1]?.kind !== 'eof') {
    tokens.push({
      kind: 'eof',
      value: null,
    });
  }

  return tokens;
};

// parsing

const skipWhitespaceOrNewlines = (
  tokens: SlopToken[],
  index: number
): number => {
  let i = index;

  while (
    (i < tokens.length && tokens[i]?.kind === 'whitespace') ||
    tokens[i]?.kind === 'newline'
  ) {
    i++;
  }

  return i;
};

export type SlopTextLiteralQuasis = {
  quasis: string;
};

export type SlopTextLiteralUrl = {
  url: string;
};

export type SlopTextLiteralPart = SlopTextLiteralQuasis | SlopTextLiteralUrl;

export type SlopHeadingBlock = {
  number: number;
  parts: SlopTextLiteralPart[];
};

export type SlopTextLiteralBlock = {
  parts: SlopTextLiteralPart[];
};

export type SlopCodeBlock = {
  format: string | null;
  text: string;
};

export type SlopListItem = {
  bullet: string;
  parts: SlopTextLiteralPart[];
};

export type SlopListBlock = {
  items: SlopListItem[];
};

export type SlopBlock =
  | SlopTextLiteralBlock
  | SlopHeadingBlock
  | SlopCodeBlock
  | SlopListBlock;

const parseTextParts = (
  parser: Parser<SlopToken>,
  options?: {
    mode?: 'line' | 'paragraph';
  }
): SlopTextLiteralPart[] | Error => {
  const mode = options?.mode ?? 'line';

  const tokens = parser.tokens;

  const skipHorizontalWhitespaceTokens = (from: number): number => {
    let i = from;

    while (i < tokens.length && tokens[i]?.kind === 'whitespace') {
      i += 1;
    }

    return i;
  };

  const splitTextIntoParts = (text: string): SlopTextLiteralPart[] => {
    const parts: SlopTextLiteralPart[] = [];

    // permissive and cheap

    const re = /https?:\/\/[^\s<>()]+/g;

    let last = 0;

    let m: RegExpExecArray | null;

    do {
      m = re.exec(text);

      if (!m) {
        break;
      }

      const raw = m[0] ?? '';

      const start = m.index;

      const end = start + raw.length;

      if (start > last) {
        parts.push({
          quasis: text.slice(last, start),
        });
      }

      ///

      let cleaned = raw;

      while (cleaned.length > 0) {
        const last = cleaned[cleaned.length - 1];

        if (
          last === '.' ||
          last === ',' ||
          last === ';' ||
          last === ':' ||
          last === '!' ||
          last === '?' ||
          last === ')' ||
          last === ']' ||
          last === '}' ||
          last === '"' ||
          last === "'"
        ) {
          cleaned = cleaned.slice(0, -1);

          continue;
        }

        break;
      }

      ///

      if (cleaned.length > 0) {
        parts.push({
          url: cleaned,
        });

        // keep any stripped punctuation as quasis
        const strippedLen = raw.length - cleaned.length;

        if (strippedLen > 0) {
          parts.push({
            quasis: raw.slice(raw.length - strippedLen),
          });
        }
      } else {
        parts.push({
          quasis: raw,
        });
      }

      last = end;
    } while (m);

    if (last < text.length) {
      parts.push({
        quasis: text.slice(last),
      });
    }

    // compress adjacent quasis

    const merged: SlopTextLiteralPart[] = [];

    for (const p of parts) {
      if ('quasis' in p) {
        const prev = merged[merged.length - 1];

        if (prev && 'quasis' in prev) {
          merged[merged.length - 1] = {
            quasis: prev.quasis + p.quasis,
          };

          continue;
        }
      }

      merged.push(p);
    }

    return merged;
  };

  if (mode === 'line') {
    const parts: string[] = [];

    while (!parserIsEof(parser)) {
      const t = tokens[parser.position];

      if (!t) {
        break;
      }

      if (t.kind === 'newline') {
        break;
      }

      parts.push(t.value ?? '');

      parser.position += 1;
    }

    const n = tokens[parser.position];

    if (n?.kind === 'newline') {
      parser.position += 1;
    }

    const text = parts.join('').trimEnd();

    return splitTextIntoParts(text);
  }

  // paragraph mode

  const parts: string[] = [];

  let sawAny = false;

  while (!parserIsEof(parser)) {
    // stop on blank line

    const ptr = skipHorizontalWhitespaceTokens(parser.position);

    const t0 = tokens[ptr];

    if (t0?.kind === 'newline' || t0?.kind === 'eof') {
      if (t0?.kind === 'newline') {
        parser.position = ptr + 1;
      } else {
        parser.position = ptr;
      }

      break;
    }

    // stop before other block starts when we already have content

    if (sawAny) {
      if (t0?.kind === 'punc' && (t0.value === '#' || t0.value === '```')) {
        break;
      }
    }

    // consume one token

    const t = tokens[parser.position];

    if (!t) {
      break;
    }

    parts.push(t.value ?? '');

    parser.position += 1;

    sawAny = true;
  }

  const text = parts.join('').trimEnd();

  return splitTextIntoParts(text);
};

const matchListLineAt = (
  tokens: SlopToken[],
  index: number
): { bullet: string; isOrdered: boolean } | null => {
  let ptr = index;

  while (ptr < tokens.length && tokens[ptr]?.kind === 'whitespace') {
    ptr += 1;
  }

  const t0 = tokens[ptr];

  if (!t0) {
    return null;
  }

  // unordered: -, *, +

  if (
    t0.kind === 'punc' &&
    (t0.value === '-' || t0.value === '*' || t0.value === '+')
  ) {
    const t1 = tokens[ptr + 1];

    if (t1?.kind !== 'whitespace') {
      return null;
    }

    return {
      bullet: t0.value ?? '-',
      isOrdered: false,
    };
  }

  // ordered: 1. 2. 3.

  if (
    t0.kind === 'text' &&
    typeof t0.value === 'string' &&
    /^[0-9]+$/.test(t0.value)
  ) {
    const t1 = tokens[ptr + 1];
    const t2 = tokens[ptr + 2];

    if (t1?.kind !== 'punc' || t1.value !== '.') {
      return null;
    }

    if (t2?.kind !== 'whitespace') {
      return null;
    }

    return {
      bullet: `${t0.value}.`,
      isOrdered: true,
    };
  }

  return null;
};

const parseHeadingBlock = (
  parser: Parser<SlopToken>
): SlopHeadingBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing slop heading');
  }

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  let linePtr = parser.position;

  while (
    linePtr < parser.tokens.length &&
    parser.tokens[linePtr]?.kind === 'whitespace'
  ) {
    linePtr += 1;
  }

  const first = parser.tokens[linePtr];

  if (first?.kind !== 'punc' || first.value !== '#') {
    return new Error('expected heading starting with #');
  }

  parser.position = linePtr;

  let count = 0;

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (t?.kind === 'punc' && t.value === '#') {
      count += 1;
      parser.position += 1;
      continue;
    }

    break;
  }

  // optional whitespace after heading markers

  while (
    parser.position < parser.tokens.length &&
    parser.tokens[parser.position]?.kind === 'whitespace'
  ) {
    parser.position += 1;
  }

  const parts = parseTextParts(parser, { mode: 'line' });

  if (parts instanceof Error) {
    return parts;
  }

  return {
    number: count,
    parts,
  };
};

const parseCodeBlock = (parser: Parser<SlopToken>): SlopCodeBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing slop code block');
  }

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  let linePtr = parser.position;

  while (
    linePtr < parser.tokens.length &&
    parser.tokens[linePtr]?.kind === 'whitespace'
  ) {
    linePtr += 1;
  }

  const open = parser.tokens[linePtr];

  if (open?.kind !== 'punc' || open.value !== '```') {
    return new Error('expected opening ``` for slop code block');
  }

  parser.position = linePtr + 1;

  // read format to end of line

  const formatParts: string[] = [];

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    if (t.kind === 'newline') {
      break;
    }

    formatParts.push(t.value ?? '');

    parser.position += 1;
  }

  const n0 = parser.tokens[parser.position];

  if (n0?.kind === 'newline') {
    parser.position += 1;
  }

  const formatRaw = formatParts.join('').trim();

  const format = formatRaw.length > 0 ? formatRaw : null;

  const parts: string[] = [];

  let atLineStart = true;

  while (!parserIsEof(parser)) {
    if (atLineStart) {
      let closePtr = parser.position;

      while (
        closePtr < parser.tokens.length &&
        parser.tokens[closePtr]?.kind === 'whitespace'
      ) {
        closePtr += 1;
      }

      const closeTok = parser.tokens[closePtr];

      if (closeTok?.kind === 'punc' && closeTok.value === '```') {
        // consume closing fence line

        parser.position = closePtr + 1;

        while (!parserIsEof(parser)) {
          const t = parser.tokens[parser.position];

          if (!t) {
            break;
          }

          if (t.kind === 'newline') {
            break;
          }

          parser.position += 1;
        }

        const n1 = parser.tokens[parser.position];

        if (n1?.kind === 'newline') {
          parser.position += 1;
        }

        return {
          format: format ? format.toLowerCase() : null,
          text: parts.join(''),
        };
      }
    }

    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    parts.push(t.value ?? '');

    parser.position += 1;

    atLineStart = t.kind === 'newline';
  }

  return new Error('unterminated slop code block missing closing ```');
};

const parseListBlock = (parser: Parser<SlopToken>): SlopListBlock | Error => {
  const items: SlopListItem[] = [];

  while (!parserIsEof(parser)) {
    // stop at blank line

    let ptr = parser.position;

    while (
      ptr < parser.tokens.length &&
      parser.tokens[ptr]?.kind === 'whitespace'
    ) {
      ptr += 1;
    }

    const t0 = parser.tokens[ptr];

    if (t0?.kind === 'newline') {
      parser.position = ptr + 1;
      break;
    }

    if (t0?.kind === 'eof') {
      break;
    }

    // stop before other block starts

    if (t0?.kind === 'punc' && (t0.value === '#' || t0.value === '```')) {
      break;
    }

    const peek = matchListLineAt(parser.tokens, parser.position);

    if (!peek) {
      break;
    }

    // consume bullet line
    // allow indentation

    let bulletStartPtr = parser.position;

    while (
      bulletStartPtr < parser.tokens.length &&
      parser.tokens[bulletStartPtr]?.kind === 'whitespace'
    ) {
      bulletStartPtr += 1;
    }

    parser.position = bulletStartPtr;

    if (peek.isOrdered) {
      // number token + '.' token

      const nTok = parser.tokens[parser.position];
      const dotTok = parser.tokens[parser.position + 1];
      const wsTok = parser.tokens[parser.position + 2];

      if (
        nTok?.kind !== 'text' ||
        dotTok?.kind !== 'punc' ||
        dotTok.value !== '.' ||
        wsTok?.kind !== 'whitespace'
      ) {
        break;
      }

      parser.position += 3;
    } else {
      const bulletTok = parser.tokens[parser.position];
      const wsTok = parser.tokens[parser.position + 1];

      if (
        bulletTok?.kind !== 'punc' ||
        (bulletTok.value !== '-' &&
          bulletTok.value !== '*' &&
          bulletTok.value !== '+') ||
        wsTok?.kind !== 'whitespace'
      ) {
        break;
      }

      parser.position += 2;
    }

    // parse list item content

    const parts = parseTextParts(parser, { mode: 'line' });

    if (parts instanceof Error) {
      return parts;
    }

    items.push({
      bullet: peek.bullet,
      parts,
    });
  }

  return {
    items,
  };
};

const parseTextLiteralBlock = (
  parser: Parser<SlopToken>
): SlopTextLiteralBlock | Error => {
  const parts = parseTextParts(parser, { mode: 'paragraph' });

  if (parts instanceof Error) {
    return parts;
  }

  return {
    parts,
  };
};

const parseTextLikeBlock = (
  parser: Parser<SlopToken>
): SlopTextLiteralBlock | SlopListBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing slop text block');
  }

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  ///

  // const runLen = scanListRunLength(parser.tokens, parser.position);

  let i = parser.position;

  let count = 0;

  let style:
    | { kind: 'ordered' }
    | { kind: 'unordered'; bullet: string }
    | null = null;

  while (i < parser.tokens.length) {
    // stop at blank line

    let ptr = i;

    while (
      ptr < parser.tokens.length &&
      parser.tokens[ptr]?.kind === 'whitespace'
    ) {
      ptr += 1;
    }

    const t0 = parser.tokens[ptr];
    if (!t0) {
      break;
    }

    if (t0.kind === 'newline' || t0.kind === 'eof') {
      break;
    }

    // stop before other block starts

    if (t0.kind === 'punc' && (t0.value === '#' || t0.value === '```')) {
      break;
    }

    const peek = matchListLineAt(parser.tokens, i);

    if (!peek) {
      break;
    }

    if (style === null) {
      style = peek.isOrdered
        ? { kind: 'ordered' }
        : { kind: 'unordered', bullet: peek.bullet };
    } else {
      if (style.kind === 'ordered') {
        if (!peek.isOrdered) {
          break;
        }
      } else {
        if (peek.isOrdered || peek.bullet !== style.bullet) {
          break;
        }
      }
    }

    // advance to next line without consuming parser state

    let j = i;

    while (j < parser.tokens.length) {
      const t = parser.tokens[j];

      if (!t) {
        break;
      }

      j += 1;

      if (t.kind === 'newline') {
        break;
      }

      if (t.kind === 'eof') {
        break;
      }
    }

    i = j;

    count += 1;
  }

  // require at least 2 lines to avoid treating hyphenated prose as a list

  if (count >= 2) {
    return parseListBlock(parser);
  }

  return parseTextLiteralBlock(parser);
};

const parseBlock = (parser: Parser<SlopToken>): SlopBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing slop block');
  }

  const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  if (nextPtr >= parser.tokens.length) {
    return new Error('unexpected end of input parsing slop block');
  }

  const nextPeek = parser.tokens[nextPtr];

  if (nextPeek?.kind === 'punc' && nextPeek.value === '#') {
    return parseHeadingBlock(parser);
  }

  if (nextPeek?.kind === 'punc' && nextPeek.value === '```') {
    return parseCodeBlock(parser);
  }

  return parseTextLikeBlock(parser);
};

const parseBlocks = (parser: Parser<SlopToken>): SlopBlock[] | Error => {
  const blocks: SlopBlock[] = [];

  while (!parserIsEof(parser)) {
    parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    if (parserIsEof(parser)) {
      break;
    }

    const start = parser.position;

    const b = parseBlock(parser);

    if (b instanceof Error) {
      return b;
    }

    blocks.push(b);

    // paranoia against non-advancing parsers

    if (parser.position === start) {
      parser.position += 1;
    }
  }

  return blocks;
};

export const parseSlop = (contents: string): SlopBlock[] | Error => {
  const source: Source = { contents };

  const tokens = lexSlopTokensFromSource(source);

  if (tokens instanceof Error) {
    return tokens;
  }

  const parser: Parser<SlopToken> = {
    source,
    tokens,
    position: 0,
  };

  return parseBlocks(parser);
};

// type checking

export const slopUrlCheckModes = ['off', 'validity', 'liveness'] as const;

export type SlopUrlCheckMode = (typeof slopUrlCheckModes)[number];

const isHttpUrl = (u: URL): boolean => {
  return u.protocol === 'http:' || u.protocol === 'https:';
};

const validateUrl = (raw: string): URL | Error => {
  let u: URL;

  try {
    u = new URL(raw);
  } catch {
    return new Error(`invalid url '${raw}'`);
  }

  if (!isHttpUrl(u)) {
    return new Error(`unsupported url protocol '${u.protocol}' for '${raw}'`);
  }

  return u;
};

const headUrl = async (
  url: string,
  timeoutMs: number
): Promise<null | Error> => {
  const controller = new AbortController();

  const id = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    // allow redirects and success
    if (res.status >= 200 && res.status < 400) {
      return null;
    }

    return new Error(`url not live '${url}' status=${res.status}`);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));

    return new Error(`url not live '${url}' error='${err.message}'`);
  } finally {
    clearTimeout(id);
  }
};

const typeCheckParts = async (
  parts: SlopTextLiteralPart[],
  mode: SlopUrlCheckMode,
  timeoutMs: number
): Promise<null | Error> => {
  if (mode === 'off') {
    return null;
  }

  for (const p of parts) {
    if (!p || typeof p !== 'object') {
      continue;
    }

    if ('url' in p) {
      const u = validateUrl(p.url);

      if (u instanceof Error) {
        return u;
      }

      if (mode === 'liveness') {
        const live = await headUrl(u.toString(), timeoutMs);

        if (live instanceof Error) {
          return live;
        }
      }
    }
  }

  return null;
};

export const typeCheckSlop = async (
  blocks: SlopBlock[],
  options?: {
    mode?: SlopUrlCheckMode;
    timeoutMs?: number;
  }
): Promise<SlopBlock[] | Error> => {
  const mode: SlopUrlCheckMode = options?.mode ?? 'off';

  const timeoutMs = options?.timeoutMs ?? 10_000;

  if (mode === 'off') {
    return blocks;
  }

  for (const b of blocks) {
    if (!b || typeof b !== 'object') {
      continue;
    }

    if ('parts' in b) {
      const err = await typeCheckParts(
        (b as SlopTextLiteralBlock | SlopHeadingBlock).parts,
        mode,
        timeoutMs
      );

      if (err instanceof Error) {
        return err;
      }

      continue;
    }

    if ('items' in b) {
      for (const it of b.items) {
        const err = await typeCheckParts(it.parts, mode, timeoutMs);

        if (err instanceof Error) {
          return err;
        }
      }
    }

    // code blocks do not contain url parts structurally
  }

  return blocks;
};
