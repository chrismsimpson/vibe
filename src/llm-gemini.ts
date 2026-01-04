import {
  type ChatCompletionMessage,
  type LLMThinking,
  LLM_REQUEST_HARDCAP_MS,
  type LLMTokenUsage,
  estimateTokensForMessages,
  estimateTokensForText,
  type LLMPricing,
} from './llm-base';

// models

const geminiLLMModels = [
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
] as const;

export type GeminiLLMModel = (typeof geminiLLMModels)[number];

export const geminiPricing: Record<GeminiLLMModel, LLMPricing> = {
  // 2026-01-04: input: $0.10 (text / image / video), $0.70 (audio); output: $0.40
  'gemini-2.0-flash': {
    kind: 'flat',
    inputUsdPerMTokens: 0.1,
    outputUsdPerMTokens: 0.4,
  },

  // 2026-01-04: input: $1.25, prompts <= 200k tokens, $2.50, prompts > 200k tokens; output: $10.00, prompts <= 200k tokens, $15.00, prompts > 200k
  'gemini-2.5-pro': {
    kind: 'tiered',
    thresholdPromptTokens: 200_000,
    belowOrEqual: {
      inputUsdPerMTokens: 1.25,
      outputUsdPerMTokens: 10.0,
    },
    above: {
      inputUsdPerMTokens: 2.5,
      outputUsdPerMTokens: 15.0,
    },
  },

  // 2026-01-04: input: $0.50 (text / image / video), $1.00 (audio); output: $3.00
  'gemini-3-flash-preview': {
    kind: 'flat',
    inputUsdPerMTokens: 0.5,
    outputUsdPerMTokens: 3.0,
  },

  // 2026-01-04: input: $2.00, prompts <= 200k tokens, $4.00, prompts > 200k tokens; output: $12.00, prompts <= 200k tokens, $18.00, prompts > 200k
  'gemini-3-pro-preview': {
    kind: 'tiered',
    thresholdPromptTokens: 200_000,
    belowOrEqual: { inputUsdPerMTokens: 2.0, outputUsdPerMTokens: 12.0 },
    above: { inputUsdPerMTokens: 4.0, outputUsdPerMTokens: 18.0 },
  },
};

export const isGeminiLLMModel = (model: string): model is GeminiLLMModel =>
  geminiLLMModels.includes(model as GeminiLLMModel);

// roles

const geminiAIChatRequestMessageRole = ['user', 'model'] as const;

export type GeminiChatRequestMessageRole =
  (typeof geminiAIChatRequestMessageRole)[number];

export const isGeminiChatRequestMessageRole = (
  role: string
): role is GeminiChatRequestMessageRole =>
  geminiAIChatRequestMessageRole.includes(role as GeminiChatRequestMessageRole);

// request

export interface GeminiChatCompletionRequestMessagePart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

export interface GeminiChatCompletionRequestMessage {
  role: string;
  parts: GeminiChatCompletionRequestMessagePart[];
}

// response

export interface GeminiChatCompletionResponseCandidatePart {
  text: string;
}

export interface GeminiChatCompletionResponseCandidateContent {
  role: string;
  parts: GeminiChatCompletionResponseCandidatePart[];
}

export interface GeminiChatCompletionResponseCandidate {
  content: GeminiChatCompletionResponseCandidateContent;
}

export interface GeminiChatCompletionResponseUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiChatCompletionResponse {
  candidates: GeminiChatCompletionResponseCandidate[];
  usageMetadata?: GeminiChatCompletionResponseUsageMetadata;
}

export const isGeminiChatCompletionResponse = (
  // biome-ignore lint/suspicious/noExplicitAny: ¯\_(ツ)_/¯
  response: any
): response is GeminiChatCompletionResponse => {
  return (
    response &&
    Array.isArray(response.candidates) &&
    // biome-ignore lint/suspicious/noExplicitAny: ¯\_(ツ)_/¯
    response.candidates.every((candidate: any) => typeof candidate === 'object')
  );
};

// completion

export const completeChatGemini = async ({
  apiKey,
  model,
  messages,
  thinkingBudget,
}: {
  apiKey: string;
  model: GeminiLLMModel;
  messages: GeminiChatCompletionRequestMessage[] | string;
  thinkingBudget?: number;
}): Promise<GeminiChatCompletionResponse | Error> => {
  const _messages =
    typeof messages === 'string' ? [{ parts: [{ text: messages }] }] : messages;

  const _url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const _isProLikeModel = isProLikeModel(model);

  const minThinkingBudget = _isProLikeModel ? 128 : 0;
  const maxThinkingBudget = _isProLikeModel ? 32768 : 24576;

  const canDisableThinking = _isProLikeModel === false;

  if (thinkingBudget !== undefined) {
    if (Number.isInteger(thinkingBudget) === false) {
      return new Error('Gemini thinkingBudget must be an integer');
    }

    if (thinkingBudget < -1) {
      return new Error(
        'Gemini thinkingBudget must be -1 or a non-negative integer'
      );
    }

    if (thinkingBudget === 0 && canDisableThinking === false) {
      return new Error(
        `Gemini model ${model} cannot disable thinking (thinkingBudget = 0)`
      );
    }

    if (thinkingBudget > 0) {
      if (
        thinkingBudget < minThinkingBudget ||
        thinkingBudget > maxThinkingBudget
      ) {
        return new Error(
          `Gemini thinkingBudget out of range for ${model}: ${thinkingBudget} (allowed: -1, 0${canDisableThinking ? '' : ' (not allowed)'} or ${minThinkingBudget}..${maxThinkingBudget})`
        );
      }
    }
  }

  const thinkingConfig = {
    includeThoughts: false,
    thinkingBudget: thinkingBudget !== undefined ? thinkingBudget : undefined,
  };

  const generationConfig = {
    thinkingConfig,
    maxOutputTokens: 65536,
  };

  const _body = JSON.stringify({
    contents: _messages,
    generationConfig,
  });

  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), LLM_REQUEST_HARDCAP_MS);

  const response = await fetch(_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: _body,
    signal: controller.signal,
  });

  clearTimeout(timer);

  if (!response.ok) {
    console.error(await response.text());

    return new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();

  if (!isGeminiChatCompletionResponse(json)) {
    return new Error('Invalid Gemini chat completion response');
  }

  return json as GeminiChatCompletionResponse;
};

export const completeChatModel = async ({
  apiKey,
  model,
  messages,
  thinking,
}: {
  apiKey?: string;
  model: GeminiLLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string | null, LLMTokenUsage] | Error> => {
  if (!apiKey) {
    return new Error('Gemini API key is not set');
  }

  const thinkingBudget = getGeminiThinkingBudget(model, thinking);

  const response = await completeChatGemini({
    apiKey,
    model,
    messages: toGeminiChatCompletionRequestMessages(messages),
    thinkingBudget,
  });

  if (response instanceof Error) {
    return response;
  }

  const raw =
    response.candidates[0]?.content.parts.map(part => part.text).join('\n') ??
    null;

  const inputTokens =
    typeof response.usageMetadata?.promptTokenCount === 'number' &&
    Number.isFinite(response.usageMetadata?.promptTokenCount)
      ? response.usageMetadata?.promptTokenCount
      : estimateTokensForMessages(messages);

  const outputTokens =
    typeof response.usageMetadata?.candidatesTokenCount === 'number' &&
    Number.isFinite(response.usageMetadata?.candidatesTokenCount)
      ? response.usageMetadata?.candidatesTokenCount
      : estimateTokensForText(raw ?? '');

  const thinkingTokens = 0;

  const tokens: LLMTokenUsage = {
    inputTokens,
    outputTokens,
    thinkingTokens,
  };

  return [raw, tokens];
};

// message mapping

const parseDataUri = (url: string) => {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (match && match.length === 3) {
    // biome-ignore lint/style/noNonNullAssertion: ¯\_(ツ)_/¯
    return { mime_type: match[1]!, data: match[2]! };
  }
  return null;
};

export const toGeminiChatCompletionRequestMessages = (
  messages: ChatCompletionMessage[] | string
): GeminiChatCompletionRequestMessage[] | string => {
  if (typeof messages === 'string') return messages;

  return messages.map(m => {
    let _role =
      m.role && isGeminiChatRequestMessageRole(m.role) ? m.role : null;

    if (m.role === 'system' || m.role === 'developer') {
      _role = 'model';
    }

    // handle generic content parts mapping

    const parts: GeminiChatCompletionRequestMessagePart[] = [];

    if (typeof m.content === 'string') {
      parts.push({ text: m.content });
    } else {
      for (const part of m.content) {
        if (part.type === 'text') {
          parts.push({ text: part.text });
        } else if (part.type === 'image_url') {
          // attempt to parse Data URI for Gemini

          const imageData = parseDataUri(part.image_url.url);

          if (imageData) {
            parts.push({ inline_data: imageData });
          } else {
            // fallback: If not a data URI, pass URL as text
            // (gemini cannot fetch public URLs natively without tools)

            parts.push({ text: part.image_url.url });
          }
        }
      }
    }

    return {
      role: _role ?? 'user',
      parts,
    };
  });
};

// heuristics

const isProLikeModel = (model: GeminiLLMModel): boolean =>
  model === 'gemini-2.5-pro' || model === 'gemini-3-pro-preview';

const maxThinkingBudget = (model: GeminiLLMModel): number =>
  isProLikeModel(model) ? 32768 : 24576;

export const getGeminiThinkingBudget = (
  model: GeminiLLMModel,
  thinking?: LLMThinking
): number | undefined => {
  let thinkingBudget: number | undefined;

  if (thinking !== undefined) {
    if (typeof thinking === 'number') {
      thinkingBudget = thinking;
    } else {
      if (thinking === 'default') {
        thinkingBudget = undefined;
      }

      if (thinking === 'off') {
        thinkingBudget = 0;
      }

      if (thinking === 'auto') {
        thinkingBudget = -1;
      }

      if (thinking === 'low') {
        thinkingBudget = 1024;
      }

      if (thinking === 'medium') {
        thinkingBudget = 4096;
      }

      if (thinking === 'high') {
        thinkingBudget = 8192;
      }

      if (thinking === 'max') {
        thinkingBudget = maxThinkingBudget(model);
      }
    }
  }

  return thinkingBudget;
};

// model resolution

export const getGeminiModel = (thinking: LLMThinking): GeminiLLMModel => {
  // handle numeric values

  if (typeof thinking === 'number') {
    if (thinking > 4096) {
      return 'gemini-3-pro-preview';
    }

    return 'gemini-3-flash-preview';
  }

  // handle named values

  switch (thinking) {
    case 'default':
    case 'off':
      return 'gemini-2.0-flash';

    case 'auto':
    case 'low':
    case 'medium':
      return 'gemini-3-flash-preview';

    case 'high':
    case 'max':
      return 'gemini-3-pro-preview';
  }
};
