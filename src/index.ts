import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { initDb, getLastUsedOpenRouterModel } from './db';
import { createServer } from './server';
import type { CorvynConfig } from './config';
import { loadConfig, getDefaultConfig } from './config';
import { getAvailableProviders, getRoutingOrderForTask, applyDeduplication } from './providers';
import { getQuotaStatus, getTodayStats, checkBudget } from './quota';
import { getCurrency, formatCost, getCurrencyInfoSync, isValidCurrencyCode, getAllCurrencyCodes, updateCurrencyOverride, CURRENCY_SYMBOLS } from './currency';
import type { CurrencyInfo } from './currency';
import type { DedupResult } from './deduplicator';

const VERSION = '0.1.0';

const BASE_URLS_INDEX: Record<string, string> = {
  'opencode-go': 'https://opencode.ai/zen/go/v1',
  'opencode-zen': 'https://opencode.ai/zen/v1',
};

// ── Visual helpers ──────────────────────────────────────────────────

function visualLength(s: string): number {
  let len = s.length;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x2190 && code <= 0x21FF) ||
      (code >= 0x2700 && code <= 0x27BF) ||
      (code >= 0x2550 && code <= 0x257F)
    ) {
      len += 1;
    }
  }
  return len;
}

function visualPadEnd(s: string, width: number): string {
  const vLen = visualLength(s);
  const padding = Math.max(0, width - vLen);
  return s + ' '.repeat(padding);
}

// ── Connection checks ───────────────────────────────────────────────

async function checkOllama(host: string): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

async function checkApiKey(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    return res.ok || res.status === 404 || res.status === 405;
  } catch {
    return false;
  }
}

type ProviderStatus = 'working' | 'missing' | 'warning';

interface CheckedProvider {
  name: string;
  tier: 'free' | 'paid' | 'local' | 'openrouter';
  status: ProviderStatus;
  label: string;
  subLabel?: string;
}

async function checkAllProviders(config: CorvynConfig): Promise<CheckedProvider[]> {
  const results: CheckedProvider[] = [];
  const available = getAvailableProviders(config);

  for (const p of available) {
    // Skip opencode-go and opencode-zen — they have dedicated banner sections
    if (p.name === 'opencode-go' || p.name === 'opencode-zen') continue;

    let status: ProviderStatus = 'warning';
    let label = '';
    let subLabel: string | undefined;

    if (p.tier === 'local') {
      const ollamaHost = p.baseUrl.replace(/\/v1$/, '');
      const running = await checkOllama(ollamaHost);
      status = running ? 'working' : 'warning';
      label = running ? 'running' : 'not running';
      subLabel = p.modelId;
    } else if (p.tier === 'openrouter') {
      const ok = await checkApiKey(p.baseUrl, p.apiKey ?? '');
      status = ok ? 'working' : 'warning';
      const freeCount = config.providers.openrouter.free_models.length;
      const paidCount = config.providers.openrouter.paid_models.length;
      label = `${freeCount} free models`;
      if (paidCount > 0) {
        subLabel = `+ ${paidCount} paid models`;
      }
    } else {
      const ok = await checkApiKey(p.baseUrl, p.apiKey ?? '');
      status = ok ? 'working' : 'warning';
      const rpm = p.rpm ? `${p.rpm} rpm` : '';
      const rpd = p.rpd ? `${p.rpd.toLocaleString()} rpd` : '';
      label = [rpm, rpd].filter(Boolean).join(' / ') || 'configured';
    }

    results.push({ name: p.name, tier: p.tier, status, label, subLabel });
  }

  // Add configured-but-disabled providers as "missing"
  const freeNames = ['groq', 'gemini', 'cerebras', 'sambanova', 'mistral'] as const;
  const paidNames = ['anthropic', 'openai', 'deepseek', 'kimi'] as const;

  for (const name of freeNames) {
    const c = config.providers[name];
    const exists = available.find((a) => a.name === name);
    if (!exists && !c.enabled) {
      results.push({ name, tier: 'free', status: 'missing', label: 'not configured' });
    }
  }

  for (const name of paidNames) {
    const c = config.providers[name];
    const exists = available.find((a) => a.name === name);
    if (!exists && !c.enabled) {
      results.push({ name, tier: 'paid', status: 'missing', label: 'not configured' });
    }
  }

  // OpenCode Go
  const go = config.providers.opencode_go;
  if (go.enabled && go.api_key !== '') {
    const ok = await checkApiKey(BASE_URLS_INDEX['opencode-go']!, go.api_key);
    results.push({
      name: 'opencode-go',
      tier: 'paid',
      status: ok ? 'working' : 'warning',
      label: `${go.models.length} models (subscription)`,
    });
  } else {
    results.push({ name: 'opencode-go', tier: 'paid', status: 'missing', label: 'not configured' });
  }

  // OpenCode Zen
  const zen = config.providers.opencode_zen;
  if (zen.enabled && zen.api_key !== '') {
    const ok = await checkApiKey(BASE_URLS_INDEX['opencode-zen']!, zen.api_key);
    const freeCount = zen.free_models.length;
    const paidCount = zen.paid_models.length;
    results.push({
      name: 'opencode-zen',
      tier: 'paid',
      status: ok ? 'working' : 'warning',
      label: `${freeCount} free + ${paidCount} paid models`,
    });
  } else {
    results.push({ name: 'opencode-zen', tier: 'paid', status: 'missing', label: 'not configured' });
  }

  const or = config.providers.openrouter;
  if (!or.enabled) {
    results.push({ name: 'openrouter', tier: 'openrouter', status: 'missing', label: 'not configured' });
  }

  if (!config.providers.ollama.enabled) {
    results.push({ name: 'ollama', tier: 'local', status: 'missing', label: 'disabled' });
  }

  // Cloudflare AI Gateway
  const cf = config.providers.cloudflare_ai;
  if (cf.enabled && cf.api_token !== '' && cf.account_id !== '') {
    const cfUrl = `https://gateway.ai.cloudflare.com/v1/${cf.account_id}/${cf.gateway_id}`;
    let ok = false;
    try {
      const res = await fetch(`${cfUrl}/compat/chat/completions`, {
        method: 'POST',
        headers: {
          'cf-aig-authorization': `Bearer ${cf.api_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'workers-ai/@cf/meta/llama-3.2-1b-instruct', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(5000),
      });
      ok = res.ok || res.status === 401 || res.status === 400 || res.status === 404;
    } catch {}
    results.push({
      name: 'cloudflare-ai',
      tier: 'paid',
      status: ok ? 'working' : 'warning',
      label: `${cf.models.length} models via CF Gateway`,
    });
  } else {
    results.push({ name: 'cloudflare-ai', tier: 'paid', status: 'missing', label: 'not configured' });
  }

  return results;
}

// ── Banner ──────────────────────────────────────────────────────────

function buildBanner(
  port: number,
  currency: CurrencyInfo,
  checked: CheckedProvider[],
  config: CorvynConfig,
  dedupResult?: DedupResult,
  lastUsedOpenRouter?: string | null
): string {
  const W = 46;
  const border = '-'.repeat(W);

  const icon = (s: ProviderStatus) => {
    switch (s) {
      case 'working': return '\u2713';
      case 'missing': return '\u2717';
      case 'warning': return '\u26a0';
    }
  };

  const displayName = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);

  const lines: string[] = [];

  lines.push(`+${border}+`);
  lines.push(`|${visualPadEnd(`  CORVYN v${VERSION}`, W)}|`);
  lines.push(`+${border}+`);
  lines.push(`|${visualPadEnd(`  Proxy     \u2192 localhost:${port}`, W)}|`);

  const currencySource = currency.source ?? 'auto';
  let currencyLine: string;
  if (currencySource === 'manual') {
    currencyLine = `  Currency  \u2192 ${currency.symbol} ${currency.code}  \u2502  ${currency.name}  \u2502  manual`;
  } else if (currencySource === 'default') {
    currencyLine = `  Currency  \u2192 ${currency.symbol} ${currency.code}  \u2502  (locale unknown, defaulted)`;
  } else {
    currencyLine = `  Currency  \u2192 ${currency.symbol} ${currency.code}  \u2502  ${currency.name}  \u2502  auto`;
  }

  lines.push(`|${visualPadEnd(currencyLine, W)}|`);

  // DEDUP STATUS
  if (dedupResult && dedupResult.removed.length > 0) {
    lines.push(`+${border}+`);
    lines.push(`|${visualPadEnd('  DEDUPLICATION', W)}|`);
    for (const r of dedupResult.removed) {
      const row = `  - ${r.model}`;
      lines.push(`|${visualPadEnd(row, W)}|`);
      const row2 = `    \u2192 ${r.winner} (direct key)`;
      lines.push(`|${visualPadEnd(row2, W)}|`);
    }
  }

  if (dedupResult && dedupResult.warnings.length > 0) {
    lines.push(`+${border}+`);
    lines.push(`|${visualPadEnd('  DEDUP MODE', W)}|`);
    for (const w of dedupResult.warnings) {
      lines.push(`|${visualPadEnd(`  ${w}`, W)}|`);
    }
  }

  lines.push(`+${border}+`);

  // FREE
  lines.push(`|${visualPadEnd('  FREE PROVIDERS', W)}|`);
  const free = checked.filter((p) => p.tier === 'free');
  for (const p of free) {
    const row = `  ${displayName(p.name).padEnd(10)} ${icon(p.status)}  ${p.label}`;
    lines.push(`|${visualPadEnd(row, W)}|`);
  }
  lines.push(`+${border}+`);

  // OPENROUTER
  const orConfig = config.providers.openrouter;
  const orEnabled = orConfig.enabled && orConfig.api_key !== '';
  const orChecked = checked.find((p) => p.name === 'openrouter');
  lines.push(`|${visualPadEnd('  OPENROUTER', W)}|`);
  if (orEnabled) {
    const statusIcon = orChecked ? icon(orChecked.status) : icon('missing');
    const freeCount = orConfig.free_models.length;
    const freeRow = `  Free models  ${statusIcon}  ${freeCount} models available`;
    lines.push(`|${visualPadEnd(freeRow, W)}|`);
    if (lastUsedOpenRouter) {
      const lastRow = `  Last used    →  ${lastUsedOpenRouter}`;
      lines.push(`|${visualPadEnd(lastRow, W)}|`);
    }
    const paidCount = orConfig.paid_models.length;
    if (paidCount > 0) {
      const paidRow = `  Paid models  ${statusIcon}  ${paidCount} models configured`;
      lines.push(`|${visualPadEnd(paidRow, W)}|`);
    } else {
      const paidRow = `  Paid models  ${icon('missing')}  none configured`;
      lines.push(`|${visualPadEnd(paidRow, W)}|`);
    }
  } else {
    const row = `  OpenRouter  ${icon('missing')}  not configured`;
    lines.push(`|${visualPadEnd(row, W)}|`);
  }
  lines.push(`+${border}+`);

  // OPENCODE GO
  const goConfig = config.providers.opencode_go;
  const goEnabled = goConfig.enabled && goConfig.api_key !== '';
  const goChecked = checked.find((p) => p.name === 'opencode-go');
  lines.push(`|${visualPadEnd('  OPENCODE GO ($10/mo subscription)', W)}|`);
  if (goEnabled && goChecked) {
    const statusIcon = icon(goChecked.status);
    const goRow = `  Models     ${statusIcon}  ${goConfig.models.length} models configured`;
    lines.push(`|${visualPadEnd(goRow, W)}|`);
    for (const m of goConfig.models.slice(0, 3)) {
      lines.push(`|${visualPadEnd(`    \u2192 ${m}`, W)}|`);
    }
    if (goConfig.models.length > 3) {
      lines.push(`|${visualPadEnd(`    + ${goConfig.models.length - 3} more`, W)}|`);
    }
  } else {
    const row = `  OpenCode Go  ${icon('missing')}  not configured`;
    lines.push(`|${visualPadEnd(row, W)}|`);
  }
  lines.push(`+${border}+`);

  // OPENCODE ZEN
  const zenConfig = config.providers.opencode_zen;
  const zenEnabled = zenConfig.enabled && zenConfig.api_key !== '';
  const zenChecked = checked.find((p) => p.name === 'opencode-zen');
  lines.push(`|${visualPadEnd('  OPENCODE ZEN (pay-as-you-go)', W)}|`);
  if (zenEnabled && zenChecked) {
    const statusIcon = icon(zenChecked.status);
    const freeCount = zenConfig.free_models.length;
    const paidCount = zenConfig.paid_models.length;
    const freeRow = `  Free models  ${statusIcon}  ${freeCount} models`;
    lines.push(`|${visualPadEnd(freeRow, W)}|`);
    const paidRow = `  Paid models  ${statusIcon}  ${paidCount} models`;
    lines.push(`|${visualPadEnd(paidRow, W)}|`);
  } else {
    const row = `  OpenCode Zen  ${icon('missing')}  not configured`;
    lines.push(`|${visualPadEnd(row, W)}|`);
  }
  lines.push(`+${border}+`);

  // CLOUDFLARE AI GATEWAY
  const cfConfig = config.providers.cloudflare_ai;
  const cfEnabled = cfConfig.enabled && cfConfig.api_token !== '' && cfConfig.account_id !== '';
  const cfChecked = checked.find((p) => p.name === 'cloudflare-ai');
  lines.push(`|${visualPadEnd('  CLOUDFLARE AI GATEWAY', W)}|`);
  if (cfEnabled && cfChecked) {
    const statusIcon = icon(cfChecked.status);
    const modeLabel = cfConfig.mode === 'passthrough' ? 'passthrough' : cfConfig.mode === 'byok' ? 'BYOK' : 'unified billing';
    const cfRow = `  Gateway    ${statusIcon}  ${cfConfig.gateway_id} (${modeLabel})`;
    lines.push(`|${visualPadEnd(cfRow, W)}|`);
    const modelsRow = `  Models     ${statusIcon}  ${cfConfig.models.length} models configured`;
    lines.push(`|${visualPadEnd(modelsRow, W)}|`);
    for (const m of cfConfig.models.slice(0, 3)) {
      lines.push(`|${visualPadEnd(`    \u2192 ${m}`, W)}|`);
    }
    if (cfConfig.models.length > 3) {
      lines.push(`|${visualPadEnd(`    + ${cfConfig.models.length - 3} more`, W)}|`);
    }
  } else {
    const row = `  CF Gateway  ${icon('missing')}  not configured`;
    lines.push(`|${visualPadEnd(row, W)}|`);
  }
  lines.push(`+${border}+`);

  // LOCAL
  lines.push(`|${visualPadEnd('  LOCAL', W)}|`);
  const local = checked.filter((p) => p.tier === 'local');
  for (const p of local) {
    const row = `  ${displayName(p.name).padEnd(10)} ${icon(p.status)}  ${p.subLabel ?? p.label}`;
    lines.push(`|${visualPadEnd(row, W)}|`);
  }
  if (local.length === 0) {
    lines.push(`|${visualPadEnd('  (none configured)', W)}|`);
  }
  lines.push(`+${border}+`);

  // PAID
  lines.push(`|${visualPadEnd('  PAID (your keys)', W)}|`);
  const paid = checked.filter((p) => p.tier === 'paid' && p.name !== 'opencode-go' && p.name !== 'opencode-zen' && p.name !== 'cloudflare-ai');
  for (const p of paid) {
    const row = `  ${displayName(p.name).padEnd(10)} ${icon(p.status)}  ${p.label}`;
    lines.push(`|${visualPadEnd(row, W)}|`);
  }
  if (paid.length === 0) {
    lines.push(`|${visualPadEnd('  (none configured)', W)}|`);
  }
  lines.push(`+${border}+`);

  // BUDGET
  const b = config.budget;
  lines.push(`|${visualPadEnd('  BUDGET', W)}|`);
  const dailyStr = formatCost(b.daily, { ...currency, rate: 1 });
  const weeklyStr = formatCost(b.weekly, { ...currency, rate: 1 });
  lines.push(`|${visualPadEnd(`  Daily    ${dailyStr}  |  Weekly  ${weeklyStr}`, W)}|`);
  lines.push(`+${border}+`);

  // OPENCODE SETUP
  lines.push(`|${visualPadEnd('  OPENCODE SETUP', W)}|`);
  lines.push(`|${visualPadEnd(`  OPENAI_BASE_URL=http://localhost:${port}`, W)}|`);
  lines.push(`|${visualPadEnd('  OPENAI_API_KEY=corvyn', W)}|`);
  lines.push(`+${border}+`);

  return lines.join('\n');
}

// ── Config template ─────────────────────────────────────────────────

const CONFIG_TEMPLATE = `# CORVYN Configuration
# Stored at ~/.corvyn/corvyn.config.toml
# API keys use env vars: api_key = "$ENV_VAR_NAME"

[currency]
mode     = "auto"
override = ""

[budget]
daily   = 30
weekly  = 150
monthly = 500

# ── Free Providers ───────────────────────────────────────────────────

# [providers.groq]
# enabled   = true
# api_key   = "$GROQ_API_KEY"
# rpm       = 30
# rpd       = 14400
# models    = ["llama-3.3-70b-versatile"]

[providers.gemini]
enabled   = true
api_key   = "$GEMINI_API_KEY"
rpm       = 15
rpd       = 1500
models    = ["gemini-2.5-flash"]

[providers.cerebras]
enabled   = true
api_key   = "$CEREBRAS_API_KEY"
rpm       = 30
rpd       = 1700
models    = ["gpt-oss-120b", "qwen-3-235b-a22b-instruct-2507", "zai-glm-4.7", "llama3.1-8b"]

# [providers.sambanova]
# enabled   = true
# api_key   = "$SAMBANOVA_API_KEY"
# rpm       = 30
# rpd       = 3000
# models    = ["Meta-Llama-3.3-70B-Instruct"]

# [providers.mistral]
# enabled   = true
# api_key   = "$MISTRAL_API_KEY"
# rpm       = 15
# rpd       = 1000
# tpm       = 100000
# models    = ["mistral-small-latest"]

# ── Gateways ─────────────────────────────────────────────────────────

[providers.openrouter]
enabled   = true
api_key   = "$OPENROUTER_API_KEY"
free_models = [
  # Tier 1 — Best for coding
  "qwen/qwen3-coder:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "tencent/hy3-preview:free",
  "openai/gpt-oss-120b:free",
  # Tier 2 — Good fallbacks
  "z-ai/glm-4.5-air:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-4-31b-it:free",
  "minimax/minimax-m2.5:free",
  "poolside/laguna-m.1:free",
  # Tier 3 — Small/fast
  "google/gemma-4-26b-a4b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-20b:free",
  "google/gemma-3-12b-it:free",
]
paid_models = [
  # Cheap tier ($0.05-$0.30/M input)
  "openai/gpt-5-nano",
  "qwen/qwen3-235b-a22b-2507",
  "qwen/qwen3-coder-next",
  "deepseek/deepseek-chat-v3.1",
  "qwen/qwen3-coder-flash",
  "openai/gpt-5.4-nano",
  "openai/gpt-5-mini",
  # Mid tier ($0.30-$2.00/M input)
  "google/gemini-2.5-flash",
  "google/gemini-3-flash-preview",
  "deepseek/deepseek-r1-0528",
  "qwen/qwen3-coder-plus",
  "openai/gpt-5.4-mini",
  "openai/gpt-5",
  "google/gemini-2.5-pro",
  # Premium tier ($2.00+/M input)
  "google/gemini-3.1-pro-preview",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.7",
  "openai/gpt-5.5",
]

[providers.opencode_go]
enabled   = true
api_key   = "$OPENCODE_GO_API_KEY"
models    = [
  "glm-5",
  "glm-5.1",
  "kimi-k2.5",
  "kimi-k2.6",
  "mimo-v2-pro",
  "mimo-v2-omni",
  "mimo-v2.5-pro",
  "mimo-v2.5",
  "minimax-m2.5",
  "minimax-m2.7",
  "qwen3.5-plus",
  "qwen3.6-plus",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
]

# [providers.opencode_zen]
# enabled   = true
# api_key   = "$OPENCODE_ZEN_API_KEY"
# free_models = [
#   "big-pickle",
#   "minimax-m2.5-free",
#   "nemotron-3-super-free",
#   "hy3-preview-free",
# ]
# paid_models = [
#   "qwen3.5-plus",
#   "qwen3.6-plus",
#   "minimax-m2.7",
#   "kimi-k2.6",
#   "glm-5.1",
# ]

# ── Direct Paid Providers ────────────────────────────────────────────

# [providers.anthropic]
# enabled   = true
# api_key   = "$ANTHROPIC_API_KEY"
# models    = ["claude-sonnet-4-20250514"]

# [providers.openai]
# enabled   = true
# api_key   = "$OPENAI_API_KEY"
# models    = ["gpt-4o"]

# [providers.deepseek]
# enabled   = true
# api_key   = "$DEEPSEEK_API_KEY"
# models    = ["deepseek-chat"]

# [providers.kimi]
# enabled   = true
# api_key   = "$KIMI_API_KEY"
# models    = ["kimi-k2.6", "kimi-k2.5"]

# ── Local ────────────────────────────────────────────────────────────

# [providers.ollama]
# enabled = true
# host = "http://localhost:11434"
# models = ["qwen2.5-coder:7b"]

# ── Cloudflare AI Gateway ────────────────────────────────────────────
# Routes requests through Cloudflare's AI Gateway (unified OpenAI-compatible endpoint)
# Supports caching, rate limiting, analytics, guardrails, and DLP
# Models use provider/model format: "openai/gpt-4o", "anthropic/claude-sonnet-4.5"
#
# Modes:
#   "unified"     — CF bills you directly from loaded credits (no provider keys needed anywhere)
#   "byok"        — Store provider API keys in CF dashboard, CF injects them at runtime
#   "passthrough"  — You send provider keys via provider_keys table below, CF proxies them through

# [providers.cloudflare_ai]
# enabled    = true
# account_id = "$CF_ACCOUNT_ID"
# gateway_id = "default"
# api_token  = "$CF_AIG_API_TOKEN"
# mode       = "unified"          # "unified" | "byok" | "passthrough"
# rpm        = 100
# rpd        = 10000
# models     = [
#   "openai/gpt-4o",
#   "anthropic/claude-sonnet-4.5",
#   "google-ai-studio/gemini-2.5-flash",
#   "groq/llama-3.3-70b-versatile",
#   "deepseek/deepseek-chat",
#   "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
# ]
# # Only needed for mode = "passthrough" — maps provider prefix to API key
# [providers.cloudflare_ai.provider_keys]
# openai            = "$OPENAI_API_KEY"
# anthropic         = "$ANTHROPIC_API_KEY"
# google-ai-studio  = "$GEMINI_API_KEY"

# ── Routing ──────────────────────────────────────────────────────────
# Priority: free tiers -> opencode-go (subscription) -> paid fallbacks

[routing]
security = ["openrouter-free", "opencode-go", "openrouter-paid"]
complex  = ["openrouter-free", "opencode-go", "openrouter-paid"]
generate = ["openrouter-free", "opencode-go", "cerebras", "gemini"]
test     = ["openrouter-free", "opencode-go", "gemini", "cerebras"]
debug    = ["openrouter-free", "opencode-go", "cerebras", "gemini"]
medium   = ["openrouter-free", "opencode-go", "gemini", "cerebras"]
simple   = ["cerebras", "openrouter-free", "opencode-go", "gemini"]

[routing.openrouter_models]
free_security = "qwen/qwen3-coder:free"
free_complex  = "nvidia/nemotron-3-super-120b-a12b:free"
free_generate = "qwen/qwen3-coder:free"
free_test     = "qwen/qwen3-coder:free"
free_debug    = "nvidia/nemotron-3-super-120b-a12b:free"
free_medium   = "z-ai/glm-4.5-air:free"
free_simple   = "google/gemma-4-26b-a4b-it:free"
free_fallback = "openai/gpt-oss-120b:free"

paid_security = "anthropic/claude-sonnet-4.6"
paid_complex  = "anthropic/claude-opus-4.7"
paid_generate = "qwen/qwen3-coder-next"
paid_test     = "deepseek/deepseek-chat-v3.1"
paid_debug    = "google/gemini-flash-latest"
paid_medium   = "qwen/qwen3-235b-a22b-2507"
paid_simple   = "openai/gpt-5-nano"
`;

// ── Interactive init ────────────────────────────────────────────────

function getCorvynDir(): string {
  return path.join(
    process.env.HOME ?? process.env.USERHOME ?? '/tmp',
    '.corvyn'
  );
}

async function interactiveInit(): Promise<void> {
  const dir = getCorvynDir();
  const configPath = path.join(dir, 'corvyn.config.toml');

  if (fs.existsSync(configPath)) {
    console.log(`Config already exists at ${configPath}`);
    console.log('Delete it first to re-initialize.');
    return;
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log('CORVYN Interactive Setup');
  console.log('');
  console.log('This will create a config file at ~/.corvyn/corvyn.config.toml');
  console.log('You can always edit it manually later.');
  console.log('');

  const config = getDefaultConfig();

  const detected = getCurrencyInfoSync();
  console.log(`Detected currency: ${detected.symbol} ${detected.code} (${detected.name})`);
  console.log(`Is this correct? (Y/n): `);
  const confirm = process.stdin.read(1)?.toString().trim();
  if (confirm && confirm.toLowerCase() === 'n') {
    console.log('Enter your currency shortcode (e.g. INR, NGN, BRL): ');
    const input = process.stdin.read(20)?.toString().trim().toUpperCase();
    if (input && isValidCurrencyCode(input)) {
      config.currency.mode = 'manual';
      config.currency.override = input;
      console.log(`Currency set to ${CURRENCY_SYMBOLS[input]?.symbol ?? ''} ${input}`);
    } else if (input) {
      console.log(`Unknown code: ${input}. Using detected ${detected.code} instead.`);
    }
  }

  console.log('');
  console.log('Configuring providers...');

  const prompts: Array<{ key: 'groq' | 'gemini' | 'cerebras' | 'sambanova' | 'mistral' | 'anthropic' | 'openai' | 'deepseek' | 'kimi'; displayName: string; envHint: string }> = [
    { key: 'groq', displayName: 'Groq', envHint: 'gsk_...' },
    { key: 'gemini', displayName: 'Gemini', envHint: 'AIza...' },
    { key: 'cerebras', displayName: 'Cerebras', envHint: 'csk-...' },
    { key: 'sambanova', displayName: 'SambaNova', envHint: 'api key' },
    { key: 'mistral', displayName: 'Mistral', envHint: 'api key' },
    { key: 'anthropic', displayName: 'Anthropic', envHint: 'sk-ant-...' },
    { key: 'openai', displayName: 'OpenAI', envHint: 'sk-...' },
    { key: 'deepseek', displayName: 'DeepSeek', envHint: 'sk-...' },
    { key: 'kimi', displayName: 'Kimi', envHint: 'sk-...' },
  ];

  for (const p of prompts) {
    console.log(`Do you have a ${p.displayName} API key? (y/n)`);
    break;
  }

  fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
  console.log('');
  console.log(`Config created at ${configPath}`);
  console.log('Edit it to add your API keys, then run: corvyn start');
}

// ── CLI ─────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('corvyn')
  .description('Local AI routing proxy for OpenCode')
  .version(VERSION);

program
  .command('start')
  .description('Start the Corvyn proxy server')
  .action(async () => {
    try {
      const config = loadConfig();
      const db = initDb();
      const currencyInfo = await getCurrency(db, config);

      const { config: cleanedConfig, result: dedupResult } = applyDeduplication(config);

      const checked = await checkAllProviders(cleanedConfig);

      const lastUsedOpenRouter = getLastUsedOpenRouterModel(db);

      const banner = buildBanner(
        4000,
        currencyInfo,
        checked,
        cleanedConfig,
        dedupResult,
        lastUsedOpenRouter
      );

      console.log(banner);
      console.log('');

      const port = 4000;

      Bun.serve({
        port,
        hostname: 'localhost',
        fetch: createServer({ db, config: cleanedConfig, currency: currencyInfo }).fetch,
        idleTimeout: 255,
      });

      console.log(`  Server running on http://localhost:${port}`);
      console.log('  Press Ctrl+C to stop\n');
    } catch (error) {
      console.error('Failed to start Corvyn:', error);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description("Show today's usage statistics")
  .action(async () => {
    try {
      const db = initDb();
      const config = loadConfig();
      const currencyInfo = await getCurrency(db, config);
      const stats = getTodayStats(db);

      console.log('');
      console.log('  CORVYN Daily Stats');
      console.log('  ' + '\u2550'.repeat(30));
      console.log(`  Total Requests:  ${stats.totalRequests}`);
      console.log(`  Free Tier:       ${stats.freeRequests}`);
      console.log(`  Local (Ollama):  ${stats.localRequests}`);
      console.log(`  Paid:            ${stats.paidRequests}`);
      console.log('  ' + '\u2500'.repeat(30));
      console.log(`  Cost:            ${formatCost(stats.costUsd, currencyInfo)}`);
      console.log(`  Saved:           ${formatCost(stats.savedLocal, currencyInfo)}`);
      console.log('  ' + '\u2500'.repeat(30));
      const b = checkBudget(db, config.budget.daily, config.budget.weekly, config.budget.monthly);
      const pctDaily = b.dailyLimit > 0 ? Math.round((b.dailySpend / b.dailyLimit) * 100) : 0;
      const pctWeekly = b.weeklyLimit > 0 ? Math.round((b.weeklySpend / b.weeklyLimit) * 100) : 0;
      const pctMonthly = b.monthlyLimit > 0 ? Math.round((b.monthlySpend / b.monthlyLimit) * 100) : 0;
      const warn = (exceeded: boolean) => exceeded ? ' \u26a0 EXCEEDED' : '';
      const localFmt = { ...currencyInfo, rate: 1 };
      console.log(`  Budget (daily):  ${formatCost(b.dailySpend, localFmt)} / ${formatCost(b.dailyLimit, localFmt)} (${pctDaily}%)${warn(b.dailyExceeded)}`);
      console.log(`  Budget (weekly): ${formatCost(b.weeklySpend, localFmt)} / ${formatCost(b.weeklyLimit, localFmt)} (${pctWeekly}%)${warn(b.weeklyExceeded)}`);
      console.log(`  Budget (month):  ${formatCost(b.monthlySpend, localFmt)} / ${formatCost(b.monthlyLimit, localFmt)} (${pctMonthly}%)${warn(b.monthlyExceeded)}`);
      console.log('');
    } catch (error) {
      console.error('Failed to get stats:', error);
      process.exit(1);
    }
  });

program
  .command('quota')
  .description('Show free tier quota remaining')
  .action(() => {
    try {
      const db = initDb();
      const status = getQuotaStatus(db);

      console.log('');
      console.log('  CORVYN Quota Status');
      console.log('  ' + '\u2550'.repeat(40));

      for (const info of status) {
        const name = info.provider.charAt(0).toUpperCase() + info.provider.slice(1);
        const padded = `${name}:`.padEnd(12);
        const ratio = info.requestsLimit > 0 ? info.requestsToday / info.requestsLimit : 0;
        const width = 20;
        const filled = Math.round(ratio * width);
        const empty = width - filled;
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
        const pct = Math.round(ratio * 100);
        console.log(`  ${padded} ${bar} ${pct}% (${info.remaining} remaining)`);
      }

      console.log('');
    } catch (error) {
      console.error('Failed to get quota:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Create default config file interactively')
  .action(() => {
    interactiveInit().catch((err) => {
      console.error('Init failed:', err);
      process.exit(1);
    });
  });

program
  .command('doctor')
  .description('Run diagnostics on Corvyn configuration and providers')
  .action(async () => {
    try {
      const config = loadConfig();
      const db = initDb();
      const currencyInfo = await getCurrency(db, config);

      console.log('');
      console.log('  CORVYN Doctor');
      console.log('  ' + '\u2550'.repeat(40));

      // ── Config status ──
      console.log('');
      console.log('  Configuration');
      console.log('  ' + '\u2500'.repeat(40));
      const hasOr = config.providers.openrouter.enabled && config.providers.openrouter.api_key !== '';
      console.log(`  Deduplication:  ${config.general.deduplicate ? 'enabled' : 'disabled'}`);
      console.log(`  OpenRouter:     ${hasOr ? 'configured' : 'not configured'}`);
      console.log(`  Budget daily:   ${formatCost(config.budget.daily, { ...currencyInfo, rate: 1 })}`);

      // ── Dedup report ──
      const { result: dedupResult } = applyDeduplication(config);
      if (dedupResult.removed.length > 0) {
        console.log('');
        console.log('  Conflicts Resolved');
        console.log('  ' + '\u2500'.repeat(40));
        for (const r of dedupResult.removed) {
          console.log(`  - ${r.model}`);
          console.log(`    \u2192 Direct ${r.winner} wins (lower latency)`);
        }
      }
      if (dedupResult.warnings.length > 0) {
        console.log('');
        console.log('  Warnings');
        console.log('  ' + '\u2500'.repeat(40));
        for (const w of dedupResult.warnings) {
          console.log(`  ${w}`);
        }
      }

      // ── Provider health ──
      console.log('');
      console.log('  Provider Health');
      console.log('  ' + '\u2500'.repeat(40));
      const checked = await checkAllProviders(config);
      for (const p of checked) {
        const statusIcon = p.status === 'working' ? '\u2713' : p.status === 'missing' ? '\u2717' : '\u26a0';
        const label = `${statusIcon} ${p.name}`;
        console.log(`  ${label.padEnd(14)} ${p.label}${p.subLabel ? ` (${p.subLabel})` : ''}`);
      }

      // ── Routing summary ──
      console.log('');
      console.log('  Routing Summary');
      console.log('  ' + '\u2500'.repeat(40));
      const categories = ['security', 'complex', 'generate', 'test', 'debug', 'medium', 'simple'] as const;
      for (const cat of categories) {
        const providers = getRoutingOrderForTask(cat, config);
        const seen = new Set<string>();
        const unique: string[] = [];
        for (const p of providers) {
          const label = p.name === 'openrouter'
            ? (p.modelId.endsWith(':free') ? 'openrouter-free' : 'openrouter-paid')
            : p.name;
          if (!seen.has(label)) {
            seen.add(label);
            unique.push(label);
          }
        }
        const names = unique.join(' \u2192 ');
        const displayName = cat.charAt(0).toUpperCase() + cat.slice(1);
        console.log(`  ${displayName.padEnd(10)} ${names || '(no providers)'}`);
      }

      // ── Savings estimate ──
      console.log('');
      console.log('  Savings Estimate');
      console.log('  ' + '\u2500'.repeat(40));
      const stats = getTodayStats(db);
      if (stats.totalRequests > 0) {
        console.log(`  Today's requests:    ${stats.totalRequests}`);
        console.log(`  Saved (local):       ${formatCost(stats.savedLocal, { ...currencyInfo, rate: 1 })}`);
        const pct = stats.costUsd + stats.savedLocal > 0
          ? Math.round((stats.savedLocal / (stats.costUsd + stats.savedLocal)) * 100)
          : 0;
        console.log(`  Savings rate:        ${pct}%`);
      } else {
        console.log('  No requests today yet.');
      }

      // ── Suggestions ──
      console.log('');
      console.log('  Suggestions');
      console.log('  ' + '\u2500'.repeat(40));
      const suggestions: string[] = [];
      const freeEnabled = checked.filter((p) => p.tier === 'free' && p.status === 'working');
      const hasOllama = checked.some((p) => p.tier === 'local' && p.status === 'working');
      const hasPaid = checked.some((p) => p.tier === 'paid' && p.status === 'working');
      const hasOpenRouter = checked.some((p) => p.tier === 'openrouter' && p.status === 'working');

      if (freeEnabled.length === 0 && !hasOpenRouter) {
        suggestions.push('No free providers configured — consider adding Groq, Gemini, or OpenRouter free tier');
      }
      if (!hasOllama) {
        suggestions.push('Ollama not running — local fallback unavailable');
      }
      if (!hasPaid && hasOpenRouter) {
        suggestions.push('No direct paid keys — OpenRouter markup applies to paid models');
      }
      if (!config.general.deduplicate && hasOpenRouter && hasPaid) {
        suggestions.push('Deduplication disabled with both OpenRouter and direct paid keys — manual conflict management needed');
      }
      if (suggestions.length === 0) {
        suggestions.push('Everything looks good!');
      }
      for (const s of suggestions) {
        console.log(`  \u2022 ${s}`);
      }

      console.log('');
    } catch (error) {
      console.error('Doctor check failed:', error);
      process.exit(1);
    }
  });

program
  .command('currency')
  .description('View or change display currency')
  .action(async () => {
    try {
      const config = loadConfig();
      const db = initDb();
      const currencyInfo = await getCurrency(db, config);

      console.log('');
      console.log('  CORVYN Currency Settings');
      console.log('  ' + '\u2550'.repeat(40));
      console.log('');
      console.log(`  Current currency: ${currencyInfo.symbol} ${currencyInfo.code} (${currencyInfo.name})`);
      console.log(`  Source: ${currencyInfo.source === 'manual' ? 'manual override' : 'auto detected from locale'}`);
      console.log('');
      console.log('  Options:');
      console.log('  1. Keep current (' + currencyInfo.code + ')');
      console.log('  2. Enter currency code manually');
      console.log('  3. List all supported currencies');
      console.log('');
      console.log('  Select an option (1/2/3): ');

      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

      const choice = (await ask('  > ')).trim();

      if (choice === '1') {
        console.log('');
        console.log(`  Keeping ${currencyInfo.symbol} ${currencyInfo.code} (${currencyInfo.name})`);
      } else if (choice === '2') {
        const code = (await ask('  Enter currency shortcode (e.g. INR, NGN, BRL): ')).trim().toUpperCase();
        if (isValidCurrencyCode(code)) {
          const dir = getCorvynDir();
          const configPath = path.join(dir, 'corvyn.config.toml');
          if (fs.existsSync(configPath)) {
            const success = updateCurrencyOverride(configPath, code);
            if (success) {
              const info = CURRENCY_SYMBOLS[code]!;
              console.log('');
              console.log(`  Currency updated to ${info.symbol} ${code} (${info.name})`);
              console.log('  All costs will now display in ' + info.name + '.');
              console.log('  Restart CORVYN for changes to take effect.');
            } else {
              console.log('');
              console.log('  Config file not found. Edit corvyn.config.toml manually:');
              console.log('  [currency]');
              console.log('  mode = "manual"');
              console.log(`  override = "${code}"`);
            }
          } else {
            console.log('');
            console.log('  No config file found. Run "corvyn init" first.');
          }
        } else {
          console.log('');
          console.log(`  Unknown currency code: ${code}`);
          const allCodes = getAllCurrencyCodes();
          const similar = allCodes.filter((c) => c.code.startsWith(code[0] ?? '')).slice(0, 5);
          if (similar.length > 0) {
            console.log('  Did you mean: ' + similar.map((c) => `${c.code} ${c.symbol} (${c.name})`).join(', '));
          }
          console.log('  Run "corvyn currency" and select option 3 to see all codes.');
        }
      } else if (choice === '3') {
        console.log('');
        console.log('  Supported Currencies');
        console.log('  ' + '\u2500'.repeat(40));
        const allCodes = getAllCurrencyCodes();
        for (const c of allCodes) {
          console.log(`  ${c.code.padEnd(4)} ${c.symbol.padEnd(4)} ${c.name}`);
        }
        console.log('');
      }

      rl.close();
      console.log('');
    } catch (error) {
      console.error('Currency command failed:', error);
      process.exit(1);
    }
  });

program.parse();
