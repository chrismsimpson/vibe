import ldShuffle from 'lodash/shuffle';
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

  // const tokenSplitRegex = /\s+/;

  // const estimateTokensForText = (text: string): number => {
  //   const words = text.split(tokenSplitRegex).filter(w => w.length > 0);

  //   let tokenEstimate = 0;

  //   const incTokensEstimate = (w: string) => {
  //     tokenEstimate += Math.ceil(w.length / 3);
  //   };

  //   words.forEach(incTokensEstimate);

  //   return tokenEstimate;
  // };

  // const estimateTokensForMessages = (
  //   msgs: ChatCompletionMessage[] | string
  // ): number => {
  //   if (typeof msgs === 'string') {
  //     return estimateTokensForText(msgs);
  //   }

  //   let total = 0;

  //   for (const m of msgs) {
  //     total += estimateTokensForText(m.content ?? '');
  //   }

  //   return total;
  // };

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

  // if (isGeminiLLMModel(model)) {
  //   const geminiApiKey = keys.gemini;

  //   if (!geminiApiKey) {
  //     return new Error('Gemini API key is not set');
  //   }

  //   const thinkingBudget = getGeminiThinkingBudget(model, thinking);

  //   const response = await completeChatGemini({
  //     apiKey: geminiApiKey,
  //     model,
  //     messages: toGeminiChatCompletionRequestMessages(messages),
  //     thinkingBudget,
  //   });

  //   if (response instanceof Error) {
  //     return response;
  //   }

  //   const raw =
  //     response.candidates[0]?.content.parts.map(part => part.text).join('\n') ??
  //     null;

  //   const promptTokens = response.usageMetadata?.promptTokenCount;
  //   const completionTokens = response.usageMetadata?.candidatesTokenCount;
  //   const totalTokens = response.usageMetadata?.totalTokenCount;

  //   let estimated = false;

  //   const inputTokens = (() => {
  //     if (typeof promptTokens === 'number' && Number.isFinite(promptTokens)) {
  //       return promptTokens;
  //     }

  //     estimated = true;

  //     return estimateTokensForMessages(messages);
  //   })();

  //   const outputTokens = (() => {
  //     if (
  //       typeof completionTokens === 'number' &&
  //       Number.isFinite(completionTokens)
  //     ) {
  //       return completionTokens;
  //     }

  //     estimated = true;

  //     return estimateTokensForText(raw ?? '');
  //   })();

  //   const thinkingTokens = 0;

  //   const total = (() => {
  //     if (typeof totalTokens === 'number' && Number.isFinite(totalTokens)) {
  //       return totalTokens;
  //     }

  //     if (estimated === false) {
  //       estimated = true;
  //     }

  //     return inputTokens + outputTokens + thinkingTokens;
  //   })();

  //   const tokens: LLMTokenUsage = {
  //     inputTokens,
  //     outputTokens,
  //     thinkingTokens,
  //     totalTokens: total,
  //     estimated,
  //   };

  //   const accounting: LLMAccounting = {
  //     tokens,
  //     costUnits: computeCostUnits(tokens, model),
  //   };

  //   return [abbreviatedModel, raw, accounting];
  // }

  // if (isOpenAILLMModel(model)) {
  //   const openAIApiKey = keys.openai;

  //   if (!openAIApiKey) {
  //     return new Error('OpenAI API key is not set');
  //   }

  //   const reasoningEffort = getReasoningEffort(thinking);

  //   const response = await completeChatOpenAI({
  //     apiKey: openAIApiKey,
  //     model,
  //     messages: toOpenAIChatCompletionRequestMessages(model, messages),
  //     reasoningEffort,
  //   });

  //   if (response instanceof Error) {
  //     return response;
  //   }

  //   const raw = response.choices[0]?.message.content ?? null;

  //   const promptTokens = response.usage?.prompt_tokens;
  //   const completionTokens = response.usage?.completion_tokens;
  //   const totalTokens = response.usage?.total_tokens;

  //   const reasoningTokens =
  //     response.usage?.completion_tokens_details?.reasoning_tokens ??
  //     response.usage?.reasoning_tokens ??
  //     0;

  //   let estimated = false;

  //   const inputTokens = (() => {
  //     if (typeof promptTokens === 'number' && Number.isFinite(promptTokens)) {
  //       return promptTokens;
  //     }

  //     estimated = true;

  //     return estimateTokensForMessages(messages);
  //   })();

  //   const outputTokens = (() => {
  //     if (
  //       typeof completionTokens === 'number' &&
  //       Number.isFinite(completionTokens)
  //     ) {
  //       return completionTokens;
  //     }

  //     estimated = true;

  //     return estimateTokensForText(raw ?? '');
  //   })();

  //   const thinkingTokens =
  //     typeof reasoningTokens === 'number' && Number.isFinite(reasoningTokens)
  //       ? reasoningTokens
  //       : 0;

  //   const total = (() => {
  //     if (typeof totalTokens === 'number' && Number.isFinite(totalTokens)) {
  //       return totalTokens;
  //     }

  //     if (estimated === false) {
  //       estimated = true;
  //     }

  //     return inputTokens + outputTokens + thinkingTokens;
  //   })();

  //   const tokens: LLMTokenUsage = {
  //     inputTokens,
  //     outputTokens,
  //     thinkingTokens,
  //     totalTokens: total,
  //     estimated,
  //   };

  //   const accounting: LLMAccounting = {
  //     tokens,
  //     costUnits: computeCostUnits(tokens, model),
  //   };

  //   return [abbreviatedModel, raw, accounting];
  // }

  // return new Error(`Unknown model: ${model}`);
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
