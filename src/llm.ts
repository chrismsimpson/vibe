import ldShuffle from 'lodash/shuffle';
import sample from 'lodash/sample';
import type {
  ChatCompletionMessage,
  LLMAccounting,
  LLMThinking,
  LLMTokenUsage,
} from './llm-base';
import {
  type GeminiLLMModel,
  completeChat as completeChatGemini,
  isGeminiLLMModel,
  weightForGeminiModel,
} from './llm-gemini';
import {
  type OpenAILLMModel,
  completeChat as completeChatOpenAI,
  isOpenAILLMModel,
  weightForOpenAIModel,
} from './llm-openai';

export type LLMModel = GeminiLLMModel | OpenAILLMModel;

const llmProviders = ['openai', 'gemini'] as const;

export type LLMProvider = (typeof llmProviders)[number];

// export const getModel = ({
//   thinking,
//   provider
// }: {
//   thinking?: LLMThinking;
//   provider: LLMProvider;
// }): LLMModel => {

//   const _provider = provider ?? sample(llmProviders);

//   const _thinking = thinking ?? 'auto'; // TODO: a different default, perhaps 'medium'?

// }

export type LLMCompleteChat = (args: {
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}) => Promise<[string, string | null, LLMAccounting] | Error>;

export const shuffle = (): LLMModel[] => {
  console.log('Shuffling models');
  return ldShuffle([
    'gemini-2.0-flash',
    'gemini-2.5-pro',
    'o1-mini-2024-09-12',
    'o3-mini-2025-01-31',
  ]);
};

export const thinkingShuffle = (): LLMModel[] => {
  console.log('Shuffling thinking models');
  return ldShuffle(['gemini-2.5-pro', 'o3-mini-2025-01-31']);
};

export const weightForModel = (m: LLMModel): number => {
  if (isGeminiLLMModel(m)) {
    return weightForGeminiModel(m);
  }

  if (isOpenAILLMModel(m)) {
    return weightForOpenAIModel(m);
  }

  return 1.0;
};

export const computeCostUnits = (usage: LLMTokenUsage, m: LLMModel): number => {
  const COST_SCALE = 10;

  const weight = weightForModel(m);

  const billableTokens =
    usage.inputTokens + usage.outputTokens + usage.thinkingTokens;

  const raw = (billableTokens / 1000) * COST_SCALE * weight;

  const units = Math.ceil(raw);

  if (units <= 0) {
    return 1;
  }

  return units;
};

export const completeChatModel = async ({
  keys,
  model,
  messages,
  thinking,
}: {
  keys: {
    openai?: string;
    gemini?: string;
  };
  model: LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string, string | null, LLMAccounting] | Error> => {
  const abbreviatedModelIndex = model.indexOf('-', model.indexOf('-') + 1);

  const abbreviatedModel =
    abbreviatedModelIndex !== -1
      ? model.substring(0, abbreviatedModelIndex)
      : model;

  ///

  const result = isGeminiLLMModel(model)
    ? await completeChatGemini({
        apiKey: keys.gemini,
        model,
        messages,
        thinking,
      })
    : isOpenAILLMModel(model)
      ? await completeChatOpenAI({
          apiKey: keys.openai,
          model,
          messages,
          thinking,
        })
      : null;

  if (result instanceof Error) {
    return result;
  }

  if (result === null) {
    return new Error(`Unknown model: ${model}`);
  }

  const [raw, tokens] = result;

  const accounting: LLMAccounting = {
    tokens,
    costUnits: computeCostUnits(tokens, model),
  };

  return [abbreviatedModel, raw, accounting];
};

export const completeChat = async ({
  keys,
  models,
  messages,
  thinking,
}: {
  keys: {
    openai?: string;
    gemini?: string;
  };
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string, string | null, LLMAccounting] | Error> => {
  if (typeof models !== 'function' && !Array.isArray(models)) {
    return completeChatModel({ keys, model: models, messages, thinking });
  }

  const isFunc = typeof models === 'function';

  const _models = isFunc ? models() : models;

  for (const model of _models) {
    try {
      if (isFunc) {
        console.log('Trying model:', model);
      }

      return await completeChatModel({ keys, model, messages, thinking });
    } catch (error) {
      console.error(error);
    }
  }

  return new Error('Failed to complete chat');
};
