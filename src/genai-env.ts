import type {
  ChatCompletionMessage,
  LLMAccounting,
  LLMThinking,
} from './genai-base';
import {
  type LLMModel,
  type LLMProvider,
  completeChatModel as baseCompleteChatModel,
  completeChatModels as baseCompleteChatModels,
  completeChat as baseCompleteChat,
  type LLMCompleteChatModels,
  type LLMCompleteChat,
} from './genai';
import { env } from './env';

const keys = {
  openai: env.OPENAI_API_KEY,
  gemini: env.GEMINI_API_KEY,
};

export const completeChatModel = async ({
  model,
  messages,
  thinking,
}: {
  model: LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string, string | null, LLMAccounting] | Error> => {
  return baseCompleteChatModel({
    keys,
    model,
    messages,
    thinking,
  });
};

export const completeChatModels: LLMCompleteChatModels = async ({
  models,
  messages,
  thinking,
}: {
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string, string | null, LLMAccounting] | Error> => {
  return baseCompleteChatModels({
    keys,
    models,
    messages,
    thinking,
  });
};

export const completeChat: LLMCompleteChat = async (
  props:
    | {
        models: (() => LLMModel[]) | LLMModel[] | LLMModel;
        messages: ChatCompletionMessage[] | string;
        thinking?: LLMThinking;
      }
    | {
        messages: ChatCompletionMessage[] | string;
        thinking?: LLMThinking;
        provider?: LLMProvider;
      }
): Promise<[string, string | null, LLMAccounting] | Error> => {
  if ('models' in props) {
    return baseCompleteChat({
      keys,
      models: props.models,
      messages: props.messages,
      thinking: props.thinking,
    });
  }

  return baseCompleteChat({
    keys,
    messages: props.messages,
    thinking: props.thinking,
    provider: props.provider,
  });
};
