export interface ChatCompletionMessage {
  role: string | null;
  content: string;
}

export const LLM_REQUEST_HARDCAP_MS = 10 * 60_000; // 10 minutes

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

const tokenSplitRegex = /\s+/; // UN export?

export const estimateTokensForText = (text: string): number => {
  const words = text.split(tokenSplitRegex).filter(w => w.length > 0);

  let tokenEstimate = 0;

  const incTokensEstimate = (w: string) => {
    tokenEstimate += Math.ceil(w.length / 3);
  };

  words.forEach(incTokensEstimate);

  return tokenEstimate;
};

export const estimateTokensForMessages = (
  msgs: ChatCompletionMessage[] | string
): number => {
  if (typeof msgs === 'string') {
    return estimateTokensForText(msgs);
  }

  let total = 0;

  for (const m of msgs) {
    total += estimateTokensForText(m.content ?? '');
  }

  return total;
};
