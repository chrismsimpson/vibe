import ldShuffle from 'lodash/shuffle';
import sample from 'lodash/sample';
import {
  type ChatCompletionMessage,
  type LLMAccounting,
  type LLMThinking,
  type LLMTokenUsage,
  type LLMPricing,
  clampTokens,
  resolvePricingRates,
  usdForTokens,
} from './genai-base';
import {
  type GeminiLLMModel,
  completeChatModel as completeChatGeminiModel,
  isGeminiLLMModel,
  geminiPricing,
  getGeminiModel,
} from './genai-gemini';
import {
  type OpenAILLMModel,
  completeChatModel as completeChatOpenAIModel,
  isOpenAILLMModel,
  openAIPricing,
  getOpenAIModel,
} from './genai-openai';

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
  return ldShuffle(['gemini-2.0-flash', 'gpt-4o-mini-2024-07-18']);
};

export const thinkingShuffle = (): LLMModel[] => {
  console.log('Shuffling thinking models');
  return ldShuffle(['gemini-3-pro-preview', 'gpt-5.2']);
};

export const getPricingForModel = (model: LLMModel): LLMPricing => {
  if (isGeminiLLMModel(model)) {
    const m = model as GeminiLLMModel;
    return geminiPricing[m];
  }

  if (isOpenAILLMModel(model)) {
    const m = model as OpenAILLMModel;
    return openAIPricing[m];
  }

  // LLMModel is an exhaustive union, so this
  // should be unreachable, but to be safe

  throw new Error(`No pricing found for model: ${model}`);
};

export const computeInputCostUsd = (args: {
  model: LLMModel;
  inputTokens: number;
}): number => {
  const promptTokens = clampTokens(args.inputTokens);
  const pricing = getPricingForModel(args.model);
  const rates = resolvePricingRates(pricing, promptTokens);

  return usdForTokens(promptTokens, rates.inputUsdPerMTokens);
};

export const computeOutputCostUsd = (args: {
  model: LLMModel;
  promptTokens: number; // needed for tiered pricing selection
  outputTokens: number;
  thinkingTokens?: number;
}): number => {
  const promptTokens = clampTokens(args.promptTokens);
  const outputTokens = clampTokens(args.outputTokens);
  const thinkingTokens = clampTokens(args.thinkingTokens ?? 0);

  const pricing = getPricingForModel(args.model);
  const rates = resolvePricingRates(pricing, promptTokens);

  // billable output includes "thinking"/reasoning tokens when they exist
  const billableOutputTokens = outputTokens + thinkingTokens;

  return usdForTokens(billableOutputTokens, rates.outputUsdPerMTokens);
};

export const computeCostUsd = (args: {
  model: LLMModel;
  usage: Pick<LLMTokenUsage, 'inputTokens' | 'outputTokens' | 'thinkingTokens'>;
}): { inputUsd: number; outputUsd: number; totalUsd: number } => {
  const inputUsd = computeInputCostUsd({
    model: args.model,
    inputTokens: args.usage.inputTokens,
  });

  const outputUsd = computeOutputCostUsd({
    model: args.model,
    promptTokens: args.usage.inputTokens,
    outputTokens: args.usage.outputTokens,
    thinkingTokens: args.usage.thinkingTokens,
  });

  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  };
};

export const abbreviateModelName = (model: LLMModel): string => {
  const previewSuffix = /-preview$/;

  const dateSuffix = /-\d{4}-\d{2}-\d{2}$/;

  // apply both rules safely (order doesn't really
  // matter here, but this is explicit)

  let out = model.replace(previewSuffix, '');

  out = out.replace(dateSuffix, '');

  return out;
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
  const abbreviatedModel = abbreviateModelName(model);

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

  const cost = computeCostUsd({
    model,
    usage: {
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      thinkingTokens: tokens.thinkingTokens,
    },
  });

  const accounting: LLMAccounting = {
    tokens,
    costUsd: cost.totalUsd,
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
