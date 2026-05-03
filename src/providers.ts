import type { CorvynConfig, RoutingConfig } from './config';
import type { TaskCategory } from './classifier';
import { resolveProviderConflicts, type DedupResult } from './deduplicator';

export type ProviderTier = 'free' | 'paid' | 'local' | 'openrouter';

export interface Provider {
  name: string;
  tier: ProviderTier;
  baseUrl: string;
  apiKey?: string;
  modelId: string;
  rpm?: number;
  rpd?: number;
  tpm?: number;
  headers?: Record<string, string>;
}

const BASE_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  sambanova: 'https://api.sambanova.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  kimi: 'https://api.moonshot.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  ollama: 'http://localhost:11434/v1',
  anthropic: 'https://api.anthropic.com/v1',
  'opencode-go': 'https://opencode.ai/zen/go/v1',
  'opencode-zen': 'https://opencode.ai/zen/v1',
};

const DEFAULT_RPM: Record<string, number> = {
  gemini: 15,
  mistral: 15,
};

const DEFAULT_RPD: Record<string, number> = {
  gemini: 1500,
  mistral: 1000,
};

function mapProviderTier(raw: string): ProviderTier {
  switch (raw) {
    case 'anthropic':
    case 'openai':
    case 'deepseek':
    case 'groq':
    case 'cerebras':
    case 'sambanova':
    case 'kimi':
    case 'opencode-go':
    case 'opencode-zen':
      return 'paid';
    case 'ollama':
      return 'local';
    case 'openrouter':
      return 'openrouter';
    default:
      return 'free';
  }
}

export function getAvailableProviders(config: CorvynConfig): Provider[] {
  const providers: Provider[] = [];
  const p = config.providers;

  if (p.groq.enabled && p.groq.api_key !== '') {
    providers.push({
      name: 'groq',
      tier: 'paid',
      baseUrl: BASE_URLS.groq!,
      apiKey: p.groq.api_key,
      modelId: p.groq.models[0] ?? 'openai/gpt-oss-120b',
    });
  }

  if (p.gemini.enabled && p.gemini.api_key !== '') {
    providers.push({
      name: 'gemini',
      tier: 'free',
      baseUrl: BASE_URLS.gemini!,
      apiKey: p.gemini.api_key,
      modelId: p.gemini.models[0] ?? 'gemini-2.5-flash',
      rpm: p.gemini.rpm ?? DEFAULT_RPM.gemini,
      rpd: p.gemini.rpd ?? DEFAULT_RPD.gemini,
    });
  }

  if (p.cerebras.enabled && p.cerebras.api_key !== '') {
    providers.push({
      name: 'cerebras',
      tier: 'paid',
      baseUrl: BASE_URLS.cerebras!,
      apiKey: p.cerebras.api_key,
      modelId: p.cerebras.models[0] ?? 'llama3.1-70b',
    });
  }

  if (p.sambanova.enabled && p.sambanova.api_key !== '') {
    providers.push({
      name: 'sambanova',
      tier: 'paid',
      baseUrl: BASE_URLS.sambanova!,
      apiKey: p.sambanova.api_key,
      modelId: p.sambanova.models[0] ?? 'Meta-Llama-3.3-70B-Instruct',
    });
  }

  if (p.mistral.enabled && p.mistral.api_key !== '') {
    providers.push({
      name: 'mistral',
      tier: 'free',
      baseUrl: BASE_URLS.mistral!,
      apiKey: p.mistral.api_key,
      modelId: p.mistral.models[0] ?? 'mistral-small-latest',
      rpm: p.mistral.rpm ?? DEFAULT_RPM.mistral,
      rpd: p.mistral.rpd ?? DEFAULT_RPD.mistral,
      tpm: p.mistral.tpm,
    });
  }

  if (p.anthropic.enabled && p.anthropic.api_key !== '') {
    providers.push({
      name: 'anthropic',
      tier: 'paid',
      baseUrl: BASE_URLS.anthropic!,
      apiKey: p.anthropic.api_key,
      modelId: p.anthropic.models[0] ?? 'claude-sonnet-4-20250514',
    });
  }

  if (p.openai.enabled && p.openai.api_key !== '') {
    providers.push({
      name: 'openai',
      tier: 'paid',
      baseUrl: BASE_URLS.openai!,
      apiKey: p.openai.api_key,
      modelId: p.openai.models[0] ?? 'gpt-4o',
    });
  }

  if (p.deepseek.enabled && p.deepseek.api_key !== '') {
    providers.push({
      name: 'deepseek',
      tier: 'paid',
      baseUrl: BASE_URLS.deepseek!,
      apiKey: p.deepseek.api_key,
      modelId: p.deepseek.models[0] ?? 'deepseek-chat',
    });
  }

  if (p.kimi.enabled && p.kimi.api_key !== '') {
    providers.push({
      name: 'kimi',
      tier: 'paid',
      baseUrl: BASE_URLS.kimi!,
      apiKey: p.kimi.api_key,
      modelId: p.kimi.models[0] ?? 'kimi-k2.6',
    });
  }

  if (p.ollama.enabled) {
    providers.push({
      name: 'ollama',
      tier: 'local',
      baseUrl: `${p.ollama.host}/v1`,
      modelId: p.ollama.models[0] ?? 'qwen2.5-coder:7b',
    });
  }

  // OpenCode Go — subscription-based, multiple models
  if (p.opencode_go.enabled && p.opencode_go.api_key !== '') {
    for (const model of p.opencode_go.models) {
      providers.push({
        name: 'opencode-go',
        tier: 'paid',
        baseUrl: BASE_URLS['opencode-go']!,
        apiKey: p.opencode_go.api_key,
        modelId: model,
      });
    }
  }

  // OpenCode Zen — pay-as-you-go gateway (free + paid models)
  if (p.opencode_zen.enabled && p.opencode_zen.api_key !== '') {
    for (const model of p.opencode_zen.free_models) {
      providers.push({
        name: 'opencode-zen',
        tier: 'free',
        baseUrl: BASE_URLS['opencode-zen']!,
        apiKey: p.opencode_zen.api_key,
        modelId: model,
      });
    }
    for (const model of p.opencode_zen.paid_models) {
      providers.push({
        name: 'opencode-zen',
        tier: 'paid',
        baseUrl: BASE_URLS['opencode-zen']!,
        apiKey: p.opencode_zen.api_key,
        modelId: model,
      });
    }
  }

  return providers;
}

function resolveProvider(
  providerName: string,
  config: CorvynConfig,
  task: TaskCategory
): Provider[] {
  const available = getAvailableProviders(config);
  const availableMap = new Map(available.map((p) => [p.name, p]));

  if (providerName === 'openrouter-free') {
    const or = config.providers.openrouter;
    if (!or.enabled || or.api_key === '' || or.free_models.length === 0) {
      return [];
    }
    const modelKey = `free_${task}` as keyof RoutingConfig['openrouter_models'];
    const primaryModel = config.routing.openrouter_models[modelKey] ?? or.free_models[0]!;

    // Primary model first, then all other free models as fallbacks
    const seen = new Set<string>();
    const providers: Provider[] = [];

    const addModel = (modelId: string) => {
      if (seen.has(modelId)) return;
      seen.add(modelId);
      providers.push({
        name: 'openrouter',
        tier: 'openrouter',
        baseUrl: BASE_URLS.openrouter!,
        apiKey: or.api_key,
        modelId,
        headers: {
          'HTTP-Referer': 'http://localhost:4000',
          'X-Title': 'CORVYN',
        },
      });
    };

    addModel(primaryModel);
    for (const m of or.free_models) {
      addModel(m);
    }
    // Add the fallback model last
    const fallback = config.routing.openrouter_models.free_fallback;
    if (fallback) {
      addModel(fallback);
    }

    return providers;
  }

  if (providerName === 'openrouter-paid') {
    const or = config.providers.openrouter;
    if (!or.enabled || or.api_key === '' || or.paid_models.length === 0) {
      return [];
    }
    const modelKey = `paid_${task}` as keyof RoutingConfig['openrouter_models'];
    const primaryModel = config.routing.openrouter_models[modelKey] ?? or.paid_models[0]!;

    // Primary model first, then all other paid models as fallbacks
    const seen = new Set<string>();
    const providers: Provider[] = [];

    const addModel = (modelId: string) => {
      if (seen.has(modelId)) return;
      seen.add(modelId);
      providers.push({
        name: 'openrouter',
        tier: 'openrouter',
        baseUrl: BASE_URLS.openrouter!,
        apiKey: or.api_key,
        modelId,
        headers: {
          'HTTP-Referer': 'http://localhost:4000',
          'X-Title': 'CORVYN',
        },
      });
    };

    addModel(primaryModel);
    for (const m of or.paid_models) {
      addModel(m);
    }

    return providers;
  }

  if (providerName === 'opencode-go') {
    const go = config.providers.opencode_go;
    if (!go.enabled || go.api_key === '' || go.models.length === 0) {
      return [];
    }
    return go.models.map((modelId) => ({
      name: 'opencode-go',
      tier: 'paid' as ProviderTier,
      baseUrl: BASE_URLS['opencode-go']!,
      apiKey: go.api_key,
      modelId,
    }));
  }

  if (providerName === 'opencode-zen-free') {
    const zen = config.providers.opencode_zen;
    if (!zen.enabled || zen.api_key === '' || zen.free_models.length === 0) {
      return [];
    }
    return zen.free_models.map((modelId) => ({
      name: 'opencode-zen',
      tier: 'free' as ProviderTier,
      baseUrl: BASE_URLS['opencode-zen']!,
      apiKey: zen.api_key,
      modelId,
    }));
  }

  if (providerName === 'opencode-zen-paid') {
    const zen = config.providers.opencode_zen;
    if (!zen.enabled || zen.api_key === '' || zen.paid_models.length === 0) {
      return [];
    }
    return zen.paid_models.map((modelId) => ({
      name: 'opencode-zen',
      tier: 'paid' as ProviderTier,
      baseUrl: BASE_URLS['opencode-zen']!,
      apiKey: zen.api_key,
      modelId,
    }));
  }

  const provider = availableMap.get(providerName);
  return provider ? [provider] : [];
}

export function getRoutingOrderForTask(
  task: TaskCategory,
  config: CorvynConfig
): Provider[] {
  const { config: cleaned } = resolveProviderConflicts(config);
  const rules = cleaned.routing;
  const routingList = rules[task] ?? rules.medium;

  const providers: Provider[] = [];
  for (const providerName of routingList) {
    const resolved = resolveProvider(providerName, cleaned, task);
    for (const p of resolved) {
      providers.push(p);
    }
  }

  return providers;
}

export function getOpenRouterPaidProviders(
  config: CorvynConfig,
  task: TaskCategory
): Provider[] {
  const { config: cleaned } = resolveProviderConflicts(config);
  return resolveProvider('openrouter-paid', cleaned, task);
}

export function applyDeduplication(config: CorvynConfig): { config: CorvynConfig; result: DedupResult } {
  return resolveProviderConflicts(config);
}

// ── Cost calculation ────────────────────────────────────────────────

const PROVIDER_COSTS: Record<string, { input: number; output: number }> = {
  groq: { input: 0.15, output: 0.60 },
  gemini: { input: 0, output: 0 },
  cerebras: { input: 0.35, output: 0.75 },
  sambanova: { input: 0.10, output: 0.30 },
  mistral: { input: 0, output: 0 },
  ollama: { input: 0, output: 0 },
  'opencode-go': { input: 0, output: 0 },
  'opencode-zen': { input: 0.50, output: 3.00 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  deepseek: { input: 0.27, output: 1.1 },
  kimi: { input: 0.60, output: 3.00 },
};

export function calculateCost(
  providerName: string,
  inputTokens: number,
  outputTokens: number
): number {
  const key = providerName.toLowerCase()
    .replace('-free', '')
    .replace('-local', '')
    .replace('-paid', '')
    .replace('-openrouter', '');
  const costs = PROVIDER_COSTS[key] ?? { input: 0, output: 0 };
  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
  );
}

export function calculateSavings(
  actualCostUsd: number,
  inputTokens: number,
  outputTokens: number
): number {
  const claudeCost =
    (inputTokens / 1_000_000) * 3 +
    (outputTokens / 1_000_000) * 15;
  return Math.max(0, claudeCost - actualCostUsd);
}

// ── OpenRouter model iteration helpers ──────────────────────────────

export function getOpenRouterFreeModel(
  config: CorvynConfig,
  task: TaskCategory
): string | null {
  const or = config.providers.openrouter;
  if (!or.enabled || or.api_key === '' || or.free_models.length === 0) {
    return null;
  }
  const modelKey = `free_${task}` as keyof RoutingConfig['openrouter_models'];
  return config.routing.openrouter_models[modelKey] ?? or.free_models[0] ?? null;
}

export function getOpenRouterPaidModel(
  config: CorvynConfig,
  task: TaskCategory
): string | null {
  const or = config.providers.openrouter;
  if (!or.enabled || or.api_key === '' || or.paid_models.length === 0) {
    return null;
  }
  const modelKey = `paid_${task}` as keyof RoutingConfig['openrouter_models'];
  return config.routing.openrouter_models[modelKey] ?? or.paid_models[0] ?? null;
}
