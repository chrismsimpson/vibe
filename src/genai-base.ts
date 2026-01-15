export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessageContent = string | ChatContentPart[];

export interface ChatCompletionMessage {
  role: string | null;
  content: ChatMessageContent;
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
};

export type LLMAccounting = {
  tokens: LLMTokenUsage;
  costUsd: number;
};

const tokenSplitRegex = /\s+/;

export const estimateTokensForText = (text: string): number => {
  // TODO: rewrite this to factor in /\s+/ delimiting punctuation, etc.

  const words = text.split(tokenSplitRegex).filter(w => w.length > 0);

  let tokenEstimate = 0;

  const incTokensEstimate = (w: string) => {
    tokenEstimate += Math.ceil(w.length / 2.9); // was 3, change to 2.9 as a dumb way to factor in punctuation
  };

  words.forEach(incTokensEstimate);

  return tokenEstimate;
};

export const estimateTokensForPart = (part: ChatContentPart): number => {
  if (part.type === 'text') {
    return estimateTokensForText(part.text);
  }

  if (part.type === 'image_url') {
    // standard high-res cost is usually ~85-1100 tokens
    // 300 is a safe(ish) "average" for estimation without fetching the image

    return 300;
  }

  return 0;
};

export const estimateTokensForMessages = (
  msgs: ChatCompletionMessage[] | string
): number => {
  if (typeof msgs === 'string') {
    return estimateTokensForText(msgs);
  }

  let total = 0;

  for (const m of msgs) {
    if (typeof m.content === 'string') {
      total += estimateTokensForText(m.content);
    } else if (Array.isArray(m.content)) {
      total += m.content.reduce(
        (acc, part) => acc + estimateTokensForPart(part),
        0
      );
    }
  }

  return total;
};

export type LLMPricing =
  | {
      kind: 'flat';
      inputUsdPerMTokens: number;
      outputUsdPerMTokens: number;
    }
  | {
      kind: 'tiered';
      thresholdPromptTokens: number;
      belowOrEqual: {
        inputUsdPerMTokens: number;
        outputUsdPerMTokens: number;
      };
      above: {
        inputUsdPerMTokens: number;
        outputUsdPerMTokens: number;
      };
    };

export type LLMPricingRates = {
  inputUsdPerMTokens: number;
  outputUsdPerMTokens: number;
};

export const clampTokens = (n: number): number => {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
};

export const resolvePricingRates = (
  pricing: LLMPricing,
  promptTokens: number
): LLMPricingRates => {
  if (pricing.kind === 'flat') {
    return {
      inputUsdPerMTokens: pricing.inputUsdPerMTokens,
      outputUsdPerMTokens: pricing.outputUsdPerMTokens,
    };
  }

  const tier =
    promptTokens <= pricing.thresholdPromptTokens
      ? pricing.belowOrEqual
      : pricing.above;

  return {
    inputUsdPerMTokens: tier.inputUsdPerMTokens,
    outputUsdPerMTokens: tier.outputUsdPerMTokens,
  };
};

export const usdForTokens = (tokens: number, usdPerMTokens: number): number => {
  // pricing is per 1,000,000 tokens
  return (tokens / 1_000_000) * usdPerMTokens;
};

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;
