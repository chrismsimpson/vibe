import {
  type Lexer,
  lexerIsEof,
  lexerPeek,
  type Source,
  type Parser,
  parserIsEof,
  lexerMatch,
} from './parsing';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// lexing

type VibeScriptTokenKind = 'text' | 'punc' | 'newline' | 'whitespace' | 'eof';

type VibeScriptToken = {
  kind: VibeScriptTokenKind;
  value?: string | null;
};

const isVibeScriptPunc = (char: string): boolean => {
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
    char === ':' ||
    char === ';' ||
    char === '.' ||
    char === '-' ||
    char === '_' ||
    char === '@' ||
    char === '~' ||
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

const isVibeScriptWhitespace = (char: string): boolean => {
  return char === ' ' || char === '\t' || char === '\r';
};

export const lexVibeScriptToken = (lexer: Lexer): VibeScriptToken | Error => {
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

    if (isVibeScriptWhitespace(peek)) {
      const startWhitespace = lexer.position;

      while (!lexerIsEof(lexer)) {
        const peekWhitespace = lexerPeek(lexer);

        if (
          typeof peekWhitespace === 'string' &&
          isVibeScriptWhitespace(peekWhitespace)
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

    if (peek === '-' && lexerMatch(lexer, '->', 1)) {
      const startPunc = lexer.position;

      lexer.position += 3;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    // other punc

    if (isVibeScriptPunc(peek)) {
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
          isVibeScriptPunc(peekText) ||
          isVibeScriptWhitespace(peekText))
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

export const lexVibeScriptTokensFromSource = (
  source: Source
): VibeScriptToken[] | Error => {
  const lexer = {
    source,
    position: 0,
  };

  const tokens: VibeScriptToken[] = [];

  while (!lexerIsEof(lexer)) {
    const token = lexVibeScriptToken(lexer);

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
  tokens: VibeScriptToken[],
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

export type VibeScriptFileIncludeBlock = {
  parent: string;
  files: string[];
};

export type VibeScriptStatement = VibeScriptFileIncludeBlock;

export type VibeScriptStatementCommentBlock = {
  statement: VibeScriptStatement;
};

export type VibeScriptRegularCommentBlock = {
  comment: string;
};

export type VibeScriptCommentBlock =
  | VibeScriptStatementCommentBlock
  | VibeScriptRegularCommentBlock;

export type VibeScriptTextLiteralQuasis = {
  quasis: string;
};

export type VibeScriptTextLiteralPart = VibeScriptTextLiteralQuasis;

export type VibeScriptTextBlock = {
  parts: VibeScriptTextLiteralPart[];
};

export type VibeScriptBlock = VibeScriptCommentBlock | VibeScriptTextBlock;

const consumePath = (parser: Parser<VibeScriptToken>): string | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script path');
  }

  ///

  ///

  const path = [];

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    if (t.kind === 'newline') {
      break;
    }

    if (t.value) {
      path.push(t.value);
    }

    parser.position += 1;
  }

  return path.join('');
};

const parseFileIncludeStatement = (
  parser: Parser<VibeScriptToken>
): VibeScriptFileIncludeBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error(
      'unexpected end of file parsing vibe script file include statement'
    );
  }

  ///

  const firstToken = parser.tokens[parser.position];

  if (firstToken === undefined) {
    return new Error(
      'unexpected undefined first token parsing vibe script file include statement'
    );
  }

  /// hardcoded to '~' for now (might want to handle other cases like '/' or './' later)

  if (firstToken.kind !== 'punc' || firstToken.value !== '~') {
    return new Error(
      `expected '~' token starting vibe script file include statement, got '${firstToken.value}'`
    );
  }

  ///

  const parent = consumePath(parser);

  if (parent instanceof Error) {
    return parent;
  }

  if (parent.trim().length === 0) {
    return new Error(
      'expected parent path in vibe script file include statement'
    );
  }

  ///

  const files: string[] = [];

  while (!parserIsEof(parser)) {
    parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    ///

    const nextToken = parser.tokens[parser.position];

    if (nextToken === undefined) {
      break;
    }

    if (nextToken.kind === 'punc' && nextToken.value === '-->') {
      break;
    }

    ///

    const filePath = consumePath(parser);

    if (filePath instanceof Error) {
      return filePath;
    }

    if (filePath.trim().length === 0) {
      break;
    }

    files.push(filePath);
  }

  ///

  return {
    parent,
    files,
  };
};

const parseStatement = (
  parser: Parser<VibeScriptToken>
): VibeScriptStatement | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing prompt script statement');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const nextToken = parser.tokens[parser.position];

  if (nextToken === undefined) {
    return new Error(
      'unexpected undefined token parsing vibe script statement'
    );
  }

  if (nextToken.kind === 'punc' && nextToken.value === '~') {
    return parseFileIncludeStatement(parser);
  }

  return new Error(
    `unexpected start token ('${nextToken.value}') parsing vibe script statement`
  );
};

const parseStatementCommentBlock = (
  parser: Parser<VibeScriptToken>
): VibeScriptStatementCommentBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error(
      'unexpected end of file parsing vibe script statement comment block'
    );
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const statement = parseStatement(parser);

  if (statement instanceof Error) {
    return statement;
  }

  ///

  const commentEndToken = parser.tokens[parser.position];

  if (commentEndToken === undefined) {
    return new Error(
      'unexpected undefined comment end token parsing vibe script statement comment block'
    );
  }

  if (commentEndToken.kind !== 'punc' || commentEndToken.value !== '-->') {
    return new Error(
      `expected comment end '-->' parsing vibe script statement comment block, got '${commentEndToken.value}'`
    );
  }

  parser.position += 1;

  ///

  const newlinePeek = parser.tokens[parser.position];

  if (newlinePeek !== undefined && newlinePeek.kind === 'newline') {
    parser.position += 1;
  }

  ///

  return {
    statement,
  };
};

const parseRegularCommentBlock = (
  parser: Parser<VibeScriptToken>
): VibeScriptRegularCommentBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error(
      'unexpected end of file parsing vibe script regular comment block'
    );
  }

  ///

  const tokens = [];

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    if (t.kind === 'punc' && t.value === '-->') {
      break;
    }

    tokens.push(t);

    parser.position += 1;
  }

  ///

  const commentEndToken = parser.tokens[parser.position];

  if (commentEndToken === undefined) {
    return new Error(
      'unexpected undefined comment end token parsing vibe script comment block'
    );
  }

  if (commentEndToken.kind !== 'punc' || commentEndToken.value !== '-->') {
    return new Error(
      `expected comment end '-->', got '${commentEndToken.value}'`
    );
  }

  parser.position += 1;

  ///

  const newlinePeek = parser.tokens[parser.position];

  if (newlinePeek !== undefined && newlinePeek.kind === 'newline') {
    parser.position += 1;
  }

  ///

  return {
    comment: tokens.flatMap(t => (t.value ? [t.value] : [])).join(''),
  };
};

const parseCommentBlock = (
  parser: Parser<VibeScriptToken>
): VibeScriptCommentBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error(
      'unexpected end of file parsing vibe script comment block'
    );
  }

  ///

  // skip any newlines or whitespace before the comment start

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const commentStartToken = parser.tokens[parser.position];

  if (commentStartToken === undefined) {
    return new Error(
      'unexpected undefined comment start token parsing vibe script comment block'
    );
  }

  if (commentStartToken.kind !== 'punc' || commentStartToken.value !== '<!--') {
    return new Error(
      `expected comment start token "<!--" parsing vibe script comment block, instead found "${commentStartToken.value}"`
    );
  }

  parser.position += 1;

  ///

  const ptr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const firstNonWhitespaceToken = parser.tokens[ptr];

  if (firstNonWhitespaceToken === undefined) {
    return new Error(
      'unexpected undefined first non-whitespace token parsing vibe script comment block'
    );
  }

  ///

  if (
    firstNonWhitespaceToken.kind === 'punc' &&
    firstNonWhitespaceToken.value === '~'
  ) {
    parser.position = ptr;

    return parseStatementCommentBlock(parser);
  }

  // TODO: interpret special stuff

  ///

  // don't skip at all (ie not even whitespace),
  // all will be consumed by the regular comment

  return parseRegularCommentBlock(parser);
};

const parseTextBlock = (
  parser: Parser<VibeScriptToken>
): VibeScriptTextBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script text block');
  }

  ///

  const parts: VibeScriptTextLiteralPart[] = [];

  let quasis = '';

  let tokenCount = 0;

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    // interpolation start (`${`)

    if (t.kind === 'text' && t.value != null && t.value.endsWith('$')) {
      return new Error('not implemented: parseTextBlock interpolation');
    }

    // normal text accumulation
    quasis += t.value ?? '';

    parser.position += 1;

    tokenCount += 1;

    if (t.kind === 'newline' && tokenCount > 1) {
      // tokenCount > 1 so that leading newlines are
      // consumed by current block rather than always
      // triggering a new block

      break;
    }
  }

  if (quasis.length > 0) {
    parts.push({
      quasis,
    } as VibeScriptTextLiteralQuasis);
  }

  return {
    parts,
  };
};

const parseBlock = (
  parser: Parser<VibeScriptToken>
): VibeScriptBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script block');
  }

  ///

  const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const nextPeek = parser.tokens[nextPtr];

  if (nextPeek?.kind === 'punc' && nextPeek.value === '<!--') {
    return parseCommentBlock(parser);
  }

  return parseTextBlock(parser);
};

const parseBlocks = (
  parser: Parser<VibeScriptToken>
): VibeScriptBlock[] | Error => {
  if (parserIsEof(parser)) {
    return [];
  }

  ///

  const blocks: VibeScriptBlock[] = [];

  while (!parserIsEof(parser)) {
    const block = parseBlock(parser);

    if (block instanceof Error) {
      return block;
    }

    blocks.push(block);
  }

  return blocks;
};

export const parseVibeScript = (
  contents: string
): VibeScriptBlock[] | Error => {
  const source: Source = { contents };

  const tokens = lexVibeScriptTokensFromSource(source);

  if (tokens instanceof Error) {
    return tokens;
  }

  const parser: Parser<VibeScriptToken> = {
    source,
    tokens,
    position: 0,
  };

  const blocks = parseBlocks(parser);

  if (blocks instanceof Error) {
    return blocks;
  }

  return blocks;
};

// type checker

export type CheckedVibeScriptFileIncludeBlock = {
  kind: 'file-include';
  parent: string;
  resolvedParent: string;
  files: string[];
};

export type CheckedVibeScriptCommentBlock = {
  kind: 'comment';
  block: VibeScriptRegularCommentBlock;
};

export type CheckedVibeScriptTextPart = { kind: 'quasis'; value: string };
// | { kind: 'expr'; expr: CheckedVibeScriptExpression; }

export type CheckedVibeScriptTextBlock = {
  kind: 'text';
  parts: CheckedVibeScriptTextPart[];
  block: VibeScriptTextBlock;
};

export type CheckedVibeScriptBlock =
  | CheckedVibeScriptFileIncludeBlock
  | CheckedVibeScriptCommentBlock
  | CheckedVibeScriptTextBlock;

export type CheckedVibeScript = {
  blocks: CheckedVibeScriptBlock[];
};

// currently only parent: '~/...' works
const typeCheckStatement = (
  stmt: VibeScriptStatement
): CheckedVibeScriptBlock | Error => {
  if ('parent' in stmt && 'files' in stmt) {
    const parent = stmt.parent;

    let resolvedParent = stmt.parent;

    if (parent.startsWith('~/')) {
      resolvedParent = path.join(os.homedir(), parent.slice(2));
    } else if (parent.startsWith('~')) {
      return new Error(
        `vibe script file include parent path starting with '~' must be followed by a '/' ie '~/...'`
      );
    }

    ///

    if (!fsSync.existsSync(resolvedParent)) {
      return new Error(
        `vibe script file include parent path does not exist: ${resolvedParent}`
      );
    }

    ///

    const files = stmt.files;

    if (files.length === 0) {
      return new Error(
        'vibe script file include must include at least one file path'
      );
    }

    ///

    for (const filePath of files) {
      const resolvedFilePath = path.join(resolvedParent, filePath);

      if (!fsSync.existsSync(resolvedFilePath)) {
        return new Error(
          `vibe script file include file does not exist: ${resolvedFilePath}`
        );
      }
    }

    ///

    return {
      kind: 'file-include',
      parent: stmt.parent,
      resolvedParent,
      files: stmt.files,
    };
  }

  return new Error('unknown vibe script statement while type checking');
};

const typeCheckTextBlock = (
  block: VibeScriptTextBlock
): CheckedVibeScriptTextBlock | Error => {
  const parts: CheckedVibeScriptTextPart[] = [];

  for (const part of block.parts) {
    if (!part || typeof part !== 'object') {
      return new Error('invalid vibe script text literal part');
    }

    if ('quasis' in part) {
      parts.push({
        kind: 'quasis',
        value: part.quasis,
      });

      continue;
    }

    if ('expr' in part) {
      return new Error('not implemented: typeCheckTextBlock expr part');
    }

    return new Error('unknown vibe script text literal part');
  }

  return {
    kind: 'text',
    parts,
    block,
  };
};

export const typeCheckVibeScript = (
  blocks: VibeScriptBlock[]
): CheckedVibeScript | Error => {
  const checkedBlocks: CheckedVibeScriptBlock[] = [];

  for (const block of blocks) {
    // statement comment block
    if (block && typeof block === 'object' && 'statement' in block) {
      const stmt = block.statement;

      const checkedStmt = typeCheckStatement(stmt);

      if (checkedStmt instanceof Error) {
        return checkedStmt;
      }

      checkedBlocks.push(checkedStmt);

      continue;
    }

    // regular comment block

    if (block && typeof block === 'object' && 'comment' in block) {
      checkedBlocks.push({
        kind: 'comment',
        block: block,
      });

      continue;
    }

    // text block

    if (block && typeof block === 'object' && 'parts' in block) {
      const checkedText = typeCheckTextBlock(block);

      if (checkedText instanceof Error) {
        return checkedText;
      }

      checkedBlocks.push(checkedText);

      continue;
    }

    return new Error('unknown vibe script block kind while type checking');
  }

  return {
    blocks: checkedBlocks,
  };
};
