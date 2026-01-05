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

type LLOutTokenKind = 'text' | 'punc' | 'newline' | 'whitespace' | 'eof';

type LLOutToken = {
  kind: LLOutTokenKind;
  value?: string | null;
};

const isLLOutTokenPunc = (char: string): boolean => {
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
