import {
  type ChatCompletionMessage,
  type LLMThinking,
  LLM_REQUEST_HARDCAP_MS,
  type LLMTokenUsage,
  estimateTokensForMessages,
  estimateTokensForText,
} from './llm-base';
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

const openAILLMModels = [
  'o1-mini-2024-09-12',
  'o3-mini-2025-01-31',
  'o4-mini-2025-04-16',
  'o3-2025-04-16',
  'gpt-4o-mini-2024-07-18',
  'gpt-5',
  'gpt-5.1',
  'gpt-5.2',
] as const;

export type OpenAILLMModel = (typeof openAILLMModels)[number];

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

// export interface OpenAIChatRequestMessage {
//   role: OpenAIChatRequestMessageRole;
//   content: string;
// }

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
  // biome-ignore lint/suspicious/noExplicitAny: ¯\_(ツ)_/¯
  response: any
): response is OpenAIChatCompletionResponse => {
  return (
    response &&
    Array.isArray(response.choices) &&
    // biome-ignore lint/suspicious/noExplicitAny: ¯\_(ツ)_/¯
    response.choices.every((choice: any) => typeof choice === 'object')
  );
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

  const promptTokens = response.usage?.prompt_tokens;
  const completionTokens = response.usage?.completion_tokens;
  const totalTokens = response.usage?.total_tokens;

  const reasoningTokens =
    response.usage?.completion_tokens_details?.reasoning_tokens ??
    response.usage?.reasoning_tokens ??
    0;

  let estimated = false;

  const inputTokens = (() => {
    if (typeof promptTokens === 'number' && Number.isFinite(promptTokens)) {
      return promptTokens;
    }

    estimated = true;

    return estimateTokensForMessages(messages);
  })();

  const outputTokens = (() => {
    if (
      typeof completionTokens === 'number' &&
      Number.isFinite(completionTokens)
    ) {
      return completionTokens;
    }

    estimated = true;

    return estimateTokensForText(raw ?? '');
  })();

  const thinkingTokens =
    typeof reasoningTokens === 'number' && Number.isFinite(reasoningTokens)
      ? reasoningTokens
      : 0;

  const total = (() => {
    if (typeof totalTokens === 'number' && Number.isFinite(totalTokens)) {
      return totalTokens;
    }

    if (estimated === false) {
      estimated = true;
    }

    return inputTokens + outputTokens + thinkingTokens;
  })();

  const tokens: LLMTokenUsage = {
    inputTokens,
    outputTokens,
    thinkingTokens,
    totalTokens: total,
    estimated,
  };

  return [raw, tokens];
};

// message mapping

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

// cost weighting

export const weightForOpenAIModel = (m: OpenAILLMModel): number => {
  if (m.startsWith('gpt-5')) {
    return 2.5;
  }

  if (m === 'o3-2025-04-16') {
    return 2.0;
  }

  if (m === 'o4-mini-2025-04-16') {
    return 1.2;
  }

  if (m === 'o3-mini-2025-01-31') {
    return 1.0;
  }

  if (m === 'o1-mini-2024-09-12') {
    return 0.8;
  }

  if (m === 'gpt-4o-mini-2024-07-18') {
    return 0.7;
  }

  return 1.0;
};

// model resolution

export const getOpenAIModel = (thinking: LLMThinking): OpenAILLMModel => {
  if (thinking === 'off') {
    return 'gpt-4o-mini-2024-07-18';
  }

  return 'gpt-5.2';
};
