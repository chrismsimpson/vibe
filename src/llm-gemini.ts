import {
  type ChatCompletionMessage,
  CONSOLE_LOG,
  type LLMThinking,
} from './llm-base';

// models

const geminiLLMModels = [
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-3-pro-preview',
] as const;

export type GeminiLLMModel = (typeof geminiLLMModels)[number];

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
  text: string;
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

  if (CONSOLE_LOG) {
    console.log(_url);
  }

  const isProLikeModel =
    model === 'gemini-2.5-pro' || model === 'gemini-3-pro-preview';

  const minThinkingBudget = isProLikeModel ? 128 : 0;
  const maxThinkingBudget = isProLikeModel ? 32768 : 24576;

  const canDisableThinking = isProLikeModel === false;

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

  if (CONSOLE_LOG) {
    console.log(_body);
  }

  const response = await fetch(_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: _body,
  });

  if (CONSOLE_LOG) {
    console.log(response);
  }

  if (!response.ok) {
    return new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();

  if (!isGeminiChatCompletionResponse(json)) {
    return new Error('Invalid Gemini chat completion response');
  }

  if (CONSOLE_LOG) {
    console.log(json);
  }

  return json as GeminiChatCompletionResponse;
};

// conversion

export const toGeminiChatCompletionRequestMessages = (
  messages: ChatCompletionMessage[] | string
): GeminiChatCompletionRequestMessage[] | string => {
  return typeof messages === 'string'
    ? messages
    : messages.map(m => {
        let _role =
          m.role && isGeminiChatRequestMessageRole(m.role) ? m.role : null;

        if (m.role === 'system' || m.role === 'developer') {
          _role = 'model';
        }

        return {
          role: _role ?? 'user',
          parts: [{ text: m.content }],
        };
      });
};

const isProLikeModel = (model: GeminiLLMModel): boolean =>
  model === 'gemini-2.5-pro' || model === 'gemini-3-pro-preview';

const maxThinkingBudget = (model: GeminiLLMModel): number =>
  isProLikeModel(model) ? 32768 : 24576;

export const getThinkingBudget = (
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

// cost weighting

export const weightForGeminiModel = (m: GeminiLLMModel): number => {
  if (m === 'gemini-3-pro-preview') {
    return 2.0;
  }

  if (m === 'gemini-2.5-pro') {
    return 1.6;
  }

  if (m === 'gemini-2.0-flash') {
    return 0.5;
  }

  return 1.0;
};
