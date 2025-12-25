import {
  type ChatCompletionMessage,
  CONSOLE_LOG,
  type LLMThinking,
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

export interface OpenAIChatRequestMessage {
  role: OpenAIChatRequestMessageRole;
  content: string;
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

  if (CONSOLE_LOG) {
    console.log(_url);
  }

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

  if (CONSOLE_LOG) {
    console.log(_body);
  }

  const controller = new AbortController();

  const REQUEST_HARDCAP_MS = 10 * 60_000; // 10 minutes
  const timer = setTimeout(() => controller.abort(), REQUEST_HARDCAP_MS);

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

  if (CONSOLE_LOG) {
    console.log(response);
  }

  if (!response.ok) {
    return new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();

  if (!isOpenAIChatCompletionResponse(json)) {
    return new Error('Invalid OpenAI chat completion response');
  }

  if (CONSOLE_LOG) {
    console.log(json);
  }

  return json as OpenAIChatCompletionResponse;
};

// conversion

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
