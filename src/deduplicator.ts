import type { CorvynConfig } from './config';

export interface DedupResult {
  removed: Array<{
    from: string;
    model: string;
    reason: string;
    winner: string;
  }>;
  warnings: string[];
}

const PROVIDER_OPENROUTER_MAP: Record<string, string[]> = {
  anthropic: [
    'anthropic/claude-opus-4',
    'anthropic/claude-sonnet-4-20250514',
    'anthropic/claude-haiku-4-5',
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-haiku',
  ],
  openai: [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/o3',
    'openai/o4-mini',
    'openai/gpt-4-turbo',
  ],
  gemini: [
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'google/gemini-2.0-flash',
    'google/gemini-pro',
  ],
  deepseek: [
    'deepseek/deepseek-chat',
    'deepseek/deepseek-r1',
    'deepseek/deepseek-coder',
  ],
  mistral: [
    'mistral/mistral-large-latest',
    'mistral/codestral-latest',
    'mistral/mistral-small-latest',
  ],
};

const OPENROUTER_CHEAPER: string[] = [];

function isDirectProviderEnabled(config: CorvynConfig, name: string): boolean {
  const p = config.providers;
  switch (name) {
    case 'anthropic': return p.anthropic.enabled && p.anthropic.api_key !== '';
    case 'openai': return p.openai.enabled && p.openai.api_key !== '';
    case 'gemini': return p.gemini.enabled && p.gemini.api_key !== '';
    case 'deepseek': return p.deepseek.enabled && p.deepseek.api_key !== '';
    case 'mistral': return p.mistral.enabled && p.mistral.api_key !== '';
    default: return false;
  }
}

export function resolveProviderConflicts(config: CorvynConfig): { config: CorvynConfig; result: DedupResult } {
  const result: DedupResult = { removed: [], warnings: [] };

  if (!config.general.deduplicate) {
    const hasOr = config.providers.openrouter.enabled && config.providers.openrouter.api_key !== '';
    if (hasOr && config.providers.openrouter.paid_models.length > 0) {
      result.warnings.push('⚠ deduplicate = false — conflicts managed manually');
    }
    return { config, result };
  }

  const or = config.providers.openrouter;
  if (!or.enabled || or.api_key === '' || or.paid_models.length === 0) {
    return { config, result };
  }

  const newPaidModels = [...or.paid_models];
  const toRemove = new Set<string>();

  for (const [directName, orModels] of Object.entries(PROVIDER_OPENROUTER_MAP)) {
    if (!isDirectProviderEnabled(config, directName)) {
      continue;
    }

    for (const orModel of orModels) {
      if (!newPaidModels.includes(orModel)) {
        continue;
      }

      if (OPENROUTER_CHEAPER.includes(orModel)) {
        continue;
      }

      toRemove.add(orModel);
      result.removed.push({
        from: 'openrouter paid_models',
        model: orModel,
        reason: `direct ${directName} key takes priority (lower latency)`,
        winner: directName,
      });
    }
  }

  if (toRemove.size === 0) {
    return { config, result };
  }

  const cleanedPaidModels = newPaidModels.filter((m) => !toRemove.has(m));

  const cleanedConfig: CorvynConfig = {
    ...config,
    providers: {
      ...config.providers,
      openrouter: {
        ...config.providers.openrouter,
        paid_models: cleanedPaidModels,
      },
    },
  };

  return { config: cleanedConfig, result };
}
