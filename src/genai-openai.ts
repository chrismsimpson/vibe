import {
  type ChatCompletionMessage,
  type LLMThinking,
  LLM_REQUEST_HARDCAP_MS,
  type LLMTokenUsage,
  estimateTokensForMessages,
  estimateTokensForText,
  type LLMPricing,
  isRecord,
} from './genai-base';
import { z } from 'zod';

export const openAIReasoningEffortEnum = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

const defaultReasoningEffort = 'high';

// models

const openAILLMModels = ['gpt-4o-mini-2024-07-18', 'gpt-5.2'] as const;

export type OpenAILLMModel = (typeof openAILLMModels)[number];

export const openAIPricing: Record<OpenAILLMModel, LLMPricing> = {
  // 2026-01-04: input: $0.15; output: $0.60
  'gpt-4o-mini-2024-07-18': {
    kind: 'flat',
    inputUsdPerMTokens: 0.15,
    outputUsdPerMTokens: 0.6,
  },

  // 2026-01-04: input: $1.75; output: $14.00
  'gpt-5.2': {
    kind: 'flat',
    inputUsdPerMTokens: 1.75,
    outputUsdPerMTokens: 14.0,
  },
};

export const isOpenAILLMModel = (model: string): model is OpenAILLMModel =>
  openAILLMModels.includes(model as OpenAILLMModel);

// roles

const openAIChatRequestMessageRole = [
  'user',
  'assistant',
  'system',
  'developer',
] as const;

export type OpenAIChatRequestMessageRole =
  (typeof openAIChatRequestMessageRole)[number];

const isOpenAIChatRequestMessageRole = (
  role: string
): role is OpenAIChatRequestMessageRole =>
  openAIChatRequestMessageRole.includes(role as OpenAIChatRequestMessageRole);

// request

export type OpenAIChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type OpenAIChatMessageContent = string | OpenAIChatContentPart[];

export interface OpenAIChatRequestMessage {
  role: OpenAIChatRequestMessageRole;
  content: OpenAIChatMessageContent;
}

// response

export interface OpenAIChatCompletionResponseMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenAIChatCompletionResponseChoice {
  message: OpenAIChatCompletionResponseMessage;
}

export interface OpenAIChatCompletionResponseUsageCompletionTokensDetails {
  reasoning_tokens?: number;
}

export interface OpenAIChatCompletionResponseUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;

  reasoning_tokens?: number;

  completion_tokens_details?: OpenAIChatCompletionResponseUsageCompletionTokensDetails;
}

export interface OpenAIChatCompletionResponse {
  choices: OpenAIChatCompletionResponseChoice[];
  usage?: OpenAIChatCompletionResponseUsage;
}

export const isOpenAIChatCompletionResponse = (
  response: unknown
): response is OpenAIChatCompletionResponse => {
  if (!isRecord(response)) return false;

  const choices = response.choices;
  if (!Array.isArray(choices)) return false;

  return choices.every(isRecord);
};

// completion

export const completeChatOpenAI = async ({
  apiKey,
  model,
  messages,
  reasoningEffort,
}: {
  apiKey: string;
  model: OpenAILLMModel;
  messages: OpenAIChatRequestMessage[] | string;
  reasoningEffort?: string;
}): Promise<OpenAIChatCompletionResponse | Error> => {
  if (
    reasoningEffort &&
    openAIReasoningEffortEnum.safeParse(reasoningEffort).success === false
  ) {
    return new Error('Invalid reasoning effort value');
  }

  const _messages =
    typeof messages === 'string'
      ? [{ role: 'user', content: messages }]
      : messages;

  const _url = 'https://api.openai.com/v1/chat/completions';

  const _reasoningEffort = reasoningEffort ?? defaultReasoningEffort;

  const _body = JSON.stringify(
    model.startsWith('gpt-5')
      ? {
          model,
          messages: _messages,
          reasoning_effort: _reasoningEffort,
        }
      : {
          model,
          messages: _messages,
        }
  );

  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), LLM_REQUEST_HARDCAP_MS);

  const response = await fetch(_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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

  if (!isOpenAIChatCompletionResponse(json)) {
    return new Error('Invalid OpenAI chat completion response');
  }

  return json as OpenAIChatCompletionResponse;
};

// message mapping

export const completeChatModel = async ({
  apiKey,
  model,
  messages,
  thinking,
}: {
  apiKey?: string;
  model: OpenAILLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string | null, LLMTokenUsage] | Error> => {
  if (!apiKey) {
    return new Error('OpenAI API key is not set');
  }

  const reasoningEffort = getReasoningEffort(thinking);

  const response = await completeChatOpenAI({
    apiKey,
    model,
    messages: toOpenAIChatCompletionRequestMessages(model, messages),
    reasoningEffort,
  });

  if (response instanceof Error) {
    return response;
  }

  const raw = response.choices[0]?.message.content ?? null;

  const inputTokens =
    typeof response.usage?.prompt_tokens === 'number' &&
    Number.isFinite(response.usage?.prompt_tokens)
      ? response.usage?.prompt_tokens
      : estimateTokensForMessages(messages);

  const completionTokens = response.usage?.completion_tokens;

  const reasoningTokensRaw =
    response.usage?.completion_tokens_details?.reasoning_tokens ??
    response.usage?.reasoning_tokens ??
    0;

  const thinkingTokens =
    typeof reasoningTokensRaw === 'number' &&
    Number.isFinite(reasoningTokensRaw)
      ? Math.max(0, Math.floor(reasoningTokensRaw))
      : 0;

  const outputTokens =
    typeof completionTokens === 'number' && Number.isFinite(completionTokens)
      ? Math.max(0, Math.floor(completionTokens) - thinkingTokens)
      : estimateTokensForText(raw ?? '');

  const tokens: LLMTokenUsage = {
    inputTokens,
    outputTokens,
    thinkingTokens,
  };

  return [raw, tokens];
};

export const toOpenAIChatCompletionRequestMessages = (
  model: OpenAILLMModel,
  messages: ChatCompletionMessage[] | string
): OpenAIChatRequestMessage[] | string => {
  return typeof messages === 'string'
    ? messages
    : messages.map(m => {
        let _role =
          m.role && isOpenAIChatRequestMessageRole(m.role) ? m.role : null;

        if (model.startsWith('o1') && _role !== 'user') {
          _role = 'user';
        }

        return {
          role: _role ?? 'user',
          content: m.content,
        };
      });
};

// heuristics

export const getReasoningEffort = (
  thinking?: LLMThinking
): string | undefined => {
  let reasoningEffort: string | undefined;

  if (thinking !== undefined) {
    if (typeof thinking === 'number') {
      if (thinking <= 0) {
        reasoningEffort = 'none';
      } else if (thinking <= 512) {
        reasoningEffort = 'minimal';
      } else if (thinking <= 2048) {
        reasoningEffort = 'low';
      } else if (thinking <= 8192) {
        reasoningEffort = 'medium';
      } else if (thinking <= 16384) {
        reasoningEffort = 'high';
      } else {
        reasoningEffort = 'xhigh';
      }
    } else {
      if (thinking === 'default' || thinking === 'auto') {
        reasoningEffort = undefined;
      }

      if (thinking === 'off') {
        reasoningEffort = 'none';
      }

      if (thinking === 'low') {
        reasoningEffort = 'low';
      }

      if (thinking === 'medium') {
        reasoningEffort = 'medium';
      }

      if (thinking === 'high') {
        reasoningEffort = 'high';
      }

      if (thinking === 'max') {
        reasoningEffort = 'xhigh';
      }
    }
  }

  return reasoningEffort;
};

// model resolution

export const getOpenAIModel = (thinking: LLMThinking): OpenAILLMModel => {
  if (thinking === 'off') {
    return 'gpt-4o-mini-2024-07-18';
  }

  return 'gpt-5.2';
};
