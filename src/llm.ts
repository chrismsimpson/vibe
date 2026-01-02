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
  completeChatModel as completeChatGeminiModel,
  isGeminiLLMModel,
  weightForGeminiModel,
  getGeminiModel,
} from './llm-gemini';
import {
  type OpenAILLMModel,
  completeChatModel as completeChatOpenAIModel,
  isOpenAILLMModel,
  weightForOpenAIModel,
  getOpenAIModel,
} from './llm-openai';

export type LLMModel = GeminiLLMModel | OpenAILLMModel;

const llmProviders = ['openai', 'gemini'] as const;

export type LLMProvider = (typeof llmProviders)[number];

export type LLMCompleteChatModels = (args: {
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}) => Promise<[string, string | null, LLMAccounting] | Error>;

export type LLMCompleteChat = (
  args:
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
) => Promise<[string, string | null, LLMAccounting] | Error>;

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
    ? await completeChatGeminiModel({
        apiKey: keys.gemini,
        model,
        messages,
        thinking,
      })
    : isOpenAILLMModel(model)
      ? await completeChatOpenAIModel({
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

type LLMKeys = {
  openai?: string;
  gemini?: string;
};

export const completeChatModels = async ({
  keys,
  models,
  messages,
  thinking,
}: {
  keys: LLMKeys;
  models: (() => LLMModel[]) | LLMModel[] | LLMModel;
  messages: ChatCompletionMessage[] | string;
  thinking?: LLMThinking;
}): Promise<[string, string | null, LLMAccounting] | Error> => {
  if (typeof models !== 'function' && !Array.isArray(models)) {
    return completeChatModel({ keys, model: models, messages, thinking });
  }

  const isFunc = typeof models === 'function';

  const _models = isFunc ? models() : models;

  let lastErr: Error | null = null;

  for (const model of _models) {
    if (isFunc) {
      console.log('Trying model:', model);
    }

    try {
      const r = await completeChatModel({ keys, model, messages, thinking });

      if (!(r instanceof Error)) {
        return r;
      }

      lastErr = r;

      console.error(r);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));

      lastErr = e;

      console.error(e);
    }
  }

  return lastErr ?? new Error('Failed to complete chat');
};

export const getModel = ({
  thinking,
  provider,
}: {
  thinking?: LLMThinking;
  provider?: LLMProvider;
}): [LLMProvider, LLMThinking, LLMModel] | Error => {
  const _provider = provider ?? sample(llmProviders);

  const _thinking = thinking ?? 'medium'; // 'medium' is our default so we get decent quality outputs but we're not being exorbitant

  if (_provider === 'gemini') {
    return [_provider, _thinking, getGeminiModel(_thinking)];
  }

  if (_provider === 'openai') {
    return [_provider, _thinking, getOpenAIModel(_thinking)];
  }

  return new Error(`Unknown provider: ${_provider}`);
};

export const completeChat = async (
  props:
    | {
        keys: LLMKeys;
        models: (() => LLMModel[]) | LLMModel[] | LLMModel;
        messages: ChatCompletionMessage[] | string;
        thinking?: LLMThinking;
      }
    | {
        keys: LLMKeys;
        messages: ChatCompletionMessage[] | string;
        thinking?: LLMThinking;
        provider?: LLMProvider;
      }
): Promise<[string, string | null, LLMAccounting] | Error> => {
  if ('models' in props) {
    return completeChatModels({
      keys: props.keys,
      models: props.models,
      messages: props.messages,
      thinking: props.thinking,
    });
  }

  const modelResult = getModel({
    thinking: props.thinking,
    provider: props.provider,
  });

  if (modelResult instanceof Error) {
    return modelResult;
  }

  const [, resolvedThinking, model] = modelResult;

  return completeChatModel({
    keys: props.keys,
    model,
    messages: props.messages,
    thinking: resolvedThinking,
  });
};

export const isLLMModel = (m: string): m is LLMModel => {
  return isGeminiLLMModel(m) || isOpenAILLMModel(m);
};

export const isLLMProvider = (p: string): p is LLMProvider => {
  return llmProviders.includes(p as LLMProvider);
};

export const inferProviderForModel = (m: LLMModel): LLMProvider | null => {
  if (isGeminiLLMModel(m)) {
    return 'gemini';
  }

  if (isOpenAILLMModel(m)) {
    return 'openai';
  }

  return null;
};
