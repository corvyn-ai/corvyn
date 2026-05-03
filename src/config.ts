import { parse } from 'smol-toml';
import * as fs from 'fs';
import * as path from 'path';

// ── Provider sub-types ──────────────────────────────────────────────

export interface FreeProviderConfig {
  enabled: boolean;
  api_key: string;
  rpm?: number;
  rpd?: number;
  tpm?: number;
  models: string[];
}

export interface OpenRouterConfig {
  enabled: boolean;
  api_key: string;
  free_models: string[];
  paid_models: string[];
}

export interface PaidProviderConfig {
  enabled: boolean;
  api_key: string;
  models: string[];
}

export interface OpenCodeGoConfig {
  enabled: boolean;
  api_key: string;
  models: string[];
}

export interface OpenCodeZenConfig {
  enabled: boolean;
  api_key: string;
  free_models: string[];
  paid_models: string[];
}

export interface OllamaConfig {
  enabled: boolean;
  host: string;
  models: string[];
}

// ── Routing ─────────────────────────────────────────────────────────

export interface OpenRouterModelsConfig {
  free_security: string;
  free_complex: string;
  free_generate: string;
  free_test: string;
  free_debug: string;
  free_medium: string;
  free_simple: string;
  free_fallback: string;
  paid_security: string;
  paid_complex: string;
  paid_generate: string;
  paid_test: string;
  paid_debug: string;
  paid_medium: string;
  paid_simple: string;
}

export interface RoutingConfig {
  security: string[];
  complex: string[];
  generate: string[];
  test: string[];
  debug: string[];
  medium: string[];
  simple: string[];
  openrouter_models: OpenRouterModelsConfig;
}

// ── Root config ─────────────────────────────────────────────────────

export interface CorvynConfig {
  general: {
    deduplicate: boolean;
  };
  currency: {
    mode: string;
    override?: string;
  };
  budget: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  providers: {
    groq: FreeProviderConfig;
    gemini: FreeProviderConfig;
    cerebras: FreeProviderConfig;
    sambanova: FreeProviderConfig;
    mistral: FreeProviderConfig;
    openrouter: OpenRouterConfig;
    anthropic: PaidProviderConfig;
    openai: PaidProviderConfig;
    deepseek: PaidProviderConfig;
    opencode_go: OpenCodeGoConfig;
    opencode_zen: OpenCodeZenConfig;
    ollama: OllamaConfig;
  };
  routing: RoutingConfig;
}

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_FREE: FreeProviderConfig = {
  enabled: false,
  api_key: '',
  models: [],
};

const DEFAULT_PAID: PaidProviderConfig = {
  enabled: false,
  api_key: '',
  models: [],
};

const DEFAULT_OPENROUTER: OpenRouterConfig = {
  enabled: false,
  api_key: '',
  free_models: [],
  paid_models: [],
};

const DEFAULT_OPENCODE_GO: OpenCodeGoConfig = {
  enabled: false,
  api_key: '',
  models: ['kimi-k2.6', 'deepseek-v4-pro', 'qwen3.6-plus'],
};

const DEFAULT_OPENCODE_ZEN: OpenCodeZenConfig = {
  enabled: false,
  api_key: '',
  free_models: [
    'big-pickle',
    'minimax-m2.5-free',
    'nemotron-3-super-free',
    'hy3-preview-free',
  ],
  paid_models: [
    'qwen3.5-plus',
    'qwen3.6-plus',
    'minimax-m2.7',
    'kimi-k2.6',
    'glm-5.1',
  ],
};

const DEFAULT_OLLAMA: OllamaConfig = {
  enabled: false,
  host: 'http://localhost:11434',
  models: ['qwen2.5-coder:7b'],
};

const DEFAULT_ROUTING: RoutingConfig = {
  security: ['anthropic', 'opencode-go', 'opencode-zen-paid', 'openrouter-paid', 'openrouter-free', 'opencode-zen-free', 'ollama'],
  complex: ['openrouter-free', 'opencode-zen-free', 'opencode-go', 'opencode-zen-paid', 'openrouter-paid', 'anthropic', 'ollama'],
  generate: ['groq', 'openrouter-free', 'opencode-zen-free', 'opencode-go', 'ollama'],
  test: ['openrouter-free', 'opencode-zen-free', 'opencode-go', 'gemini', 'groq', 'ollama'],
  debug: ['groq', 'openrouter-free', 'opencode-zen-free', 'opencode-go', 'sambanova', 'ollama'],
  medium: ['groq', 'openrouter-free', 'opencode-zen-free', 'opencode-go', 'gemini', 'ollama'],
  simple: ['cerebras', 'groq', 'openrouter-free', 'opencode-zen-free', 'opencode-go', 'ollama'],
  openrouter_models: {
    free_security: 'qwen/qwen3-coder-480b-a35b-instruct:free',
    free_complex: 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
    free_generate: 'qwen/qwen3-coder-480b-a35b-instruct:free',
    free_test: 'qwen/qwen3-coder-480b-a35b-instruct:free',
    free_debug: 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
    free_medium: 'minimax/minimax-m2.5:free',
    free_simple: 'google/gemma-3-12b-it:free',
    free_fallback: 'openrouter/auto',
    paid_security: 'anthropic/claude-sonnet-4-20250514',
    paid_complex: 'anthropic/claude-sonnet-4-20250514',
    paid_generate: 'deepseek/deepseek-chat',
    paid_test: 'deepseek/deepseek-chat',
    paid_debug: 'openai/gpt-4o',
    paid_medium: 'deepseek/deepseek-chat',
    paid_simple: 'openai/gpt-4o-mini',
  },
};

export function getDefaultConfig(): CorvynConfig {
  return {
    general: { deduplicate: true },
    currency: { mode: 'auto' },
    budget: { daily: 30, weekly: 150, monthly: 500 },
    providers: {
      groq: DEFAULT_FREE,
      gemini: DEFAULT_FREE,
      cerebras: DEFAULT_FREE,
      sambanova: DEFAULT_FREE,
      mistral: DEFAULT_FREE,
      openrouter: DEFAULT_OPENROUTER,
      anthropic: DEFAULT_PAID,
      openai: DEFAULT_PAID,
      deepseek: DEFAULT_PAID,
      opencode_go: DEFAULT_OPENCODE_GO,
      opencode_zen: DEFAULT_OPENCODE_ZEN,
      ollama: DEFAULT_OLLAMA,
    },
    routing: DEFAULT_ROUTING,
  };
}

// ── File loading ────────────────────────────────────────────────────

function resolveEnv(value: string): string {
  if (value.startsWith('$')) {
    const envName = value.slice(1);
    return process.env[envName] ?? '';
  }
  if (value.startsWith('env:')) {
    const envName = value.slice(4);
    return process.env[envName] ?? '';
  }
  return value;
}

function getCorvynDir(): string {
  return path.join(
    process.env.HOME ?? process.env.USERHOME ?? '/tmp',
    '.corvyn'
  );
}

function getConfigPaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'corvyn.config.toml'),
    path.join(getCorvynDir(), 'corvyn.config.toml'),
  ];
}

function mergeFree(raw: unknown, defaults: FreeProviderConfig): FreeProviderConfig {
  if (typeof raw !== 'object' || raw === null) return { ...defaults };
  const r = raw as Record<string, unknown>;
  return {
    enabled: (r.enabled as boolean) ?? defaults.enabled,
    api_key: resolveEnv((r.api_key as string) ?? defaults.api_key),
    rpm: (r.rpm as number) ?? defaults.rpm,
    rpd: (r.rpd as number) ?? defaults.rpd,
    tpm: (r.tpm as number) ?? defaults.tpm,
    models: Array.isArray(r.models) ? (r.models as string[]) : defaults.models,
  };
}

function mergePaid(raw: unknown, defaults: PaidProviderConfig): PaidProviderConfig {
  if (typeof raw !== 'object' || raw === null) return { ...defaults };
  const r = raw as Record<string, unknown>;
  return {
    enabled: (r.enabled as boolean) ?? defaults.enabled,
    api_key: resolveEnv((r.api_key as string) ?? defaults.api_key),
    models: Array.isArray(r.models) ? (r.models as string[]) : defaults.models,
  };
}

function mergeOpenRouter(raw: unknown): OpenRouterConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_OPENROUTER };
  const r = raw as Record<string, unknown>;
  return {
    enabled: (r.enabled as boolean) ?? false,
    api_key: resolveEnv((r.api_key as string) ?? ''),
    free_models: Array.isArray(r.free_models) ? (r.free_models as string[]) : [],
    paid_models: Array.isArray(r.paid_models) ? (r.paid_models as string[]) : [],
  };
}

function mergeOpenCodeGo(raw: unknown): OpenCodeGoConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_OPENCODE_GO };
  const r = raw as Record<string, unknown>;
  return {
    enabled: (r.enabled as boolean) ?? false,
    api_key: resolveEnv((r.api_key as string) ?? ''),
    models: Array.isArray(r.models) ? (r.models as string[]) : DEFAULT_OPENCODE_GO.models,
  };
}

function mergeOpenCodeZen(raw: unknown): OpenCodeZenConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_OPENCODE_ZEN };
  const r = raw as Record<string, unknown>;
  return {
    enabled: (r.enabled as boolean) ?? false,
    api_key: resolveEnv((r.api_key as string) ?? ''),
    free_models: Array.isArray(r.free_models) ? (r.free_models as string[]) : DEFAULT_OPENCODE_ZEN.free_models,
    paid_models: Array.isArray(r.paid_models) ? (r.paid_models as string[]) : DEFAULT_OPENCODE_ZEN.paid_models,
  };
}

function mergeOllama(raw: unknown): OllamaConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_OLLAMA };
  const r = raw as Record<string, unknown>;
  return {
    enabled: (r.enabled as boolean) ?? true,
    host: (r.host as string) ?? DEFAULT_OLLAMA.host,
    models: Array.isArray(r.models) ? (r.models as string[]) : DEFAULT_OLLAMA.models,
  };
}

function mergeRouting(raw: unknown): RoutingConfig {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_ROUTING };
  const r = raw as Record<string, unknown>;

  const categories = ['security', 'complex', 'generate', 'test', 'debug', 'medium', 'simple'] as const;
  const merged: Record<string, string[]> = {};
  for (const cat of categories) {
    merged[cat] = Array.isArray(r[cat]) ? (r[cat] as string[]) : DEFAULT_ROUTING[cat];
  }

  const rawOr = r.openrouter_models as Record<string, unknown> | undefined;
  const orModels: OpenRouterModelsConfig = { ...DEFAULT_ROUTING.openrouter_models };
  if (typeof rawOr === 'object' && rawOr !== null) {
    const keys: (keyof OpenRouterModelsConfig)[] = [
      'free_security', 'free_complex', 'free_generate', 'free_test',
      'free_debug', 'free_medium', 'free_simple', 'free_fallback',
      'paid_security', 'paid_complex', 'paid_generate', 'paid_test',
      'paid_debug', 'paid_medium', 'paid_simple',
    ];
    for (const key of keys) {
      if (typeof rawOr[key] === 'string') {
        orModels[key] = rawOr[key] as string;
      }
    }
  }

  return {
    security: merged.security!,
    complex: merged.complex!,
    generate: merged.generate!,
    test: merged.test!,
    debug: merged.debug!,
    medium: merged.medium!,
    simple: merged.simple!,
    openrouter_models: orModels,
  };
}

export function loadConfig(): CorvynConfig {
  const paths = getConfigPaths();

  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const raw = parse(content) as Record<string, unknown>;
        return mergeConfig(raw);
      } catch {
        continue;
      }
    }
  }

  return getDefaultConfig();
}

function mergeConfig(raw: Record<string, unknown>): CorvynConfig {
  const def = getDefaultConfig();

  const rawProviders = (raw.providers as Record<string, unknown>) ?? {};
  const rawCurrency = (raw.currency as Record<string, unknown>) ?? {};
  const rawBudget = (raw.budget as Record<string, unknown>) ?? {};
  const rawGeneral = (raw.general as Record<string, unknown>) ?? {};
  const rawRouting = raw.routing as Record<string, unknown> | undefined;

  return {
    general: {
      deduplicate: (rawGeneral.deduplicate as boolean) ?? true,
    },
    currency: {
      mode: (rawCurrency.mode as string) ?? def.currency.mode,
      override: (rawCurrency.override as string) ?? undefined,
    },
    budget: {
      daily: (rawBudget.daily as number) ?? def.budget.daily,
      weekly: (rawBudget.weekly as number) ?? def.budget.weekly,
      monthly: (rawBudget.monthly as number) ?? def.budget.monthly,
    },
    providers: {
      groq: mergeFree(rawProviders.groq, def.providers.groq),
      gemini: mergeFree(rawProviders.gemini, def.providers.gemini),
      cerebras: mergeFree(rawProviders.cerebras, def.providers.cerebras),
      sambanova: mergeFree(rawProviders.sambanova, def.providers.sambanova),
      mistral: mergeFree(rawProviders.mistral, def.providers.mistral),
      openrouter: mergeOpenRouter(rawProviders.openrouter),
      anthropic: mergePaid(rawProviders.anthropic, def.providers.anthropic),
      openai: mergePaid(rawProviders.openai, def.providers.openai),
      deepseek: mergePaid(rawProviders.deepseek, def.providers.deepseek),
      opencode_go: mergeOpenCodeGo(rawProviders.opencode_go),
      opencode_zen: mergeOpenCodeZen(rawProviders.opencode_zen),
      ollama: mergeOllama(rawProviders.ollama),
    },
    routing: mergeRouting(rawRouting),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

export function getEnabledProviders(config: CorvynConfig): string[] {
  const providers = config.providers;
  const enabled: string[] = [];

  if (providers.groq.enabled && providers.groq.api_key !== '') enabled.push('groq');
  if (providers.gemini.enabled && providers.gemini.api_key !== '') enabled.push('gemini');
  if (providers.cerebras.enabled && providers.cerebras.api_key !== '') enabled.push('cerebras');
  if (providers.sambanova.enabled && providers.sambanova.api_key !== '') enabled.push('sambanova');
  if (providers.mistral.enabled && providers.mistral.api_key !== '') enabled.push('mistral');
  if (providers.openrouter.enabled && providers.openrouter.api_key !== '') enabled.push('openrouter');
  if (providers.anthropic.enabled && providers.anthropic.api_key !== '') enabled.push('anthropic');
  if (providers.openai.enabled && providers.openai.api_key !== '') enabled.push('openai');
  if (providers.deepseek.enabled && providers.deepseek.api_key !== '') enabled.push('deepseek');
  if (providers.opencode_go.enabled && providers.opencode_go.api_key !== '') enabled.push('opencode-go');
  if (providers.opencode_zen.enabled && providers.opencode_zen.api_key !== '') enabled.push('opencode-zen');
  if (providers.ollama.enabled) enabled.push('ollama');

  return enabled;
}
