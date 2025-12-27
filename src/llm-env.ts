import type {
  ChatCompletionMessage,
  LLMAccounting,
  LLMThinking,
} from './llm-base';
import {
  type LLMModel,
  completeChatModel as baseCompleteChatModel,
  completeChat as baseCompleteChat,
  type LLMCompleteChat,
} from './llm';
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

export const completeChat: LLMCompleteChat = async ({
  models,
  messages,
  thinking,
}: {
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string, string | null, LLMAccounting] | Error> => {
  return baseCompleteChat({
    keys,
    models,
    messages,
    thinking,
  });
};
