export const CONSOLE_LOG: boolean = false;

export interface ChatCompletionMessage {
  role: string | null;
  content: string;
}

export const llmThinkingLevels = [
  'default',
  'off',
  'auto',
  'low',
  'medium',
  'high',
  'max',
] as const;

export type LLMThinkingLevel = (typeof llmThinkingLevels)[number];

export type LLMThinking = LLMThinkingLevel | number;

export type LLMTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  estimated: boolean;
};

export type LLMAccounting = {
  tokens: LLMTokenUsage;
  costUnits: number;
};
