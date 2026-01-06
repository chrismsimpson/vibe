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
import { llmThinkingLevels, type LLMThinking } from './genai-base';
import {
  isLLMModel,
  isLLMProvider,
  type LLMModel,
  type LLMProvider,
} from './genai';

// lexing

type SlopTokenKind = 'text' | 'punc' | 'newline' | 'whitespace' | 'eof';

type SlopToken = {
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

    if (peek === '-' && lexerMatch(lexer, '->', 1)) {
      const startPunc = lexer.position;

      lexer.position += 3;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

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
  const lexer = {
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
  number: number; // number of preceding `#`
  parts: SlopTextLiteralPart[]; // parts delimited by things like `inline` runs
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

const parseHeadingBlock = (
  parser: Parser<SlopToken>
): SlopHeadingBlock | Error => {
  return new Error('not implemented');
};

const parseCodeBlock = (parser: Parser<SlopToken>): SlopCodeBlock | Error => {
  return new Error('not implemented');
};

const parseTextLikeBlock = (
  parser: Parser<SlopToken>
): SlopTextLiteralBlock | SlopListBlock | Error => {
  // establish if it's a list of 'things' (ie N consistently
  // bulleted lines), otherwise it's a text literal block

  return new Error('not implemented');
};

const parseBlock = (parser: Parser<SlopToken>): SlopBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script block');
  }

  ///

  const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const nextPeek = parser.tokens[nextPtr];

  if (nextPeek?.kind === 'punc' && nextPeek.value === '#') {
    return parseHeadingBlock(parser);
  }

  if (nextPeek?.kind === 'punc' && nextPeek.value === '```') {
    return parseCodeBlock(parser);
  }

  return parseTextLikeBlock(parser);
};
