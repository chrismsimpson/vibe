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
import { llmThinkingLevels, type LLMThinking } from './llm-base';
import {
  isLLMModel,
  isLLMProvider,
  type LLMModel,
  type LLMProvider,
} from './llm';

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
    char === '`' ||
    char === ':' ||
    char === ';' ||
    char === '.' ||
    char === '-' ||
    char === '_' ||
    char === '@' ||
    char === '~' ||
    char === '#' ||
    // char === '$' || // excluding dollar sign so string interpolation works correctly
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

    // operator punc

    if (peek === '=' && lexerMatch(lexer, '==', 1)) {
      const startPunc = lexer.position;

      lexer.position += 3;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '!' && lexerMatch(lexer, '==', 1)) {
      const startPunc = lexer.position;

      lexer.position += 3;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '=' && lexerMatch(lexer, '=', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '!' && lexerMatch(lexer, '=', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '<' && lexerMatch(lexer, '=', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '>' && lexerMatch(lexer, '=', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '&' && lexerMatch(lexer, '&', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '|' && lexerMatch(lexer, '|', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '+' && lexerMatch(lexer, '+', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '-' && lexerMatch(lexer, '-', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

      return {
        kind: 'punc',
        value: lexer.source.contents.slice(startPunc, lexer.position),
      };
    }

    if (peek === '=' && lexerMatch(lexer, '>', 1)) {
      const startPunc = lexer.position;

      lexer.position += 2;

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

export type VibeScriptNameType = {
  name: string;
};

export type VibeScriptArrayType = {
  arrayOf: VibeScriptType;
};

export type VibeScriptTupleType = {
  tuple: VibeScriptType[];
};

export type VibeScriptObjectField = {
  key: string;
  type: VibeScriptType;
};

export type VibeScriptObjectType = {
  object: VibeScriptObjectField[];
};

// biome-ignore lint/complexity/noBannedTypes: ¯\_(ツ)_/¯
export type VibeScriptEmptyType = {};

export type VibeScriptType =
  | VibeScriptNameType
  | VibeScriptArrayType
  | VibeScriptTupleType
  | VibeScriptObjectType
  | VibeScriptEmptyType;

export type VibeScriptTakeLastTransform = {
  kind: 'takeLast';
  count: number | null;
};

export type VibeScriptMaxByTransform = {
  kind: 'maxBy';
  key: string;
};

export type VibeScriptTransform =
  | VibeScriptTakeLastTransform
  | VibeScriptMaxByTransform;

export type VibeScriptPreambleBlock = {
  expects?: VibeScriptType | null;
  thinking?: string | null;
  provider?: string | null;
  model?: string | null;
  transforms?: VibeScriptTransform[] | null;
};

export type VibeScriptStep = {
  step: string;
  expects?: VibeScriptType | null;
  thinking?: string | null;
  provider?: string | null;
  model?: string | null;
  transforms?: VibeScriptTransform[] | null;
  outputName?: string | null;
  inputName?: string | null;
};

export type VibeScriptVarDecl = {
  name: string;
  type?: VibeScriptType;
};

export enum VibeScriptExpressionKind {
  WithAssignments = 'WithAssignments',
  WithoutAssignments = 'WithoutAssignments',
}

// expressions

export type VibeScriptBooleanExpression = {
  value: boolean;
};

export type VibeScriptNumberExpression = {
  value: number;
};

export type VibeScriptStringExpression = {
  value: string;
};

export type VibeScriptVarExpression = {
  varName: string;
};

export type VibeScriptCall = {
  name: string;
  args: VibeScriptExpression[];
};

export type VibeScriptCallExpression = {
  call: VibeScriptCall;
};

export enum VibeScriptUnaryOperator {
  PreIncrement = 'PreIncrement',
  PostIncrement = 'PostIncrement',
  PreDecrement = 'PreDecrement',
  PostDecrement = 'PostDecrement',
  LogicalNot = 'LogicalNot',
}

export type VibeScriptUnaryOperatorExpression = {
  expr: VibeScriptExpression;
  operator: VibeScriptUnaryOperator;
};

export enum VibeScriptBinaryOperator {
  Add = 'Add',
  Subtract = 'Subtract',
  Multiply = 'Multiply',
  Divide = 'Divide',
  Modulo = 'Modulo',
  Equal = 'Equal',
  NotEqual = 'NotEqual',
  LessThan = 'LessThan',
  GreaterThan = 'GreaterThan',
  LessThanOrEqual = 'LessThanOrEqual',
  GreaterThanOrEqual = 'GreaterThanOrEqual',
  LogicalAnd = 'LogicalAnd',
  LogicalOr = 'LogicalOr',
  Assign = 'Assign',
}

export type VibeScriptBinaryOperatorExpression = {
  lhs: VibeScriptExpression;
  operator: VibeScriptBinaryOperator;
  rhs: VibeScriptExpression;
};

export type VibeScriptOperator =
  | VibeScriptUnaryOperator
  | VibeScriptBinaryOperator;

export type VibeScriptOperatorExpression = {
  operator: VibeScriptOperator;
};

export type VibeScriptArrayLiteralExpression = {
  array: VibeScriptExpression[];
};

export type VibeScriptLambdaExpression = {
  lambda: {
    body: VibeScriptExpression;
  };
};

// parsed only inside [ ... ] “loose lists”

export type VibeScriptNameOrStringExpression = {
  nameOrString: string;
};

export type VibeScriptExpression =
  | VibeScriptBooleanExpression
  | VibeScriptNumberExpression
  | VibeScriptStringExpression
  | VibeScriptVarExpression
  | VibeScriptCallExpression
  | VibeScriptUnaryOperatorExpression
  | VibeScriptBinaryOperatorExpression
  | VibeScriptOperatorExpression
  | VibeScriptArrayLiteralExpression
  | VibeScriptLambdaExpression
  | VibeScriptNameOrStringExpression;

// statements

export type VibeScriptVarDeclarationStatement = {
  varDecl: VibeScriptVarDecl;
  expr: VibeScriptExpression;
};

export type VibeScriptFileIncludeBlock = {
  parent: string;
  files: string[];
};

export type VibeScriptStatement =
  | VibeScriptPreambleBlock
  | VibeScriptVarDeclarationStatement
  | VibeScriptStep
  | VibeScriptFileIncludeBlock;

// blocks

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

export type VibeScriptTextLiteralExpression = {
  expr: VibeScriptExpression;
};

export type VibeScriptTextLiteralPart =
  | VibeScriptTextLiteralQuasis
  | VibeScriptTextLiteralExpression;

export type VibeScriptTextBlock = {
  parts: VibeScriptTextLiteralPart[];
};

export type VibeScriptBlock = VibeScriptCommentBlock | VibeScriptTextBlock;

const parseType = (parser: Parser<VibeScriptToken>): VibeScriptType | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script type');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const startToken = parser.tokens[parser.position];

  if (startToken === undefined) {
    return new Error(
      'unexpected undefined start token parsing vibe script type'
    );
  }

  ///

  let baseType: VibeScriptType | null = null;

  ///

  // name type

  if (baseType === null && startToken.kind === 'text') {
    const name = startToken.value;

    if (name == null || name.length === 0) {
      return new Error(
        'expected name value in vibe script name type, got empty string'
      );
    }

    parser.position += 1;

    baseType = {
      name,
    };
  }

  ///

  // tuple type: [a, b, ...]

  if (
    baseType === null &&
    startToken.kind === 'punc' &&
    startToken.value === '['
  ) {
    parser.position += 1; // consume '[' token

    ///

    const tuple: VibeScriptType[] = [];

    while (!parserIsEof(parser)) {
      parser.position = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      const tuplePeek = parser.tokens[parser.position];

      if (!tuplePeek) {
        return new Error(
          'unexpected undefined token parsing vibe script tuple type'
        );
      }

      if (tuplePeek.kind === 'punc' && tuplePeek.value === ']') {
        parser.position += 1; // consume ']' token

        baseType = {
          tuple,
        };

        break;
      }

      const elementType = parseType(parser);

      if (elementType instanceof Error) {
        return elementType;
      }

      tuple.push(elementType);

      ///

      parser.position = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      ///

      const delim = parser.tokens[parser.position];

      if (!delim) {
        return new Error(
          'unexpected end of input parsing vibe script tuple type'
        );
      }

      if (delim.kind === 'punc' && delim.value === ',') {
        parser.position += 1; // consume ',' token

        continue;
      }

      if (delim.kind === 'punc' && delim.value === ']') {
        parser.position += 1; // consume ']' token

        baseType = {
          tuple,
        };

        break;
      }

      return new Error(
        `expected ',' or ']' token in vibe script tuple type, got '${delim.value}'`
      );
    }
  }

  ///

  // object type: { "k": T, ... }

  if (
    baseType === null &&
    startToken.kind === 'punc' &&
    startToken.value === '{'
  ) {
    parser.position += 1; // consume '{' token

    ///

    const fields: VibeScriptObjectField[] = [];

    while (!parserIsEof(parser)) {
      parser.position = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      const fieldPeek = parser.tokens[parser.position];

      if (!fieldPeek) {
        return new Error(
          'unexpected undefined token parsing vibe script object type'
        );
      }

      if (fieldPeek.kind === 'punc' && fieldPeek.value === '}') {
        parser.position += 1; // consume '}' token

        baseType = {
          object: fields,
        };

        break;
      }

      // key

      let key: string | null = null;

      if (fieldPeek.kind === 'text') {
        if (fieldPeek.value == null || fieldPeek.value.length === 0) {
          return new Error(
            'expected key value in vibe script object field, got empty string'
          );
        }

        key = fieldPeek.value;

        parser.position += 1; // consume key token
      } else if (fieldPeek.kind === 'punc' && fieldPeek.value === '"') {
        parser.position += 1;

        let acc = '';

        while (!parserIsEof(parser)) {
          const t = parser.tokens[parser.position];

          if (!t) {
            return new Error(
              'unexpected end of input parsing quoted object key'
            );
          }

          if (t.kind === 'punc' && t.value === '"') {
            break;
          }

          acc += t.value ?? '';

          parser.position += 1;
        }

        const closeQuote = parser.tokens[parser.position];

        if (closeQuote?.kind !== 'punc' || closeQuote.value !== '"') {
          return new Error('unterminated quoted object key');
        }

        parser.position += 1;

        key = acc;
      } else {
        return new Error(
          `expected key token in vibe script object field, got '${fieldPeek.value}'`
        );
      }

      if (key == null) {
        return new Error(
          'expected key value in vibe script object field, got null'
        );
      }

      ///

      parser.position = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      const colonToken = parser.tokens[parser.position];

      if (colonToken === undefined) {
        return new Error(
          'unexpected undefined token parsing vibe script object field colon'
        );
      }

      if (colonToken.kind !== 'punc' || colonToken.value !== ':') {
        return new Error(
          `expected ':' token in vibe script object field, got '${colonToken.value}'`
        );
      }

      parser.position += 1; // consume ':' token

      ///

      const valueType = parseType(parser);

      if (valueType instanceof Error) {
        return valueType;
      }

      fields.push({
        key,
        type: valueType,
      });

      ///

      parser.position = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      const delim = parser.tokens[parser.position];

      if (!delim) {
        return new Error(
          'unexpected end of input parsing vibe script object type'
        );
      }

      if (delim.kind === 'punc' && delim.value === ',') {
        parser.position += 1; // consume ',' token

        continue;
      }

      if (delim.kind === 'punc' && delim.value === '}') {
        parser.position += 1; // consume '}' token

        baseType = {
          object: fields,
        };

        break;
      }

      return new Error(
        `expected ',' or '}' token in vibe script object type, got '${delim.value}'`
      );
    }
  }

  ///

  if (baseType === null) {
    return new Error(
      `unable to parse vibe script type starting with token '${startToken.value}'`
    );
  }

  ///

  // postfix arrays: T[] (including nested)

  while (!parserIsEof(parser)) {
    const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    const nextTok = parser.tokens[nextPtr];

    if (nextTok?.kind !== 'punc' || nextTok.value !== '[') {
      break;
    }

    const closePtr = skipWhitespaceOrNewlines(parser.tokens, nextPtr + 1);

    const closeTok = parser.tokens[closePtr];

    if (closeTok?.kind !== 'punc' || closeTok.value !== ']') {
      break;
    }

    // consume '[' ']'
    parser.position = closePtr + 1;

    baseType = {
      arrayOf: baseType,
    };
  }

  return baseType;
};

const parseTransform = (
  parser: Parser<VibeScriptToken>
): VibeScriptTransform | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing transform');
  }

  ///

  const ptr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const t = parser.tokens[ptr];

  if (t?.kind !== 'text') {
    return new Error('expected transform keyword');
  }

  parser.position = ptr;

  ///

  if (t.value === 'takeLast') {
    return parseTakeLastTransform(parser);
  }

  if (t.value === 'maxBy') {
    return parseMaxByTransform(parser);
  }

  return new Error(`unknown transform '${t.value}'`);
};

const parseTakeLastTransform = (
  parser: Parser<VibeScriptToken>
): VibeScriptTakeLastTransform | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing takeLast transform');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const kw = parser.tokens[parser.position];

  if (kw?.kind !== 'text' || kw.value !== 'takeLast') {
    return new Error(
      `expected 'takeLast' transform keyword, got '${kw?.kind} ${kw?.value}'`
    );
  }

  parser.position += 1;

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const next = parser.tokens[parser.position];

  // no args form
  if (next?.kind !== 'punc' || next.value !== '(') {
    return {
      kind: 'takeLast',
      count: null,
    };
  }

  // with args form: takeLast(N)

  parser.position += 1;

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const nTok = parser.tokens[parser.position];

  if (nTok?.kind !== 'text' || nTok.value == null) {
    return new Error(
      `expected number literal in takeLast(...), got '${nTok?.kind} ${nTok?.value}'`
    );
  }

  const n = Number(nTok.value);

  if (!Number.isInteger(n) || Number.isNaN(n)) {
    return new Error(
      `takeLast(...) argument must be an integer, got '${nTok.value}'`
    );
  }

  if (n < 0) {
    return new Error(
      `takeLast(...) argument must be >= 0, got '${nTok.value}'`
    );
  }

  parser.position += 1;

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const close = parser.tokens[parser.position];

  if (close?.kind !== 'punc' || close.value !== ')') {
    return new Error(
      `expected ')' closing takeLast(...), got '${close?.kind} ${close?.value}'`
    );
  }

  parser.position += 1;

  ///

  return {
    kind: 'takeLast',
    count: n,
  };
};

const parseMaxByTransform = (
  parser: Parser<VibeScriptToken>
): VibeScriptMaxByTransform | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing maxBy transform');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const kw = parser.tokens[parser.position];

  if (kw?.kind !== 'text' || kw.value !== 'maxBy') {
    return new Error(
      `expected 'maxBy' transform keyword, got '${kw?.kind} ${kw?.value}'`
    );
  }

  parser.position += 1;

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const open = parser.tokens[parser.position];

  if (open?.kind !== 'punc' || open.value !== '(') {
    return new Error(
      `expected '(' opening maxBy(...), got '${open?.kind} ${open?.value}'`
    );
  }

  parser.position += 1;

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const next = parser.tokens[parser.position];

  let key: string | null = null;

  if (next?.kind === 'text') {
    if (next.value == null || next.value.length === 0) {
      return new Error('maxBy(...) key cannot be empty');
    }

    key = next.value;

    parser.position += 1;
  } else if (next?.kind === 'punc' && next.value === '"') {
    parser.position += 1;

    let acc = '';

    while (!parserIsEof(parser)) {
      const t = parser.tokens[parser.position];

      if (!t) {
        return new Error('unexpected end of input parsing quoted maxBy key');
      }

      if (t.kind === 'punc' && t.value === '"') {
        break;
      }

      acc += t.value ?? '';

      parser.position += 1;
    }

    const closeQuote = parser.tokens[parser.position];

    if (closeQuote?.kind !== 'punc' || closeQuote.value !== '"') {
      return new Error('unterminated quoted maxBy key');
    }

    parser.position += 1;

    if (acc.length === 0) {
      return new Error('maxBy(...) key cannot be empty');
    }

    key = acc;
  } else {
    return new Error(
      `expected identifier or quoted string in maxBy(...), got '${next?.kind} ${next?.value}'`
    );
  }

  if (key == null) {
    return new Error('failed to parse maxBy(...) key');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const close = parser.tokens[parser.position];

  if (close?.kind !== 'punc' || close.value !== ')') {
    return new Error(
      `expected ')' closing maxBy(...), got '${close?.kind} ${close?.value}'`
    );
  }

  parser.position += 1;

  ///

  return {
    kind: 'maxBy',
    key,
  };
};

// parse preamble

const consumeClauseValue = (parser: Parser<VibeScriptToken>): string => {
  const parts: string[] = [];

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    if (t.kind === 'newline') {
      break;
    }

    if (t.kind === 'punc' && (t.value === ';' || t.value === '-->')) {
      break; // do not consume delimiter
    }

    if (t.value) {
      parts.push(t.value);
    }

    parser.position += 1;
  }

  return parts.join('').trim();
};

const parseKeyValueClause = (
  parser: Parser<VibeScriptToken>,
  key: 'thinking' | 'provider' | 'model'
): string | Error => {
  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const kw = parser.tokens[parser.position];

  if (kw?.kind !== 'text' || kw.value !== key) {
    return new Error(`internal error: expected '${key}' keyword`);
  }

  parser.position += 1;

  const colonPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const colonTok = parser.tokens[colonPtr];

  if (colonTok?.kind !== 'punc' || colonTok.value !== ':') {
    return new Error(`expected ':' after '${key}'`);
  }

  parser.position = colonPtr + 1;

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const value = consumeClauseValue(parser);

  if (value.length === 0) {
    return new Error(`expected value for '${key}:'`);
  }

  return value;
};

const BUILTIN_TRANSFORMS: string[] = ['takeLast', 'maxBy'];

const PREAMBLE_START_KEYWORDS: string[] = [
  ...BUILTIN_TRANSFORMS,
  'expect',
  'thinking',
  'provider',
  'model',
] as const;

const isPreambleStartKeyword = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }

  return PREAMBLE_START_KEYWORDS.includes(value);
};

const parsePreamble = (
  parser: Parser<VibeScriptToken>,
  options?: {
    stopOnUnknownClause?: boolean;
  }
): VibeScriptPreambleBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing expects statement');
  }

  const stopOnUnknownClause = options?.stopOnUnknownClause ?? false;

  let expects: VibeScriptType | null = null;
  let thinking: string | null = null;
  let provider: string | null = null;
  let model: string | null = null;
  const transforms: VibeScriptTransform[] = [];

  while (!parserIsEof(parser)) {
    const ptr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    const t = parser.tokens[ptr];

    if (!t) {
      break;
    }

    // stop before the end-of-comment delimiter

    if (t.kind === 'punc' && t.value === '-->') {
      parser.position = ptr; // do not consume '-->'

      break;
    }

    // consume optional clause separator

    if (t.kind === 'punc' && t.value === ';') {
      parser.position = ptr + 1;

      const clauseStartPtr = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      parser.position = clauseStartPtr;
    } else {
      parser.position = ptr;
    }

    const kw = parser.tokens[parser.position];

    if (!kw || kw.kind !== 'text') {
      // iIf we are in a step, we should stop at unknown clauses,
      // otherwise, we might be at the end of the preamble

      if (stopOnUnknownClause) {
        break;
      }

      // tf not a text keyword, it's not a clause we can parse here.

      const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

      if (parser.tokens[nextPtr]?.value === '-->') {
        parser.position = nextPtr;

        break;
      }

      // tolerate and consume one token to prevent infinite loops on malformed input

      parser.position += 1;

      continue;
    }

    if (kw.value === 'expect') {
      parser.position += 1; // consume 'expect' token

      const expectColonPtr = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      const expectColonToken = parser.tokens[expectColonPtr];

      if (
        !expectColonToken ||
        expectColonToken.kind !== 'punc' ||
        expectColonToken.value !== ':'
      ) {
        return new Error(
          `expected ':' token after 'expect', got '${expectColonToken?.value ?? 'nothing'}'`
        );
      }

      parser.position = expectColonPtr + 1; // consume ':' token

      parser.position = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      const expectType = parseType(parser);

      if (expectType instanceof Error) {
        return expectType;
      }

      if (expects !== null) {
        return new Error('expects already set in this block');
      }

      expects = expectType;

      continue;
    }

    if (kw.value === 'thinking') {
      const v = parseKeyValueClause(parser, 'thinking');

      if (v instanceof Error) {
        return v;
      }

      if (thinking !== null) {
        return new Error('thinking already set in this expect block');
      }

      thinking = v;

      continue;
    }

    if (kw.value === 'provider') {
      const v = parseKeyValueClause(parser, 'provider');

      if (v instanceof Error) {
        return v;
      }

      if (provider !== null) {
        return new Error('provider already set in this expect block');
      }

      provider = v;

      continue;
    }

    if (kw.value === 'model') {
      const v = parseKeyValueClause(parser, 'model');

      if (v instanceof Error) {
        return v;
      }

      if (model !== null) {
        return new Error('model already set in this expect block');
      }

      model = v;

      continue;
    }

    if (kw.value && BUILTIN_TRANSFORMS.includes(kw.value)) {
      const tr = parseTransform(parser);

      if (tr instanceof Error) {
        return tr;
      }

      transforms.push(tr);

      continue;
    }

    // in step contexts: stop before unknown clauses so parseStep can handle them

    if (stopOnUnknownClause) {
      // we already advanced the parser position, so we need to rewind to before the keyword

      parser.position = ptr;

      break;
    }

    // tolerate unknown clause head by consuming it and its value

    parser.position += 1;

    consumeClauseValue(parser);
  }

  return {
    expects,
    thinking,
    provider,
    model,
    transforms: transforms.length > 0 ? transforms : null,
  };
};

// parse step

const parseStep = (parser: Parser<VibeScriptToken>): VibeScriptStep | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing step statement');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const nextToken = parser.tokens[parser.position];

  if (nextToken === undefined) {
    return new Error(
      'unexpected undefined token parsing step statement (expected "step")'
    );
  }

  if (nextToken.kind !== 'text' || nextToken.value !== 'step') {
    return new Error(
      `expected step statement 'step' keyword, got '${nextToken.kind} ${nextToken.value}'`
    );
  }

  parser.position = skipWhitespaceOrNewlines(
    parser.tokens,
    parser.position + 1
  );

  ///

  const colonToken = parser.tokens[parser.position];

  if (colonToken === undefined) {
    return new Error(
      'unexpected undefined token parsing step statement (expected ":")'
    );
  }

  if (colonToken.kind !== 'punc' || colonToken.value !== ':') {
    return new Error(
      `expected step name colon ':', got '${colonToken.kind} ${colonToken.value}'`
    );
  }

  parser.position += 1;

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const nameToken = parser.tokens[parser.position];

  if (nameToken === undefined) {
    return new Error(
      'unexpected undefined token parsing step statement (expected step name)'
    );
  }

  if (nameToken.kind !== 'text' || nameToken.value == null) {
    return new Error(
      `expected step name token (text), got '${nameToken.kind} ${nameToken.value}'`
    );
  }

  parser.position += 1;

  ///

  let expects: VibeScriptType | null = null;

  let thinking: string | null = null;
  let provider: string | null = null;
  let model: string | null = null;
  let transforms: VibeScriptTransform[] | null = null;

  let outputName: string | null = null;

  let inputName: string | null = null;

  // consume optional clauses up to '-->' without consuming '-->' itself

  while (!parserIsEof(parser)) {
    const ptr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    const t = parser.tokens[ptr];

    if (!t) {
      break;
    }

    if (t.kind === 'punc' && t.value === '-->') {
      parser.position = ptr;

      break;
    }

    if (t.kind === 'punc' && t.value === ';') {
      parser.position = ptr + 1;

      ///

      parser.position = skipWhitespaceOrNewlines(
        parser.tokens,
        parser.position
      );

      const kw = parser.tokens[parser.position];

      if (kw?.kind !== 'text' || kw.value == null) {
        return new Error(
          `expected clause keyword after ';' in step statement, got '${kw?.kind} ${kw?.value}'`
        );
      }

      if (kw.value === 'expect') {
        const preamble = parsePreamble(parser, {
          stopOnUnknownClause: true,
        });

        if (preamble instanceof Error) {
          return preamble;
        }

        // merge preamble values without allowing silent overrides.

        if (preamble.expects !== null) {
          if (expects !== null) {
            return new Error('step expects already set');
          }

          expects = preamble.expects ?? null;
        }

        if (preamble.thinking !== null) {
          if (thinking !== null) {
            return new Error('step thinking already set');
          }

          thinking = preamble.thinking ?? null;
        }

        if (preamble.provider !== null) {
          if (provider !== null) {
            return new Error('step provider already set');
          }

          provider = preamble.provider ?? null;
        }

        if (preamble.model !== null) {
          if (model !== null) {
            return new Error('step model already set');
          }

          model = preamble.model ?? null;
        }

        if (preamble.transforms !== null) {
          if (transforms !== null) {
            return new Error('step transforms already set');
          }

          transforms = preamble.transforms ?? null;
        }

        continue;
      }

      if (kw.value === 'thinking') {
        const v = parseKeyValueClause(parser, 'thinking');

        if (v instanceof Error) {
          return v;
        }

        if (thinking !== null) {
          return new Error('step thinking already set');
        }

        thinking = v;

        continue;
      }

      if (kw.value === 'provider') {
        const v = parseKeyValueClause(parser, 'provider');

        if (v instanceof Error) {
          return v;
        }

        if (provider !== null) {
          return new Error('step provider already set');
        }

        provider = v;

        continue;
      }

      if (kw.value === 'model') {
        const v = parseKeyValueClause(parser, 'model');

        if (v instanceof Error) {
          return v;
        }

        if (model !== null) {
          return new Error('step model already set');
        }

        model = v;

        continue;
      }

      if (kw.value === 'named') {
        if (outputName !== null) {
          return new Error('step output name already set');
        }

        parser.position += 1;

        ///

        parser.position = skipWhitespaceOrNewlines(
          parser.tokens,
          parser.position
        );

        const nameTok = parser.tokens[parser.position];

        if (nameTok?.kind !== 'text' || nameTok.value == null) {
          return new Error(
            `expected output name after 'named', got '${nameTok?.kind} ${nameTok?.value}'`
          );
        }

        if (nameTok.value.length === 0) {
          return new Error('step output name cannot be empty');
        }

        outputName = nameTok.value;

        parser.position += 1;

        continue;
      }

      if (kw.value === 'from') {
        if (inputName !== null) {
          return new Error('step input name already set');
        }

        parser.position += 1;

        ///

        parser.position = skipWhitespaceOrNewlines(
          parser.tokens,
          parser.position
        );

        const nameTok = parser.tokens[parser.position];

        if (nameTok?.kind !== 'text' || nameTok.value == null) {
          return new Error(
            `expected input name after 'from', got '${nameTok?.kind} ${nameTok?.value}'`
          );
        }

        if (nameTok.value.length === 0) {
          return new Error('step input name cannot be empty');
        }

        inputName = nameTok.value;

        parser.position += 1;

        continue;
      }

      // tolerate unknown clause

      parser.position += 1;

      continue;
    }

    parser.position = ptr + 1;
  }

  if (parserIsEof(parser)) {
    return new Error(
      'unexpected end of file parsing step statement (missing "-->")'
    );
  }

  return {
    step: nameToken.value,
    expects,
    thinking,
    provider,
    model,
    transforms,
    outputName,
    inputName,
  };
};

// parse expression

const parseStringLiteral = (
  parser: Parser<VibeScriptToken>,
  quote: '"' | "'"
): VibeScriptStringExpression | Error => {
  const open = parser.tokens[parser.position];

  if (open?.kind !== 'punc' || open.value !== quote) {
    return new Error('internal error: expected string quote');
  }

  parser.position += 1; // consume opening quote

  let acc = '';

  let escaped = false;

  const decodeEscape = (ch: string): string => {
    switch (ch) {
      case 'n':
        return '\n';

      case 'r':
        return '\r';

      case 't':
        return '\t';

      case '\\':
        return '\\';

      case '"':
        return '"';

      case "'":
        return "'";

      default:
        // permissive: "\x" => "x"
        return ch;
    }
  };

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    if (t.kind === 'newline') {
      return new Error('unterminated string literal (newline)');
    }

    // start escape
    if (!escaped && t.kind === 'punc' && t.value === '\\') {
      escaped = true;

      parser.position += 1;

      continue;
    }

    // end quote (only if not escaped)
    if (!escaped && t.kind === 'punc' && t.value === quote) {
      parser.position += 1; // consume closing quote

      return { value: acc };
    }

    const v = t.value ?? '';

    if (escaped) {
      if (v.length === 0) {
        escaped = false;

        parser.position += 1;

        continue;
      }

      // consume exactly one escape char from this token,
      // and then append the remainder (so "\nWorld" works)

      const head = v[0] as string;

      const tail = v.slice(1);

      acc += decodeEscape(head);

      acc += tail;

      escaped = false;

      parser.position += 1;

      continue;
    }

    acc += v;

    parser.position += 1;
  }

  if (escaped) {
    return new Error('unterminated string literal (eof after escape)');
  }

  return new Error('unterminated string literal (eof)');
};

const parseArrayLiteral = (
  parser: Parser<VibeScriptToken>
): VibeScriptArrayLiteralExpression | Error => {
  const open = parser.tokens[parser.position];
  if (open?.kind !== 'punc' || open.value !== '[') {
    return new Error('internal error: expected "["');
  }

  parser.position += 1; // consume "["

  ///

  const elements: VibeScriptExpression[] = [];

  while (!parserIsEof(parser)) {
    parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    //

    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    // end

    if (t.kind === 'punc' && t.value === ']') {
      parser.position += 1; // consume "]"

      return { array: elements };
    }

    // tolerate stray commas/newlines

    if (t.kind === 'punc' && t.value === ',') {
      parser.position += 1;

      continue;
    }
    if (t.kind === 'newline') {
      parser.position += 1;

      continue;
    }

    // quoted string element

    if (t.kind === 'punc' && (t.value === '"' || t.value === "'")) {
      const s = parseStringLiteral(parser, t.value as '"' | "'");

      if (s instanceof Error) {
        return s;
      }

      elements.push(s);

      continue;
    }

    // “loose element”: consume until newline / "," / "]"

    const parts: string[] = [];

    while (!parserIsEof(parser)) {
      const x = parser.tokens[parser.position];

      if (!x) {
        break;
      }

      if (x.kind === 'newline') {
        break;
      }

      if (x.kind === 'punc' && (x.value === ',' || x.value === ']')) {
        break;
      }

      parts.push(x.value ?? '');

      parser.position += 1;
    }

    const raw = parts.join('').trim();

    if (raw.length === 0) {
      // consume newline if that was the delimiter and continue

      const delim = parser.tokens[parser.position];

      if (delim?.kind === 'newline') {
        parser.position += 1;
      }

      continue;
    }

    // contains spaces => string literal

    if (/\s/.test(raw)) {
      elements.push({ value: raw } as VibeScriptStringExpression);

      continue;
    }

    // number

    const asNumber = Number(raw);

    if (!Number.isNaN(asNumber)) {
      elements.push({ value: asNumber } as VibeScriptNumberExpression);

      continue;
    }

    // bareword with late-binding semantics

    elements.push({ nameOrString: raw } as VibeScriptNameOrStringExpression);

    // optional delimiter consumption

    const delim = parser.tokens[parser.position];

    if (delim?.kind === 'punc' && delim.value === ',') {
      parser.position += 1;
    }

    if (delim?.kind === 'newline') {
      parser.position += 1;
    }
  }

  return new Error('unterminated array literal (missing "]")');
};

const parseOperand = (
  parser: Parser<VibeScriptToken>,
  exprKind: VibeScriptExpressionKind
): VibeScriptExpression | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script operand');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  let expr: VibeScriptExpression | null = null;

  ///

  const nextToken = parser.tokens[parser.position];

  if (nextToken === undefined) {
    return new Error('unexpected undefined token parsing vibe script operand');
  }

  const nextNextPtr = skipWhitespaceOrNewlines(
    parser.tokens,
    parser.position + 1
  );

  const nextNextToken = parser.tokens[nextNextPtr];

  ///

  // boolean true

  if (
    expr === null &&
    nextToken.kind === 'text' &&
    nextToken.value === 'true'
  ) {
    parser.position += 1;

    expr = {
      value: true,
    };
  }

  // boolean false

  if (
    expr === null &&
    nextToken.kind === 'text' &&
    nextToken.value === 'false'
  ) {
    parser.position += 1;

    expr = {
      value: false,
    };
  }

  // string literal

  if (
    expr === null &&
    nextToken.kind === 'punc' &&
    (nextToken.value === '"' || nextToken.value === "'")
  ) {
    const s = parseStringLiteral(parser, nextToken.value as '"' | "'");

    if (s instanceof Error) {
      return s;
    }
    expr = s;
  }

  // logical and (as operator-expression, mostly for error tolerance)

  if (expr === null && nextToken.kind === 'punc' && nextToken.value === '&&') {
    parser.position += 1;

    expr = {
      operator: VibeScriptBinaryOperator.LogicalAnd,
    };
  }

  // logical or (as operator-expression, mostly for error tolerance)

  if (expr === null && nextToken.kind === 'punc' && nextToken.value === '||') {
    parser.position += 1;

    expr = {
      operator: VibeScriptBinaryOperator.LogicalOr,
    };
  }

  // logical not

  if (expr === null && nextToken.kind === 'punc' && nextToken.value === '!') {
    parser.position += 1;

    const inner = parseOperand(parser, exprKind);

    if (inner instanceof Error) {
      return inner;
    }

    expr = {
      expr: inner,
      operator: VibeScriptUnaryOperator.LogicalNot,
    } as VibeScriptUnaryOperatorExpression;
  }

  // call

  if (
    expr === null &&
    nextToken.kind === 'text' &&
    nextNextToken?.kind === 'punc' &&
    nextNextToken.value === '('
  ) {
    const call = parseCall(parser);

    if (call instanceof Error) {
      return call;
    }

    expr = {
      call,
    };
  }

  // zero-arg lambda: () => <expr>

  if (expr === null && nextToken.kind === 'punc' && nextToken.value === '(') {
    const openPos = parser.position;

    const closePos = skipWhitespaceOrNewlines(parser.tokens, openPos + 1);

    const closeTok = parser.tokens[closePos];

    if (closeTok?.kind === 'punc' && closeTok.value === ')') {
      const arrowPos = skipWhitespaceOrNewlines(parser.tokens, closePos + 1);

      const arrowTok = parser.tokens[arrowPos];

      if (arrowTok?.kind === 'punc' && arrowTok.value === '=>') {
        // consume "(" ... ")" "=>"

        parser.position = arrowPos + 1;

        const body = parseExpression(
          parser,
          VibeScriptExpressionKind.WithAssignments
        );

        if (body instanceof Error) {
          return body;
        }

        expr = {
          lambda: { body },
        } as VibeScriptLambdaExpression;
      }
    }
  }

  // parenthesized expression

  if (expr === null && nextToken.kind === 'punc' && nextToken.value === '(') {
    parser.position += 1;

    ///

    parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    ///

    const _expr = parseExpression(parser, exprKind);

    if (_expr instanceof Error) {
      return _expr;
    }

    ///

    const closePtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    const closeTok = parser.tokens[closePtr];

    if (closeTok?.kind === 'punc' && closeTok.value === ')') {
      parser.position = closePtr + 1;
    } else {
      return new Error(
        `expected closing ')' in parenthesized vibe script expression, got '${closeTok?.kind} ${closeTok?.value}'`
      );
    }

    expr = _expr;
  }

  // array literal

  if (expr === null && nextToken.kind === 'punc' && nextToken.value === '[') {
    const arr = parseArrayLiteral(parser);

    if (arr instanceof Error) {
      return arr;
    }

    expr = arr;
  }

  // number literal (so 34, 2, 4 parse as numbers, not vars)

  if (expr === null && nextToken.kind === 'text') {
    const raw = nextToken.value;

    if (raw == null || raw.length === 0) {
      return new Error('unexpected empty text/name token parsing expression');
    }

    const asNumber = Number(raw);

    if (!Number.isNaN(asNumber)) {
      parser.position += 1;

      expr = {
        value: asNumber,
      } as VibeScriptNumberExpression;
    }
  }

  // var

  if (expr === null && nextToken.kind === 'text') {
    const raw = nextToken.value;

    if (raw == null || raw.length === 0) {
      return new Error(
        'unexpected empty text/name token parsing vibe script variable expression'
      );
    }

    parser.position += 1;

    expr = {
      varName: raw,
    };
  }

  ///

  if (expr === null) {
    return new Error('unexpected/unknown operand parsing expression');
  }

  // postfix operators

  while (!parserIsEof(parser)) {
    const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    const peek = parser.tokens[nextPtr];

    if (peek === undefined) {
      return new Error('unexpected undefined token parsing expression');
    }

    if (peek.kind === 'punc' && peek.value === '++') {
      parser.position = nextPtr + 1;

      expr = {
        expr,
        operator: VibeScriptUnaryOperator.PostIncrement,
      } as VibeScriptUnaryOperatorExpression;

      continue;
    }

    if (peek.kind === 'punc' && peek.value === '--') {
      parser.position = nextPtr + 1;

      expr = {
        expr,
        operator: VibeScriptUnaryOperator.PostDecrement,
      } as VibeScriptUnaryOperatorExpression;

      continue;
    }

    break;
  }

  return expr;
};

const parseOperatorWithAssignment = (
  parser: Parser<VibeScriptToken>
): VibeScriptOperatorExpression | null | Error => {
  if (parserIsEof(parser)) {
    return null;
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const nextToken = parser.tokens[parser.position];

  if (nextToken === undefined) {
    return null;
  }

  // end-of-expression delimiters (do not consume)
  if (
    nextToken.kind === 'punc' &&
    (nextToken.value === ')' ||
      nextToken.value === '}' ||
      nextToken.value === ',' ||
      nextToken.value === '-->')
  ) {
    return null;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '=') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Assign,
    } as VibeScriptOperatorExpression;
  }

  return parseOperator(parser);
};

const parseOperator = (
  parser: Parser<VibeScriptToken>
): VibeScriptOperatorExpression | null | Error => {
  if (parserIsEof(parser)) {
    return null;
  }

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const nextToken = parser.tokens[parser.position];

  if (nextToken === undefined) {
    return null;
  }

  // end-of-expression delimiters (do not consume)
  if (
    nextToken.kind === 'punc' &&
    (nextToken.value === ')' ||
      nextToken.value === '}' ||
      nextToken.value === ',' ||
      nextToken.value === '-->')
  ) {
    return null;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '+') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Add,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '-') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Subtract,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '*') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Multiply,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '/') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Divide,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '%') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Modulo,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '&&') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.LogicalAnd,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '||') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.LogicalOr,
    } as VibeScriptOperatorExpression;
  }

  // accept strict equality operators as aliases
  if (nextToken.kind === 'punc' && nextToken.value === '===') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Equal,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '!==') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.NotEqual,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '==') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.Equal,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '!=') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.NotEqual,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '<=') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.LessThanOrEqual,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '>=') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.GreaterThanOrEqual,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '<') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.LessThan,
    } as VibeScriptOperatorExpression;
  }

  if (nextToken.kind === 'punc' && nextToken.value === '>') {
    parser.position += 1;

    return {
      operator: VibeScriptBinaryOperator.GreaterThan,
    } as VibeScriptOperatorExpression;
  }

  return new Error('unsupported operator');
};

const getOperatorPrecedence = (expr: VibeScriptExpression): number => {
  if (!('operator' in expr)) {
    return 0;
  }

  switch (expr.operator) {
    case VibeScriptBinaryOperator.Multiply:
    case VibeScriptBinaryOperator.Modulo:
    case VibeScriptBinaryOperator.Divide:
      return 100;

    case VibeScriptBinaryOperator.Add:
    case VibeScriptBinaryOperator.Subtract:
      return 90;

    case VibeScriptBinaryOperator.LessThan:
    case VibeScriptBinaryOperator.LessThanOrEqual:
    case VibeScriptBinaryOperator.GreaterThan:
    case VibeScriptBinaryOperator.GreaterThanOrEqual:
    case VibeScriptBinaryOperator.Equal:
    case VibeScriptBinaryOperator.NotEqual:
      return 80;

    case VibeScriptBinaryOperator.LogicalAnd:
      return 70;

    case VibeScriptBinaryOperator.LogicalOr:
      return 69;

    case VibeScriptBinaryOperator.Assign:
      return 50;

    default:
      return 0;
  }
};

const parseExpression = (
  parser: Parser<VibeScriptToken>,
  exprKind: VibeScriptExpressionKind
): VibeScriptExpression | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing expression');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const exprStack: VibeScriptExpression[] = [];

  let lastPrecedence = 1000000;

  const lhs = parseOperand(parser, exprKind);

  if (lhs instanceof Error) {
    return lhs;
  }

  exprStack.push(lhs);

  const cont = true;

  while (cont && !parserIsEof(parser)) {
    let op: VibeScriptOperatorExpression | null | Error;

    if (exprKind === VibeScriptExpressionKind.WithAssignments) {
      op = parseOperatorWithAssignment(parser);
    } else {
      op = parseOperator(parser);
    }

    if (op instanceof Error) {
      return op;
    }

    if (op === null) {
      break;
    }

    ///

    const precedence = getOperatorPrecedence(op);

    if (parserIsEof(parser)) {
      return new Error(
        'unexpected end of file parsing expression/incomplete math expression'
      );
    }

    ///

    parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

    ///

    const rhs = parseOperand(parser, exprKind);

    if (rhs instanceof Error) {
      return rhs;
    }

    ///

    while (precedence <= lastPrecedence && exprStack.length > 1) {
      const _rhs = exprStack.pop() as VibeScriptExpression;

      const _op = exprStack.pop() as VibeScriptExpression;

      lastPrecedence = getOperatorPrecedence(_op);

      if (lastPrecedence < precedence) {
        exprStack.push(_op);

        exprStack.push(_rhs);

        break;
      }

      const _lhs = exprStack.pop() as VibeScriptExpression;

      if ('operator' in _op) {
        const combinedExpr: VibeScriptBinaryOperatorExpression = {
          lhs: _lhs,
          operator: _op.operator,
          rhs: _rhs,
        } as VibeScriptBinaryOperatorExpression;

        exprStack.push(combinedExpr);
      } else {
        return new Error('expected operator expression in expression stack');
      }
    }

    exprStack.push(op);

    exprStack.push(rhs);

    lastPrecedence = precedence;
  }

  while (exprStack.length !== 1) {
    const _rhs = exprStack.pop() as VibeScriptExpression;

    const _op = exprStack.pop() as VibeScriptExpression;

    const _lhs = exprStack.pop() as VibeScriptExpression;

    if ('operator' in _op) {
      const combinedExpr: VibeScriptBinaryOperatorExpression = {
        lhs: _lhs,
        operator: _op.operator,
        rhs: _rhs,
      } as VibeScriptBinaryOperatorExpression;

      exprStack.push(combinedExpr);
    } else {
      return new Error('expected operator expression in expression stack');
    }
  }

  const finalExpr = exprStack.pop();

  if (!finalExpr) {
    return new Error('failed to parse expression, empty expression stack');
  }

  return finalExpr;
};

// parse call

const parseCall = (parser: Parser<VibeScriptToken>): VibeScriptCall | Error => {
  if (parserIsEof(parser)) {
    return new Error(
      'unexpected end of file parsing vibe script call expression'
    );
  }

  ///

  const args: VibeScriptExpression[] = [];

  ///

  const nameToken = parser.tokens[parser.position];

  if (nameToken === undefined) {
    return new Error(
      'unexpected undefined token parsing vibe script call expression (expected text/function name)'
    );
  }

  if (nameToken.kind !== 'text') {
    return new Error(
      `expected call name token (text), got '${nameToken.kind}'`
    );
  }

  parser.position += 1;

  ///

  const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const nextToken = parser.tokens[nextPtr];

  if (nextToken === undefined) {
    return new Error(
      'unexpected undefined token parsing vibe script call expression (expected opening paren)'
    );
  }

  if (nextToken.kind !== 'punc' || nextToken.value !== '(') {
    return new Error(
      `expected vibe script call expression open paren '(', got '${nextToken.value}'`
    );
  }

  parser.position = nextPtr + 1;

  ///

  while (!parserIsEof(parser)) {
    const nextNextPtr = skipWhitespaceOrNewlines(
      parser.tokens,
      parser.position
    );

    const nextNextToken = parser.tokens[nextNextPtr];

    if (nextNextToken === undefined) {
      return new Error(
        'unexpected undefined token parsing vibe script call expression arguments'
      );
    }

    if (nextNextToken.kind === 'punc' && nextNextToken.value === ')') {
      parser.position = nextNextPtr + 1; // consume ')'

      break;
    }

    if (nextNextToken.kind === 'punc' && nextNextToken.value === ',') {
      parser.position = nextNextPtr + 1; // consume ','
    } else {
      const expr = parseExpression(
        parser,
        VibeScriptExpressionKind.WithAssignments
      );

      if (expr instanceof Error) {
        return expr;
      }

      args.push(expr);
    }
  }

  return {
    name: nameToken.value as string,
    args,
  };
};

// parse var decl

const parseVarDecl = (
  parser: Parser<VibeScriptToken>
): VibeScriptVarDecl | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script statement');
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const nameToken = parser.tokens[parser.position];

  if (nameToken === undefined) {
    return new Error(
      'unexpected undefined token parsing var declaration (expected text/name)'
    );
  }

  if (nameToken.kind !== 'text') {
    return new Error(`expected var name token (text), got '${nameToken.kind}'`);
  }

  parser.position += 1;

  ///

  const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const nextToken = parser.tokens[nextPtr];

  if (nextToken?.kind !== 'punc' || nextToken?.value !== ':') {
    return {
      name: nameToken.value as string,
    };
  }

  parser.position = nextPtr + 1;

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const type = parseType(parser);

  if (type instanceof Error) {
    return type;
  }

  return {
    name: nameToken.value as string,
    type,
  };
};

const parseVarDeclStatement = (
  parser: Parser<VibeScriptToken>
): VibeScriptVarDeclarationStatement | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing var decl statement');
  }

  ///

  const nextPtr = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  const nextToken = parser.tokens[nextPtr];

  if (nextToken === undefined) {
    return new Error(
      'unexpected undefined token parsing vibe var decl statement'
    );
  }

  if (nextToken.kind !== 'text' || nextToken.value !== 'let') {
    return new Error(
      `expected 'let' token starting vibe var decl statement, got '${nextToken.value}'`
    );
  }

  parser.position = skipWhitespaceOrNewlines(parser.tokens, nextPtr + 1);

  ///

  const varDecl = parseVarDecl(parser);

  if (varDecl instanceof Error) {
    return varDecl;
  }

  ///

  parser.position = skipWhitespaceOrNewlines(parser.tokens, parser.position);

  ///

  const assignToken = parser.tokens[parser.position];

  if (assignToken === undefined) {
    return new Error(
      'unexpected undefined token parsing vibe var decl statement (expected `let x = ...` pattern)'
    );
  }

  if (assignToken.kind !== 'punc' || assignToken.value !== '=') {
    return new Error(
      `expected '=' token in vibe var decl statement, got '${assignToken.value}'`
    );
  }

  parser.position += 1;

  ///

  const expr = parseExpression(
    parser,
    VibeScriptExpressionKind.WithAssignments
  );

  if (expr instanceof Error) {
    return expr;
  }

  ///

  return {
    varDecl,
    expr,
  };
};

// parse file includes

const consumePath = (parser: Parser<VibeScriptToken>): string | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script path');
  }

  const parts: string[] = [];

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    // stop at token boundaries that separate paths

    if (t.kind === 'whitespace' || t.kind === 'newline') {
      break;
    }

    // stop before end-of-comment so caller can handle it

    if (t.kind === 'punc' && t.value === '-->') {
      break;
    }

    if (t.value) {
      parts.push(t.value);
    }

    parser.position += 1;
  }

  return parts.join('');
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

// parse statement

const parseStatement = (
  parser: Parser<VibeScriptToken>
): VibeScriptStatement | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script statement');
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

  // preamble

  if (nextToken.kind === 'text' && isPreambleStartKeyword(nextToken.value)) {
    return parsePreamble(parser);
  }

  // var decl

  if (nextToken.kind === 'text' && nextToken.value === 'let') {
    return parseVarDeclStatement(parser);
  }

  // step

  if (nextToken.kind === 'text' && nextToken.value === 'step') {
    return parseStep(parser);
  }

  // file include statement

  if (nextToken.kind === 'punc' && nextToken.value === '~') {
    return parseFileIncludeStatement(parser);
  }

  return new Error(
    `unexpected start token ('${nextToken.value}') parsing vibe script statement`
  );
};

const preceedsStatement = (first: VibeScriptToken): boolean => {
  return (
    (first.kind === 'punc' && first.value === '~') ||
    (first.kind === 'text' && isPreambleStartKeyword(first.value)) ||
    (first.kind === 'text' && first.value === 'let') ||
    (first.kind === 'text' && first.value === 'step')
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

  if (preceedsStatement(firstNonWhitespaceToken)) {
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
  parser: Parser<VibeScriptToken>,
  options?: { disableInterpolation?: boolean }
): VibeScriptTextBlock | Error => {
  if (parserIsEof(parser)) {
    return new Error('unexpected end of file parsing vibe script block');
  }

  const parts: VibeScriptTextLiteralPart[] = [];

  let quasis = '';

  let tokenCount = 0;

  // track inline markdown code spans delimited by single backticks

  let inInlineCode = false;

  while (!parserIsEof(parser)) {
    const t = parser.tokens[parser.position];

    if (!t) {
      break;
    }

    // toggle inline-code mode on backticks, but always treat
    // the backtick itself as literal text (part of quasis)

    if (t.kind === 'punc' && t.value === '`') {
      inInlineCode = !inInlineCode;

      quasis += t.value ?? '';

      parser.position += 1;

      tokenCount += 1;

      // continue normal accumulation; interpolation
      // is now disabled until we close `

      continue;
    }

    // interpolation start: `${`
    // Only allowed when:
    // - interpolation is enabled for this block
    // - we are NOT inside an inline code span
    // - we have the existing `$` + `{` pattern

    if (
      options?.disableInterpolation !== true &&
      !inInlineCode &&
      t.kind === 'text' &&
      t.value != null &&
      t.value.endsWith('$')
    ) {
      const next = parser.tokens[parser.position + 1];

      if (next?.kind === 'punc' && next.value === '{') {
        const prefix = t.value.slice(0, -1);

        if (prefix.length > 0) {
          quasis += prefix;
        }

        // consume the `$...` token + the `{`

        parser.position += 2;

        tokenCount += 2;

        if (quasis.length > 0) {
          parts.push({ quasis } as VibeScriptTextLiteralQuasis);

          quasis = '';
        }

        const exprStartPos = parser.position;

        const expr = parseExpression(
          parser,
          VibeScriptExpressionKind.WithAssignments
        );

        if (expr instanceof Error) {
          return expr;
        }

        tokenCount += parser.position - exprStartPos;

        const closeStartPos = parser.position;

        const closePtr = skipWhitespaceOrNewlines(
          parser.tokens,
          parser.position
        );

        const closeTok = parser.tokens[closePtr];

        if (closeTok?.kind !== 'punc' || closeTok.value !== '}') {
          return new Error(
            `expected closing brace '}', got '${closeTok?.kind} ${closeTok?.value}'`
          );
        }

        parser.position = closePtr + 1;

        tokenCount += parser.position - closeStartPos;

        parts.push({ expr } as VibeScriptTextLiteralExpression);

        continue;
      }
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
    parts.push({ quasis } as VibeScriptTextLiteralQuasis);
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

  const blocks: VibeScriptBlock[] = [];

  let inFence = false;

  const isFenceDelimiterLine = (text: string): boolean => {
    // allow indentation; fence is per-line because parseTextBlock breaks on newline

    return text.trimStart().startsWith('```');
  };

  const getTextBlockLine = (b: VibeScriptTextBlock): string => {
    // fence delimiter lines won't contain interpolations, so just join quasis

    return b.parts.flatMap(p => ('quasis' in p ? [p.quasis] : [])).join('');
  };

  while (!parserIsEof(parser)) {
    const block = inFence
      ? parseTextBlock(parser, { disableInterpolation: true })
      : parseBlock(parser);

    if (block instanceof Error) {
      return block;
    }

    blocks.push(block);

    // toggle fence mode when we hit a ``` fence delimiter line

    if (block && typeof block === 'object' && 'parts' in block) {
      const line = getTextBlockLine(block as VibeScriptTextBlock);

      if (isFenceDelimiterLine(line)) {
        inFence = !inFence;
      }
    }
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

export type CheckedVibeScriptBooleanExpression = {
  kind: 'boolean';
  value: boolean;
  typeId: number;
};

export type CheckedVibeScriptNumberExpression = {
  kind: 'number';
  value: number;
  typeId: number;
};

export type CheckedVibeScriptStringExpression = {
  kind: 'string';
  value: string;
  typeId: number;
};

export type CheckedVibeScriptVarExpression = {
  kind: 'var';
  name: string;
  typeId: number;
};

export type CheckedVibeScriptCallExpression = {
  kind: 'call';
  name: string;
  args: CheckedVibeScriptExpression[];
  typeId: number;
};

export type CheckedVibeScriptUnaryExpression = {
  kind: 'unary';
  operator: VibeScriptUnaryOperator;
  expr: CheckedVibeScriptExpression;
  typeId: number;
};

export type CheckedVibeScriptBinaryExpression = {
  kind: 'binary';
  operator: VibeScriptBinaryOperator;
  lhs: CheckedVibeScriptExpression;
  rhs: CheckedVibeScriptExpression;
  typeId: number;
};

export type CheckedVibeScriptUnknownExpression = {
  kind: 'unknown';
  expression: VibeScriptExpression;
  typeId: number;
};

export type CheckedVibeScriptArrayExpression = {
  kind: 'array';
  elements: CheckedVibeScriptExpression[];
  typeId: number;
};

export type CheckedVibeScriptLambdaExpression = {
  kind: 'lambda';
  body: CheckedVibeScriptExpression;
  typeId: number;
};

export type CheckedVibeScriptExpression =
  | CheckedVibeScriptBooleanExpression
  | CheckedVibeScriptNumberExpression
  | CheckedVibeScriptStringExpression
  | CheckedVibeScriptVarExpression
  | CheckedVibeScriptCallExpression
  | CheckedVibeScriptUnaryExpression
  | CheckedVibeScriptBinaryExpression
  | CheckedVibeScriptArrayExpression
  | CheckedVibeScriptLambdaExpression
  | CheckedVibeScriptUnknownExpression;

export type VibeScriptUnknownTypeInfo = {
  kind: 'unknown';
};

export type VibeScriptBuiltinTypeInfo = {
  kind: 'builtin';
  name: 'void' | 'boolean' | 'number' | 'string';
};

export type VibeScriptArrayTypeInfo = {
  kind: 'array';
  innerTypeId: number;
};

export type VibeScriptTupleTypeInfo = {
  kind: 'tuple';
  elementTypeIds: number[];
};

export type VibeScriptObjectTypeFieldInfo = {
  key: string;
  typeId: number;
};

export type VibeScriptObjectTypeInfo = {
  kind: 'object';
  fields: VibeScriptObjectTypeFieldInfo[];
};

export type VibeScriptTypeInfo =
  | VibeScriptUnknownTypeInfo
  | VibeScriptBuiltinTypeInfo
  | VibeScriptArrayTypeInfo
  | VibeScriptTupleTypeInfo
  | VibeScriptObjectTypeInfo;

export type VibeScriptVariable = {
  name: string;
  typeId: number;
};

export type VibeScriptScope = {
  parent: number | null;
  vars: VibeScriptVariable[];
};

export type VibeScriptContext = {
  types: VibeScriptTypeInfo[];
  scopes: VibeScriptScope[];
};

export type CheckedVibeScriptPreambleBlock = {
  kind: 'preamble';
  typeId: number; // raw expected type id (what the LLM will ideally output)
  outputTypeId: number; // type id after transforms
  thinking: LLMThinking | null;
  provider: LLMProvider | null;
  model: LLMModel | null;
  transforms: VibeScriptTransform[] | null;
  preamble: VibeScriptPreambleBlock;
};

export type CheckedVibeScriptStep = {
  name: string | null;
  expectsTypeId: number; // raw
  outputTypeId: number; // transformed
  expects: VibeScriptType | null;
  transforms: VibeScriptTransform[] | null;
  blocks: CheckedVibeScriptTextBlock[];
};

export type CheckedVibeScriptStepBlock = {
  kind: 'step';
  name: string;
  expectsTypeId: number; // raw expects type id (what the LLM must output)
  outputTypeId: number; // type id after transforms
  thinking: LLMThinking | null;
  provider: LLMProvider | null;
  model: LLMModel | null;
  transforms: VibeScriptTransform[] | null;
  step: VibeScriptStep;
};

export type CheckedVibeScriptVarDeclBlock = {
  kind: 'varDecl';
  name: string;
  typeId: number;
  statement: VibeScriptVarDeclarationStatement;
  expression: CheckedVibeScriptExpression;
};

export type CheckedVibeScriptFileIncludeBlock = {
  kind: 'file-include';
  parent: string;
  resolvedParent: string;
  files: string[];
};

export type CheckedVibeScriptRegularCommentBlock = {
  kind: 'comment';
  block: VibeScriptRegularCommentBlock;
};

export type CheckedVibeScriptTextPart =
  | { kind: 'quasis'; value: string }
  | { kind: 'expr'; expr: CheckedVibeScriptExpression };

export type CheckedVibeScriptTextBlock = {
  kind: 'text';
  parts: CheckedVibeScriptTextPart[];
  block: VibeScriptTextBlock;
};

export type CheckedVibeScriptBlock =
  | CheckedVibeScriptPreambleBlock
  | CheckedVibeScriptStepBlock
  | CheckedVibeScriptVarDeclBlock
  | CheckedVibeScriptFileIncludeBlock
  | CheckedVibeScriptTextBlock
  | CheckedVibeScriptRegularCommentBlock;

export type CheckedVibeScript = {
  blocks: CheckedVibeScriptBlock[];
  steps: CheckedVibeScriptStep[];
  expectsTypeId: number | null; // raw (null when using steps)
  outputTypeId: number | null; // transformed (null when using steps)
  defaultThinking: LLMThinking | null;
  defaultProvider: LLMProvider | null;
  defaultModel: LLMModel | null;
  transforms: VibeScriptTransform[] | null; // null when using steps / none
  context: VibeScriptContext;
};

const createContext = (): VibeScriptContext => {
  const types: VibeScriptTypeInfo[] = [];

  // Keep these ids stable by pushing in a fixed order.
  //
  // 0: unknown
  // 1: void
  // 2: boolean
  // 3: number
  // 4: string

  types.push({ kind: 'unknown' });
  types.push({ kind: 'builtin', name: 'void' });
  types.push({ kind: 'builtin', name: 'boolean' });
  types.push({ kind: 'builtin', name: 'number' });
  types.push({ kind: 'builtin', name: 'string' });

  const scopes: VibeScriptScope[] = [
    {
      parent: null,
      vars: [],
    },
  ];

  return {
    types,
    scopes,
  };
};

type CheckedLLMConfig = {
  thinking: LLMThinking | null;
  provider: LLMProvider | null;
  model: LLMModel | null;
};

const thinkingLevelSet = new Set<string>(llmThinkingLevels);

const typeCheckLLMThinkingString = (raw: string): LLMThinking | Error => {
  const s = raw.trim();

  if (thinkingLevelSet.has(s)) {
    return s as LLMThinking;
  }

  const n = Number(s);

  if (Number.isInteger(n)) {
    return n;
  }

  return new Error(
    `invalid thinking value '${raw}' (expected level or integer)`
  );
};

const typeCheckLLMConfig = (cfg: {
  thinking?: string | null;
  provider?: string | null;
  model?: string | null;
}): CheckedLLMConfig | Error => {
  const thinkingRaw = cfg.thinking ?? null;
  const providerRaw = cfg.provider ?? null;
  const modelRaw = cfg.model ?? null;

  if (providerRaw !== null && modelRaw !== null) {
    return new Error(
      "cannot specify both 'provider' and 'model' in the same expect/step"
    );
  }

  const thinking =
    thinkingRaw === null ? null : typeCheckLLMThinkingString(thinkingRaw);

  if (thinking instanceof Error) {
    return thinking;
  }

  const provider = (() => {
    if (providerRaw === null) {
      return null;
    }

    const p = providerRaw.trim();

    if (!isLLMProvider(p)) {
      return new Error(`invalid provider '${providerRaw}'`);
    }

    return p;
  })();

  if (provider instanceof Error) {
    return provider;
  }

  const model = (() => {
    if (modelRaw === null) {
      return null;
    }

    const m = modelRaw.trim();

    if (!isLLMModel(m)) {
      return new Error(`invalid model '${modelRaw}'`);
    }

    return m;
  })();

  if (model instanceof Error) {
    return model;
  }

  return { thinking, provider, model };
};

export const UnknownTypeId = 0;
export const VoidTypeId = 1;
export const BooleanTypeId = 2;
export const NumberTypeId = 3;
export const StringTypeId = 4;

const typeInfoEq = (l: VibeScriptTypeInfo, r: VibeScriptTypeInfo) => {
  if (l.kind !== r.kind) {
    return false;
  }

  switch (l.kind) {
    case 'unknown': {
      return true;
    }

    case 'builtin': {
      return l.name === (r as VibeScriptBuiltinTypeInfo).name;
    }

    case 'array': {
      return l.innerTypeId === (r as VibeScriptArrayTypeInfo).innerTypeId;
    }

    case 'tuple': {
      const rr = r as VibeScriptTupleTypeInfo;
      if (l.elementTypeIds.length !== rr.elementTypeIds.length) {
        return false;
      }

      for (let i = 0; i < l.elementTypeIds.length; i++) {
        if (l.elementTypeIds[i] !== rr.elementTypeIds[i]) {
          return false;
        }
      }

      return true;
    }

    case 'object': {
      const rr = r as VibeScriptObjectTypeInfo;

      if (l.fields.length !== rr.fields.length) {
        return false;
      }

      for (let i = 0; i < l.fields.length; i++) {
        const lf = l.fields[i];
        const rf = rr.fields[i];

        if (!lf || !rf) {
          return false;
        }

        if (lf.key !== rf.key) {
          return false;
        }

        if (lf.typeId !== rf.typeId) {
          return false;
        }
      }

      return true;
    }

    default: {
      return false;
    }
  }
};

const findOrAddTypeId = (
  context: VibeScriptContext,
  typeInfo: VibeScriptTypeInfo
): number => {
  for (let i = 0; i < context.types.length; i++) {
    const t = context.types[i];

    if (!t) {
      continue;
    }

    if (typeInfoEq(t, typeInfo)) {
      return i;
    }
  }

  context.types.push(typeInfo);

  return context.types.length - 1;
};

export const typeNameForTypeId = (
  context: VibeScriptContext,
  typeId: number
): string => {
  const t = context.types[typeId];

  if (!t) {
    return 'unknown';
  }

  switch (t.kind) {
    case 'unknown': {
      return 'unknown';
    }

    case 'builtin': {
      return t.name;
    }

    case 'array': {
      return `${typeNameForTypeId(context, t.innerTypeId)}[]`;
    }

    case 'tuple': {
      return `[${t.elementTypeIds.map(id => typeNameForTypeId(context, id)).join(', ')}]`;
    }

    case 'object': {
      const inner = t.fields
        .map(f => `${f.key}: ${typeNameForTypeId(context, f.typeId)}`)
        .join(', ');

      return `{ ${inner} }`;
    }

    default: {
      return 'unknown';
    }
  }
};

const typeCheckTransformsForTypeId = (
  context: VibeScriptContext,
  rawTypeId: number,
  transforms: VibeScriptTransform[] | null
): number | Error => {
  let currentTypeId = rawTypeId;

  for (const tr of transforms ?? []) {
    if (tr.kind === 'takeLast') {
      const t = context.types[currentTypeId];

      if (!t) {
        return new Error('unknown type id');
      }

      if (t.kind !== 'array') {
        return new Error(
          `takeLast can only be used on arrays, got '${typeNameForTypeId(context, currentTypeId)}'`
        );
      }

      if (tr.count !== null) {
        if (!Number.isInteger(tr.count) || tr.count < 0) {
          return new Error(
            `takeLast(N) requires integer N >= 0, got '${tr.count}'`
          );
        }

        // takeLast(N) returns an array (same type)

        continue;
      }

      // takeLast (no args) returns the element type

      currentTypeId = t.innerTypeId;

      continue;
    }

    if (tr.kind === 'maxBy') {
      const t = context.types[currentTypeId];

      if (!t) {
        return new Error('unknown type id');
      }

      if (t.kind !== 'array') {
        return new Error(
          `maxBy can only be used on arrays, got '${typeNameForTypeId(context, currentTypeId)}'`
        );
      }

      if (typeof tr.key !== 'string' || tr.key.length === 0) {
        return new Error('maxBy(key) requires a non-empty key');
      }

      const inner = context.types[t.innerTypeId];

      if (inner && inner.kind === 'object') {
        const field = inner.fields.find(f => f.key === tr.key);

        if (!field) {
          return new Error(
            `maxBy(${tr.key}) key not found on element type '${typeNameForTypeId(context, t.innerTypeId)}'`
          );
        }

        const ft = context.types[field.typeId];

        if (
          field.typeId !== UnknownTypeId &&
          field.typeId !== NumberTypeId &&
          !(ft && ft.kind === 'builtin' && ft.name === 'number')
        ) {
          return new Error(
            `maxBy(${tr.key}) requires numeric field, got '${typeNameForTypeId(context, field.typeId)}'`
          );
        }
      }

      // maxBy(...) returns the element type

      currentTypeId = t.innerTypeId;

      continue;
    }

    return new Error('unknown transform');
  }

  return currentTypeId;
};

const addVarToScope = (
  context: VibeScriptContext,
  scopeId: number,
  variable: VibeScriptVariable
): Error | null => {
  const scope = context.scopes[scopeId];

  if (!scope) {
    return new Error('internal error: scope not found');
  }

  for (const v of scope.vars) {
    if (v.name === variable.name) {
      return new Error(`redefinition of variable '${variable.name}'`);
    }
  }

  scope.vars.push(variable);

  return null;
};

const findVarInScope = (
  context: VibeScriptContext,
  scopeId: number,
  name: string
): VibeScriptVariable | null => {
  let currentId: number | null = scopeId;

  while (currentId !== null) {
    const scope: VibeScriptScope | undefined = context.scopes[currentId];
    if (!scope) {
      return null;
    }

    for (const v of scope.vars) {
      if (v.name === name) {
        return v;
      }
    }

    currentId = scope.parent;
  }

  return null;
};

const checkTypesForCompat = (
  context: VibeScriptContext,
  expectedTypeId: number,
  foundTypeId: number
): Error | null => {
  if (expectedTypeId === UnknownTypeId || foundTypeId === UnknownTypeId) {
    return null;
  }

  if (expectedTypeId === foundTypeId) {
    return null;
  }

  const expected = context.types[expectedTypeId];
  const found = context.types[foundTypeId];

  if (!expected || !found) {
    return new Error('unknown type id');
  }

  if (expected.kind === 'array' && found.kind === 'array') {
    return checkTypesForCompat(
      context,
      expected.innerTypeId,
      found.innerTypeId
    );
  }

  return new Error(
    `type mismatch: expected '${typeNameForTypeId(context, expectedTypeId)}', got '${typeNameForTypeId(context, foundTypeId)}'`
  );
};

const unifyWithType = (
  context: VibeScriptContext,
  foundTypeId: number,
  typeHint: number | null
): number | Error => {
  if (typeHint === null) {
    return foundTypeId;
  }

  if (typeHint === UnknownTypeId) {
    return foundTypeId;
  }

  const err = checkTypesForCompat(context, typeHint, foundTypeId);

  if (err) {
    return err;
  }

  return typeHint;
};

/// type checkers

const typeCheckType = (
  uncheckedType: VibeScriptType,
  context: VibeScriptContext
): number | Error => {
  // For now: be permissive so parsing experiments don't hard-fail.
  // Unknown/unhandled nodes become UnknownTypeId without error.

  if (!uncheckedType || typeof uncheckedType !== 'object') {
    return UnknownTypeId;
  }

  // name
  if ('name' in uncheckedType) {
    const nameRaw = uncheckedType.name;

    if (typeof nameRaw !== 'string' || nameRaw.length === 0) {
      return UnknownTypeId;
    }

    const name = nameRaw.toLowerCase();

    switch (name) {
      case 'void':
        return VoidTypeId;

      case 'bool':
      case 'boolean':
        return BooleanTypeId;
      case 'number':
        return NumberTypeId;

      case 'string':
        return StringTypeId;

      default:
        return UnknownTypeId;
    }
  }

  // array
  if ('arrayOf' in uncheckedType) {
    const innerTypeId = (() => {
      const inner = uncheckedType.arrayOf;

      if (!inner) {
        return UnknownTypeId;
      }

      return typeCheckType(inner, context);
    })();

    if (innerTypeId instanceof Error) {
      return innerTypeId;
    }

    const typeId = findOrAddTypeId(context, {
      kind: 'array',
      innerTypeId,
    });

    return typeId;
  }

  // tuple
  if ('tuple' in uncheckedType) {
    const elemsUnchecked = uncheckedType.tuple;

    if (!Array.isArray(elemsUnchecked)) {
      return UnknownTypeId;
    }

    const elementTypeIds: number[] = [];

    for (const e of elemsUnchecked) {
      const id = typeCheckType(e, context);

      if (id instanceof Error) {
        return id;
      }

      elementTypeIds.push(id);
    }

    const typeId = findOrAddTypeId(context, {
      kind: 'tuple',
      elementTypeIds,
    });

    return typeId;
  }

  // object
  if ('object' in uncheckedType) {
    const fieldsUnchecked = uncheckedType.object;

    if (!Array.isArray(fieldsUnchecked)) {
      return UnknownTypeId;
    }

    const fields: VibeScriptObjectTypeFieldInfo[] = [];

    for (const f of fieldsUnchecked) {
      if (!f || typeof f !== 'object') {
        continue;
      }

      const key = (f as VibeScriptObjectField).key;

      if (typeof key !== 'string' || key.length === 0) {
        continue;
      }

      const typeId = typeCheckType((f as VibeScriptObjectField).type, context);

      if (typeId instanceof Error) {
        return typeId;
      }

      fields.push({
        key,
        typeId,
      });
    }

    const id = findOrAddTypeId(context, {
      kind: 'object',
      fields,
    });

    return id;
  }

  return UnknownTypeId;
};

const typeCheckCall = (
  name: string,
  args: VibeScriptExpression[],
  scopeId: number,
  context: VibeScriptContext,
  typeHint: number | null
): CheckedVibeScriptExpression | Error => {
  const checkedArgs: CheckedVibeScriptExpression[] = [];

  for (const arg of args) {
    const checkedArg = typeCheckExpression(arg, scopeId, context, null);

    if (checkedArg instanceof Error) {
      return checkedArg;
    }

    checkedArgs.push(checkedArg);
  }

  let returnTypeId = UnknownTypeId;

  switch (name) {
    case 'random': {
      if (checkedArgs.length !== 0) {
        return new Error('random() takes 0 arguments');
      }

      returnTypeId = NumberTypeId;

      break;
    }

    case 'floor': {
      if (checkedArgs.length !== 1) {
        return new Error('floor(...) takes 1 argument');
      }

      const arg0 = checkedArgs[0];

      if (
        arg0 &&
        arg0.typeId !== UnknownTypeId &&
        arg0.typeId !== NumberTypeId
      ) {
        return new Error(
          `floor(...) expects number, got '${typeNameForTypeId(context, arg0.typeId)}'`
        );
      }

      returnTypeId = NumberTypeId;

      break;
    }

    case 'ceil': {
      if (checkedArgs.length !== 1) {
        return new Error('ceil(...) takes 1 argument');
      }

      const arg0 = checkedArgs[0];

      if (
        arg0 &&
        arg0.typeId !== UnknownTypeId &&
        arg0.typeId !== NumberTypeId
      ) {
        return new Error(
          `ceil(...) expects number, got '${typeNameForTypeId(context, arg0.typeId)}'`
        );
      }

      returnTypeId = NumberTypeId;

      break;
    }

    case 'round': {
      if (checkedArgs.length !== 1) {
        return new Error('round(...) takes 1 argument');
      }

      const arg0 = checkedArgs[0];

      if (
        arg0 &&
        arg0.typeId !== UnknownTypeId &&
        arg0.typeId !== NumberTypeId
      ) {
        return new Error(
          `round(...) expects number, got '${typeNameForTypeId(context, arg0.typeId)}'`
        );
      }

      returnTypeId = NumberTypeId;

      break;
    }

    case 'sample': {
      if (checkedArgs.length !== 1) {
        return new Error('sample(...) takes 1 argument');
      }

      const a0 = checkedArgs[0];

      if (!a0) {
        return new Error('internal error: missing arg');
      }

      // if we know it's an array, return its element type

      let ret = UnknownTypeId;

      const t0 = context.types[a0.typeId];

      if (t0?.kind === 'array') {
        ret = t0.innerTypeId;
      } else if (a0.typeId !== UnknownTypeId) {
        // be strict-ish: sample expects array-like
        return new Error(
          `sample(...) expects array, got '${typeNameForTypeId(context, a0.typeId)}'`
        );
      }

      const unifiedTypeId = unifyWithType(context, ret, typeHint);

      if (unifiedTypeId instanceof Error) {
        return unifiedTypeId;
      }

      return {
        kind: 'call',
        name,
        args: checkedArgs,
        typeId: unifiedTypeId,
      };
    }

    default: {
      // return new Error(`unknown function '${name}'`);

      const v = findVarInScope(context, scopeId, name);

      if (!v) {
        return new Error(`unknown function '${name}'`);
      }

      // minimal callable rule: only allow calls on unknown-typed vars

      if (v.typeId !== UnknownTypeId) {
        return new Error(
          `'${name}' is not callable (type '${typeNameForTypeId(context, v.typeId)}')`
        );
      }

      const unifiedTypeId = unifyWithType(context, UnknownTypeId, typeHint);

      if (unifiedTypeId instanceof Error) {
        return unifiedTypeId;
      }

      return {
        kind: 'call',
        name,
        args: checkedArgs,
        typeId: unifiedTypeId,
      };
    }
  }

  const unifiedTypeId = unifyWithType(context, returnTypeId, typeHint);

  if (unifiedTypeId instanceof Error) {
    return unifiedTypeId;
  }

  return {
    kind: 'call',
    name,
    args: checkedArgs,
    typeId: unifiedTypeId,
  };
};

const typeCheckUnary = (
  operator: VibeScriptUnaryOperator,
  expr: VibeScriptExpression,
  scopeId: number,
  context: VibeScriptContext,
  typeHint: number | null
): CheckedVibeScriptExpression | Error => {
  const checkedExpr = typeCheckExpression(expr, scopeId, context, null);

  if (checkedExpr instanceof Error) {
    return checkedExpr;
  }

  if (operator === VibeScriptUnaryOperator.LogicalNot) {
    if (
      checkedExpr.typeId !== UnknownTypeId &&
      checkedExpr.typeId !== BooleanTypeId
    ) {
      return new Error(
        `unary ! expects boolean, got '${typeNameForTypeId(context, checkedExpr.typeId)}'`
      );
    }

    const unifiedTypeId = unifyWithType(context, BooleanTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return {
      kind: 'unary',
      operator,
      expr: checkedExpr,
      typeId: unifiedTypeId,
    };
  }

  // Keep type-check aligned with runtime: ++/-- only on variables.
  if (checkedExpr.kind !== 'var') {
    return new Error('++/-- only supported on variables');
  }

  if (
    checkedExpr.typeId !== UnknownTypeId &&
    checkedExpr.typeId !== NumberTypeId
  ) {
    return new Error(
      `unary ${operator} expects number, got '${typeNameForTypeId(context, checkedExpr.typeId)}'`
    );
  }

  const unifiedTypeId = unifyWithType(context, NumberTypeId, typeHint);

  if (unifiedTypeId instanceof Error) {
    return unifiedTypeId;
  }

  return {
    kind: 'unary',
    operator,
    expr: checkedExpr,
    typeId: unifiedTypeId,
  };
};

const typeCheckBinary = (
  operator: VibeScriptBinaryOperator,
  lhs: VibeScriptExpression,
  rhs: VibeScriptExpression,
  scopeId: number,
  context: VibeScriptContext,
  typeHint: number | null
): CheckedVibeScriptExpression | Error => {
  const checkedLhs = typeCheckExpression(lhs, scopeId, context, null);

  if (checkedLhs instanceof Error) {
    return checkedLhs;
  }

  // If this is assignment, prefer checking RHS with LHS type as a hint.
  const rhsHint =
    operator === 'Assign' && checkedLhs.typeId !== UnknownTypeId
      ? checkedLhs.typeId
      : null;

  const checkedRhs = typeCheckExpression(rhs, scopeId, context, rhsHint);

  if (checkedRhs instanceof Error) {
    return checkedRhs;
  }

  let resultTypeId = UnknownTypeId;

  switch (operator) {
    case 'Add':
    case 'Subtract':
    case 'Multiply':
    case 'Divide':
    case 'Modulo': {
      // For now: numeric only.
      if (
        checkedLhs.typeId !== UnknownTypeId &&
        checkedLhs.typeId !== NumberTypeId
      ) {
        return new Error(
          `left side of arithmetic must be number, got '${typeNameForTypeId(context, checkedLhs.typeId)}'`
        );
      }

      if (
        checkedRhs.typeId !== UnknownTypeId &&
        checkedRhs.typeId !== NumberTypeId
      ) {
        return new Error(
          `right side of arithmetic must be number, got '${typeNameForTypeId(context, checkedRhs.typeId)}'`
        );
      }

      resultTypeId = NumberTypeId;

      break;
    }

    case 'LogicalAnd':
    case 'LogicalOr': {
      if (
        checkedLhs.typeId !== UnknownTypeId &&
        checkedLhs.typeId !== BooleanTypeId
      ) {
        return new Error(
          `left side of logical op must be boolean, got '${typeNameForTypeId(context, checkedLhs.typeId)}'`
        );
      }

      if (
        checkedRhs.typeId !== UnknownTypeId &&
        checkedRhs.typeId !== BooleanTypeId
      ) {
        return new Error(
          `right side of logical op must be boolean, got '${typeNameForTypeId(context, checkedRhs.typeId)}'`
        );
      }

      resultTypeId = BooleanTypeId;

      break;
    }

    case 'Equal':
    case 'NotEqual':
    case 'LessThan':
    case 'LessThanOrEqual':
    case 'GreaterThan':
    case 'GreaterThanOrEqual': {
      // For now: require type equality unless unknown.
      if (
        checkedLhs.typeId !== UnknownTypeId &&
        checkedRhs.typeId !== UnknownTypeId &&
        checkedLhs.typeId !== checkedRhs.typeId
      ) {
        return new Error(
          `comparison between incompatible types ('${typeNameForTypeId(context, checkedLhs.typeId)}' and '${typeNameForTypeId(context, checkedRhs.typeId)}')`
        );
      }

      resultTypeId = BooleanTypeId;

      break;
    }

    case 'Assign': {
      // Only allow assigning to a variable for now.
      if (checkedLhs.kind !== 'var') {
        return new Error('left-hand side of assignment must be a variable');
      }
      const existing = findVarInScope(context, scopeId, checkedLhs.name);

      if (!existing) {
        return new Error(`assignment to unknown variable '${checkedLhs.name}'`);
      }
      const compat = checkTypesForCompat(
        context,
        existing.typeId,
        checkedRhs.typeId
      );

      if (compat instanceof Error) {
        return compat;
      }

      // If variable was unknown, let assignment “lock it in” to RHS type.
      if (
        existing.typeId === UnknownTypeId &&
        checkedRhs.typeId !== UnknownTypeId
      ) {
        existing.typeId = checkedRhs.typeId;
      }

      resultTypeId = existing.typeId;

      break;
    }

    default: {
      resultTypeId = UnknownTypeId;

      break;
    }
  }

  const unifiedTypeId = unifyWithType(context, resultTypeId, typeHint);

  if (unifiedTypeId instanceof Error) {
    return unifiedTypeId;
  }

  return {
    kind: 'binary',
    operator,
    lhs: checkedLhs,
    rhs: checkedRhs,
    typeId: unifiedTypeId,
  };
};

const typeCheckExpression = (
  expr: VibeScriptExpression,
  scopeId: number,
  context: VibeScriptContext,
  typeHint: number | null
): CheckedVibeScriptExpression | Error => {
  // boolean literal

  if ('value' in expr && typeof expr.value === 'boolean') {
    const unifiedTypeId = unifyWithType(context, BooleanTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return {
      kind: 'boolean',
      value: expr.value,
      typeId: unifiedTypeId,
    };
  }

  // number literal

  if ('value' in expr && typeof expr.value === 'number') {
    const unifiedTypeId = unifyWithType(context, NumberTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return {
      kind: 'number',
      value: expr.value,
      typeId: unifiedTypeId,
    };
  }

  // string literal

  if ('value' in expr && typeof expr.value === 'string') {
    const unifiedTypeId = unifyWithType(context, StringTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return {
      kind: 'string',
      value: expr.value,
      typeId: unifiedTypeId,
    };
  }

  // array literal

  if ('array' in expr) {
    const elems: CheckedVibeScriptExpression[] = [];

    for (const e of expr.array) {
      const ce = typeCheckExpression(e, scopeId, context, null);

      if (ce instanceof Error) {
        return ce;
      }

      elems.push(ce);
    }

    // infer a simple inner type (best-effort)

    let innerTypeId = UnknownTypeId;

    for (const e of elems) {
      if (e.typeId === UnknownTypeId) {
        continue;
      }

      if (innerTypeId === UnknownTypeId) {
        innerTypeId = e.typeId;

        continue;
      }

      if (innerTypeId !== e.typeId) {
        innerTypeId = UnknownTypeId;

        break;
      }
    }

    const arrayTypeId = findOrAddTypeId(context, {
      kind: 'array',
      innerTypeId,
    });

    const unifiedTypeId = unifyWithType(context, arrayTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return {
      kind: 'array',
      elements: elems,
      typeId: unifiedTypeId,
    };
  }

  // lambda literal
  if ('lambda' in expr) {
    const body = typeCheckExpression(expr.lambda.body, scopeId, context, null);

    if (body instanceof Error) {
      return body;
    }

    // minimal: lambdas have unknown type (no function types yet)

    const unifiedTypeId = unifyWithType(context, UnknownTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return {
      kind: 'lambda',
      body,
      typeId: unifiedTypeId,
    };
  }

  // name-or-string (late bound)

  if ('nameOrString' in expr) {
    const name = expr.nameOrString;

    if (typeof name !== 'string' || name.length === 0) {
      return new Error('invalid nameOrString');
    }

    const v = findVarInScope(context, scopeId, name);

    if (v) {
      const unifiedTypeId = unifyWithType(context, v.typeId, typeHint);

      if (unifiedTypeId instanceof Error) {
        return unifiedTypeId;
      }

      return { kind: 'var', name, typeId: unifiedTypeId };
    }

    const unifiedTypeId = unifyWithType(context, StringTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return { kind: 'string', value: name, typeId: unifiedTypeId };
  }

  // variable

  if ('varName' in expr) {
    const name = expr.varName;

    if (typeof name !== 'string' || name.length === 0) {
      return new Error('invalid variable name');
    }

    const v = findVarInScope(context, scopeId, name);

    if (!v) {
      const unifiedTypeId = unifyWithType(context, UnknownTypeId, typeHint);

      if (unifiedTypeId instanceof Error) {
        return unifiedTypeId;
      }

      return new Error(`variable '${name}' not found`);
    }

    const unifiedTypeId = unifyWithType(context, v.typeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return {
      kind: 'var',
      name,
      typeId: unifiedTypeId,
    };
  }

  // call

  if ('call' in expr) {
    const call = expr.call;

    if (!call || typeof call !== 'object') {
      return new Error('invalid call expression');
    }

    return typeCheckCall(call.name, call.args, scopeId, context, typeHint);
  }

  // unary op

  if ('expr' in expr && 'operator' in expr && !('lhs' in expr)) {
    return typeCheckUnary(
      expr.operator as VibeScriptUnaryOperator,
      expr.expr,
      scopeId,
      context,
      typeHint
    );
  }

  // binary op

  if ('lhs' in expr && 'rhs' in expr && 'operator' in expr) {
    return typeCheckBinary(
      expr.operator as VibeScriptBinaryOperator,
      expr.lhs as VibeScriptExpression,
      expr.rhs as VibeScriptExpression,
      scopeId,
      context,
      typeHint
    );
  }

  // operator-expression fallback (these can appear as parser error-tolerance nodes)
  if ('operator' in expr && !('lhs' in expr) && !('rhs' in expr)) {
    const unifiedTypeId = unifyWithType(context, UnknownTypeId, typeHint);

    if (unifiedTypeId instanceof Error) {
      return unifiedTypeId;
    }

    return new Error('unexpected operator in expression position');
  }

  return new Error('unknown expression kind');
};

// currently only parent: '~/...' works

const typeCheckStatement = (
  stmt: VibeScriptStatement,
  scopeId: number,
  context: VibeScriptContext
): CheckedVibeScriptBlock | Error => {
  // step
  //
  // IMPORTANT:
  // VibeScriptStep also has an optional `expects` field, so we must
  // classify step statements before the top-level `expects` statement
  // check (or explicitly exclude `step` from that check).

  if ('step' in stmt) {
    const name = stmt.step;

    if (typeof name !== 'string' || name.length === 0) {
      return new Error('step name cannot be empty');
    }

    const inputName = stmt.inputName ?? null;

    let inferredExpectsTypeId: number | null = null;

    if (inputName !== null) {
      const v = findVarInScope(context, scopeId, inputName);

      if (!v) {
        return new Error(`step input variable '${inputName}' not found`);
      }
      inferredExpectsTypeId = v.typeId;
    }

    let expectsTypeId = StringTypeId;

    if (stmt.expects) {
      const typeId = typeCheckType(stmt.expects, context);

      if (typeId instanceof Error) {
        return typeId;
      }

      expectsTypeId = typeId;

      if (inferredExpectsTypeId !== null) {
        const compatErr = checkTypesForCompat(
          context,
          expectsTypeId,
          inferredExpectsTypeId
        );

        if (compatErr) {
          return compatErr;
        }
      }
    } else if (inferredExpectsTypeId !== null) {
      expectsTypeId = inferredExpectsTypeId;
    }

    const transforms = stmt.transforms ?? null;

    const outputTypeId = typeCheckTransformsForTypeId(
      context,
      expectsTypeId,
      transforms
    );

    if (outputTypeId instanceof Error) {
      return outputTypeId;
    }

    const config = typeCheckLLMConfig({
      thinking: stmt.thinking ?? null,
      provider: stmt.provider ?? null,
      model: stmt.model ?? null,
    });

    if (config instanceof Error) {
      return config;
    }

    return {
      kind: 'step',
      name,
      expectsTypeId,
      outputTypeId,
      thinking: config.thinking,
      provider: config.provider,
      model: config.model,
      transforms,
      step: stmt,
    };
  }

  // preamble
  //
  // NOTE:
  // This must not catch step statements, hence the `'step' in stmt` early return above.

  if ('expects' in stmt && !('step' in stmt)) {
    const block = stmt as VibeScriptPreambleBlock;

    // FIX: if no `expect:` was provided, do NOT force unknown.
    // Default to string so preamble-only config behaves like “normal text output”.
    const expectsNode = block.expects ?? null;

    const typeId =
      expectsNode === null ? StringTypeId : typeCheckType(expectsNode, context);

    if (typeId instanceof Error) {
      return typeId;
    }

    const transforms = block.transforms ?? null;

    const outputTypeId = typeCheckTransformsForTypeId(
      context,
      typeId,
      transforms
    );

    if (outputTypeId instanceof Error) {
      return outputTypeId;
    }

    const config = typeCheckLLMConfig({
      thinking: block.thinking ?? null,
      provider: block.provider ?? null,
      model: block.model ?? null,
    });

    if (config instanceof Error) {
      return config;
    }

    return {
      kind: 'preamble',
      typeId,
      outputTypeId,
      thinking: config.thinking,
      provider: config.provider,
      model: config.model,
      transforms,
      preamble: block,
    };
  }

  // var decl statement (let)

  if ('varDecl' in stmt && 'expr' in stmt) {
    const declaredType = stmt.varDecl.type;

    let declaredTypeId = UnknownTypeId;

    if (declaredType) {
      const typeId = typeCheckType(declaredType, context);

      if (typeId instanceof Error) {
        return typeId;
      }

      declaredTypeId = typeId;
    }

    const checkedExpr = typeCheckExpression(
      stmt.expr,
      scopeId,
      context,
      declaredType ? declaredTypeId : null
    );

    if (checkedExpr instanceof Error) {
      return checkedExpr;
    }

    const finalTypeId = checkedExpr.typeId;

    if (declaredType) {
      const compatErr = checkTypesForCompat(
        context,
        declaredTypeId,
        checkedExpr.typeId
      );

      if (compatErr instanceof Error) {
        return compatErr;
      }
    }

    const name = stmt.varDecl.name;

    if (typeof name !== 'string' || name.length === 0) {
      return new Error('variable name cannot be empty');
    }
    const addErr = addVarToScope(context, scopeId, {
      name,
      typeId: finalTypeId,
    });

    if (addErr instanceof Error) {
      return addErr;
    }

    return {
      kind: 'varDecl',
      name: stmt.varDecl.name,
      typeId: finalTypeId,
      statement: stmt,
      expression: checkedExpr,
    };
  }

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

  return new Error('unknown vibe script statement kind while type checking');
};

const typeCheckTextBlock = (
  block: VibeScriptTextBlock,
  scopeId: number,
  context: VibeScriptContext
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
      const checkedExpr = typeCheckExpression(
        part.expr,
        scopeId,
        context,
        null
      );

      if (checkedExpr instanceof Error) {
        return checkedExpr;
      }

      // Interpolations should generally be scalar-ish.
      // For now: allow unknown/boolean/number/string, but reject void explicitly.
      if (checkedExpr.typeId === VoidTypeId) {
        return new Error('cannot interpolate a void expression');
      }

      parts.push({
        kind: 'expr',
        expr: checkedExpr,
      });

      continue;
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
  const context = createContext();

  const rootScopeId = 0;

  let expectsTypeId: number | null = null;

  let outputTypeId: number | null = null;

  let defaultThinking: LLMThinking | null = null;
  let defaultProvider: LLMProvider | null = null;
  let defaultModel: LLMModel | null = null;

  let transforms: VibeScriptTransform[] | null = null;

  const checkedBlocks: CheckedVibeScriptBlock[] = [];

  let pendingStepOutput: { name: string; typeId: number } | null = null;

  const commitPendingStepOutput = (): Error | null => {
    if (!pendingStepOutput) {
      return null;
    }

    const addErr = addVarToScope(context, rootScopeId, {
      name: pendingStepOutput.name,
      typeId: pendingStepOutput.typeId,
    });

    if (addErr instanceof Error) {
      return addErr;
    }

    pendingStepOutput = null;

    return null;
  };

  for (const block of blocks) {
    // statement comment block

    if (block && typeof block === 'object' && 'statement' in block) {
      const stmt = block.statement;

      // if we are encountering a new step statement, the previous step
      // has “completed” from the point of view of later prompts, so its
      // named output becomes available now

      if (stmt && typeof stmt === 'object' && 'step' in stmt) {
        const commitErr = commitPendingStepOutput();

        if (commitErr instanceof Error) {
          return commitErr;
        }
      }

      const checkedStmt = typeCheckStatement(stmt, rootScopeId, context);

      if (checkedStmt instanceof Error) {
        return checkedStmt;
      }

      if (checkedStmt.kind === 'preamble') {
        if (expectsTypeId !== null) {
          return new Error(
            'only a single preamble (eg `expects: string[]`) allowed in vibe script'
          );
        }

        expectsTypeId = checkedStmt.typeId;
        outputTypeId = checkedStmt.outputTypeId;
        defaultThinking = checkedStmt.thinking ?? null;
        defaultProvider = checkedStmt.provider ?? null;
        defaultModel = checkedStmt.model ?? null;
        transforms = checkedStmt.transforms ?? null;
      }

      if (checkedStmt.kind === 'step') {
        const outputName = checkedStmt.step.outputName ?? null;

        if (outputName !== null) {
          pendingStepOutput = {
            name: outputName,
            typeId: checkedStmt.outputTypeId,
          };
        } else {
          pendingStepOutput = null;
        }
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
      const checkedText = typeCheckTextBlock(block, rootScopeId, context);

      if (checkedText instanceof Error) {
        return checkedText;
      }

      checkedBlocks.push(checkedText);

      continue;
    }

    return new Error('unknown vibe script block kind while type checking');
  }

  const commitErr = commitPendingStepOutput();

  if (commitErr instanceof Error) {
    return commitErr;
  }

  const usesSteps = checkedBlocks.some(b => b.kind === 'step');

  // if we are using steps, we do not allow a top-level expects

  if (usesSteps && expectsTypeId !== null) {
    return new Error('top-level expects block is not allowed when using steps');
  }

  // if no expects was provided (single-step script), default to string

  const resolvedExpectsTypeId = usesSteps
    ? null
    : (expectsTypeId ?? StringTypeId);

  const resolvedOutputTypeId = usesSteps
    ? null
    : (outputTypeId ?? resolvedExpectsTypeId);

  const resolvedTransforms = usesSteps ? null : transforms;

  ///

  const steps: CheckedVibeScriptStep[] = [];

  let current: CheckedVibeScriptStep | null = null;

  const pushCurrent = () => {
    if (current) {
      steps.push(current);

      current = null;
    }
  };

  const implicitStepExpectsTypeId = usesSteps
    ? StringTypeId
    : (resolvedExpectsTypeId ?? StringTypeId);

  const implicitStepOutputTypeId = usesSteps
    ? StringTypeId
    : (resolvedOutputTypeId ?? implicitStepExpectsTypeId);

  const implicitStepTransforms = usesSteps ? null : resolvedTransforms;

  for (const b of checkedBlocks) {
    if (b.kind === 'step') {
      pushCurrent();

      current = {
        name: b.name,
        expectsTypeId: b.expectsTypeId,
        outputTypeId: b.outputTypeId,
        expects: b.step.expects ?? null,
        transforms: b.transforms ?? null,
        blocks: [],
      };

      continue;
    }

    // file-includes should also “create” an implicit step so step-counting matches runtime

    if (b.kind === 'file-include') {
      if (!current) {
        current = {
          name: null,
          expectsTypeId: implicitStepExpectsTypeId,
          outputTypeId: implicitStepOutputTypeId,
          expects: null,
          transforms: implicitStepTransforms,
          blocks: [],
        };
      }

      continue;
    }

    if (b.kind === 'text') {
      if (!current) {
        current = {
          name: null,
          expectsTypeId: implicitStepExpectsTypeId,
          outputTypeId: implicitStepOutputTypeId,
          expects: null,
          transforms: implicitStepTransforms,
          blocks: [],
        };
      }

      current.blocks.push(b);
    }
  }

  pushCurrent();

  return {
    blocks: checkedBlocks,
    steps,
    expectsTypeId: resolvedExpectsTypeId,
    outputTypeId: resolvedOutputTypeId,
    defaultThinking,
    defaultProvider,
    defaultModel,
    transforms: resolvedTransforms,
    context,
  };
};
