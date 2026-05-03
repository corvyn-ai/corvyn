# CORVYN — Developer Guide

Everything you need to set up, configure, and hack on Corvyn.

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- At least one API key (Gemini free tier is the easiest to get)

## Setup

```bash
git clone <repo-url>
cd corvyn
bun install
```

### Environment Variables

Create a `.env` file in the project root. Bun auto-loads it — no dotenv needed.

```bash
# Free providers
GEMINI_API_KEY=AIza...
CEREBRAS_API_KEY=csk-...
GROQ_API_KEY=gsk_...
SAMBANOVA_API_KEY=...
MISTRAL_API_KEY=...

# Gateways
OPENROUTER_API_KEY=sk-or-v1-...
OPENCODE_GO_API_KEY=...
OPENCODE_ZEN_API_KEY=...

# Direct paid (optional)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
```

Reference them in `corvyn.config.toml`:

```toml
[providers.gemini]
enabled = true
api_key = "$GEMINI_API_KEY"
```

Both `$VAR_NAME` and `env:VAR_NAME` formats work.

## Running

```bash
bun start                          # Start proxy on port 4000
bun run src/index.ts stats         # Today's usage
bun run src/index.ts quota         # Quota status
bun run src/index.ts doctor        # Full diagnostics
bun run src/index.ts currency      # View/change currency
bun run src/index.ts init          # Create config at ~/.corvyn/
bun run src/index.ts --help        # All commands
```

Dev mode with auto-reload:

```bash
bun run dev
```

Type checking:

```bash
bun run typecheck
```

## Connecting OpenCode

```bash
# In your shell config or OpenCode's .env:
export OPENAI_BASE_URL=http://localhost:4000
export OPENAI_API_KEY=corvyn
```

OpenCode sends requests to Corvyn. Corvyn classifies the task, picks the best provider, streams the response back.

## Configuration

Config is loaded from `./corvyn.config.toml` first, then `~/.corvyn/corvyn.config.toml`.

### Providers

All providers are optional. Enable only what you have keys for.

**Free tier** — no cost, rate-limited:

| Provider | Default Model | RPM | RPD | Get Key |
|---|---|---|---|---|
| Gemini | gemini-2.5-flash | 15 | 1,500 | [aistudio.google.com](https://aistudio.google.com) |
| Groq | llama-3.3-70b-versatile | 30 | 14,400 | [console.groq.com](https://console.groq.com) |
| Cerebras | gpt-oss-120b | 30 | 1,700 | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| SambaNova | Meta-Llama-3.3-70B-Instruct | 30 | 3,000 | [cloud.sambanova.ai](https://cloud.sambanova.ai) |
| Mistral | mistral-small-latest | 15 | 1,000 | [console.mistral.ai](https://console.mistral.ai) |

**Gateways** — aggregated access to many models:

| Provider | Type | Models | Endpoint |
|---|---|---|---|
| OpenRouter | Free + paid | 30+ free, 20+ paid | `openrouter.ai/api/v1` |
| OpenCode Go | Subscription ($10/mo) | 14 models (Kimi, GLM, Qwen, DeepSeek, MiMo, MiniMax) | `opencode.ai/zen/go/v1` |
| OpenCode Zen | Pay-as-you-go | Free + paid (Qwen, MiniMax, GLM, Kimi, Big Pickle) | `opencode.ai/zen/v1` |

**Direct paid** — your own API keys, no rate limits:

| Provider | Default Model | Get Key |
|---|---|---|
| Anthropic | claude-sonnet-4-20250514 | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | gpt-4o | [platform.openai.com](https://platform.openai.com) |
| DeepSeek | deepseek-chat | [platform.deepseek.com](https://platform.deepseek.com) |

**Local** — runs on your machine:

| Provider | Default Model | Setup |
|---|---|---|
| Ollama | qwen2.5-coder:7b | [ollama.ai](https://ollama.ai) |

### Routing

Routing rules define which providers are tried for each task category, in order:

```toml
[routing]
security = ["openrouter-free", "opencode-go", "openrouter-paid"]
complex  = ["openrouter-free", "opencode-go", "openrouter-paid"]
generate = ["openrouter-free", "opencode-go", "cerebras", "gemini"]
test     = ["openrouter-free", "opencode-go", "gemini", "cerebras"]
debug    = ["openrouter-free", "opencode-go", "cerebras", "gemini"]
medium   = ["openrouter-free", "opencode-go", "gemini", "cerebras"]
simple   = ["cerebras", "openrouter-free", "opencode-go", "gemini"]
```

Valid provider names for routing rules:
- `groq`, `gemini`, `cerebras`, `sambanova`, `mistral` — free tier
- `openrouter-free`, `openrouter-paid` — OpenRouter
- `opencode-go` — OpenCode Go (all models tried in order)
- `opencode-zen-free`, `opencode-zen-paid` — OpenCode Zen
- `anthropic`, `openai`, `deepseek` — direct paid
- `ollama` — local

### Routing Modes

Users can force a mode via the model hint sent by OpenCode:

| Model Hint | Behavior |
|---|---|
| `corvyn/auto` (default) | Free first, then subscription, then paid |
| `corvyn/free` | Free providers only, no paid fallback |
| `corvyn/paid` | Paid providers only, skips all free tiers |

### OpenRouter Model Selection

Each task category has a primary model and falls back through the full model list:

```toml
[routing.openrouter_models]
free_security = "qwen/qwen3-coder:free"
free_complex  = "nvidia/nemotron-3-super-120b-a12b:free"
free_medium   = "z-ai/glm-4.5-air:free"
free_simple   = "google/gemma-4-26b-a4b-it:free"
free_fallback = "openai/gpt-oss-120b:free"

paid_security = "anthropic/claude-sonnet-4.6"
paid_complex  = "anthropic/claude-opus-4.7"
paid_medium   = "qwen/qwen3-235b-a22b-2507"
paid_simple   = "openai/gpt-5-nano"
```

### Currency

```toml
[currency]
mode     = "auto"      # auto-detect from system locale
override = "INR"        # or set manually (100+ currencies supported)
```

### Budget

```toml
[budget]
daily   = 30           # in your local currency
weekly  = 150
monthly = 500
```

### Deduplication

When you have both a direct API key (e.g., Gemini) and the same model in OpenRouter paid list, the direct key wins automatically. Disable with:

```toml
[general]
deduplicate = false
```

## Architecture

```
OpenCode → POST /v1/chat/completions or /v1/messages
  ↓
server.ts (Hono)
  ↓
router.ts → routeRequest()
  ├── classifyTask() → security | debug | test | complex | generate | medium | simple
  ├── detectMode() → auto | free | paid
  ├── getRoutingOrderForTask() → Provider[]
  ├── Strip reasoning_content from messages
  └── Loop providers:
      ├── Check quota (rpm/rpd/tpm)
      ├── tryProvider() → fetch + 30s timeout
      ├── createSSEProxy() → clean chunks, capture usage, write to DB
      └── On fail → try next provider
```

### File Map

| File | Purpose | Key Exports |
|---|---|---|
| `src/index.ts` | CLI entry point | 6 commands (start, stats, quota, init, doctor, currency) |
| `src/server.ts` | HTTP server | `createServer()` → Hono app |
| `src/router.ts` | Core routing + streaming | `routeRequest()` |
| `src/config.ts` | Config types + loader | `CorvynConfig`, `loadConfig()` |
| `src/providers.ts` | Provider builder + costs | `getAvailableProviders()`, `calculateCost()` |
| `src/quota.ts` | Rate limiting + usage | `hasQuota()`, `recordRequest()`, `getTodayStats()` |
| `src/currency.ts` | Currency detection + formatting | `getCurrency()`, `formatCost()` |
| `src/classifier.ts` | Task classification | `classifyTask()` — TF-IDF + tiebreakers |
| `src/deduplicator.ts` | Conflict resolution | `resolveProviderConflicts()` |
| `src/db/index.ts` | Database init + schema | `initDb()` |

### Server Endpoints

| Method | Path | Format |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI (primary) |
| POST | `/v1/messages` | Anthropic |
| POST | `/v1/completions` | Legacy (converted to chat) |
| GET | `/v1/models` | Model listing |
| GET | `/health` | Health check |

### Database

SQLite at `~/.corvyn/corvyn.db` with WAL mode. Tables:

- `requests` — full request log (timestamp, provider, model, tokens, cost, latency)
- `quota_state` — per-provider daily quota counters
- `daily_stats` — aggregated daily stats (requests by tier, cost, savings)
- `exchange_rates` — cached currency rates (refreshed every 24h)

### Task Classifier

TF-IDF scoring with Porter stemming + 100+ tiebreaker rules.

| Category | Triggers |
|---|---|
| security | auth, encrypt, jwt, xss, csrf, injection, password, cors |
| debug | fix, bug, error, crash, "not working", race condition |
| test | test, spec, jest, vitest, mocha, coverage, e2e |
| complex | architect, design, system, microservice, infrastructure |
| generate | create, write, build, scaffold, setup, new |
| medium | refactor, improve, optimize, update (default) |
| simple | explain, describe, what, how, define |

100% accuracy on 150 test cases. Run `bun run benchmark.ts` to verify.

### Streaming

All responses are streamed end-to-end. The SSE proxy:

1. Reads upstream SSE chunks
2. Strips non-standard fields (`reasoning_details`, `native_finish_reason`, `provider`)
3. Strips non-standard message fields before sending (`reasoning_content`, `reasoning`)
4. Captures `usage` from the final chunk
5. Writes cost/tokens/latency to DB
6. Logs a one-liner summary
7. Forwards cleaned chunks to the client

### Cost Tracking

| Provider | How Cost Is Calculated |
|---|---|
| Free providers | $0 |
| OpenCode Go | $0 (subscription) |
| OpenRouter | `usage.cost` from response (exact) |
| OpenCode Zen | $0.50/M input, $3.00/M output (estimate) |
| Direct paid | Per-provider rate table |

Savings = what Claude Sonnet would have cost ($3/M input, $15/M output) minus actual cost.

## Adding a New Provider

1. **`src/config.ts`** — Add interface, default config, merge function, wire into `CorvynConfig`
2. **`src/providers.ts`** — Add base URL, tier mapping, build in `getAvailableProviders()`, add to `resolveProvider()` for routing, add cost rates
3. **`src/index.ts`** — Add to banner, connection checks, config template
4. **`corvyn.config.toml`** — Add example section
5. **`AGENTS.md`** — Update provider table

If the provider uses standard OpenAI `/chat/completions` format, no changes needed in `router.ts` or `server.ts`.

## Tech Stack

| Component | Package | Why |
|---|---|---|
| Runtime | Bun | Fast, built-in SQLite, auto-loads .env |
| HTTP | Hono | Lightweight, fast, good middleware |
| Config | smol-toml | Small TOML parser, no dependencies |
| CLI | Commander.js | Standard CLI framework |
| Database | bun:sqlite | Built into Bun, WAL mode, no native addons |
| TypeScript | strict mode | `noUncheckedIndexedAccess`, `noImplicitOverride` |

**Not used** (despite what older docs may say):
- No Vercel AI SDK — raw fetch + SSE parsing
- No Zod — manual validation
- No better-sqlite3 — doesn't work on Bun
- No dotenv — Bun handles .env natively

## Gotchas

- **bun:sqlite only** — `better-sqlite3` fails on Bun (no native addon support)
- **No `hono/bun` serve** — use `Bun.serve()` directly
- **Cerebras models** — must be separate array entries, not comma-separated
- **OpenRouter free models** — have tier `openrouter`, not `free`. Check `modelId.endsWith(":free")` to identify them
- **reasoning_content** — some models (Qwen, DeepSeek R1) add this to responses. OpenCode passes it back in follow-up messages. Providers like Cerebras reject it. Corvyn strips it automatically before sending.
- **Paid mode** — filters out both `tier === "free"` and OpenRouter `:free` models
- **OpenCode Go/Zen** — only `/chat/completions` compatible models are supported. Claude/GPT models on Zen use different endpoints that Corvyn can't proxy.
