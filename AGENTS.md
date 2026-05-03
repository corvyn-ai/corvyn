# CORVYN — Agent Instructions

Local AI routing proxy for OpenCode. Routes requests across free tiers, local models, subscription gateways, and paid providers based on task type, quota, and availability.

## Project Overview

| Field | Value |
|---|---|
| Runtime | Bun (uses `bun:sqlite`, `Bun.serve`) |
| Language | TypeScript strict mode |
| HTTP | Hono |
| DB | bun:sqlite (built-in, NOT better-sqlite3) |
| Config | smol-toml (fully config-driven, all providers optional) |
| CLI | Commander.js |
| Port | 4000 (default) |
| DB path | `~/.corvyn/corvyn.db` |
| Config path | `./corvyn.config.toml` or `~/.corvyn/corvyn.config.toml` |
| Env | `.env` (auto-loaded by Bun) |

## File Structure

```
corvyn/
├── .env                  ← API keys (never commit)
├── .gitignore
├── package.json
├── tsconfig.json
├── corvyn.config.toml    ← Provider config, routing rules, budget
├── benchmark.ts          ← Classifier accuracy test (dev tool)
└── src/
    ├── index.ts          ← CLI entry (start/stats/quota/init/doctor/currency)
    ├── server.ts         ← Hono proxy (OpenAI + Anthropic + legacy endpoints)
    ├── router.ts         ← Core: routing + streaming + tool calls + usage logging
    ├── config.ts         ← TypeScript config types + loader + env var resolution
    ├── providers.ts      ← Config-driven provider builder + cost calc
    ├── quota.ts          ← Config-driven limits (rpm/rpd/tpm) + recordRequest
    ├── currency.ts       ← Auto-detect locale, exchange rates, formatCost (100+ currencies)
    ├── classifier.ts     ← TF-IDF + tiebreaker task classification (100% on 150 tests)
    ├── deduplicator.ts   ← Removes OpenRouter paid dupes when direct key exists
    └── db/
        └── index.ts      ← bun:sqlite init + schema + ensureQuotaRow
```

## Architecture

### Request Flow
```
OpenCode → POST /v1/chat/completions or /v1/messages
  ↓
server.ts → parse format (openai vs anthropic)
  ↓
router.ts → routeRequest()
  1. classifyTask(rawInput) → TaskCategory
  2. detectMode(modelHint) → auto | free | paid
  3. getRoutingOrderForTask(category, config) → Provider[]
  4. Strip non-standard fields (reasoning_content) from messages
  5. Loop providers in routing order:
     a. Skip if disabled / no API key / no quota
     b. Check rpm/rpd/tpm limits from config
     c. tryProvider() → fetch with 30s timeout, stream SSE
     d. On success: incrementQuota(), log usage summary, return stream
     e. On failure: log error, try next
  6. Fallback: 503 with list of configured providers
```

### Routing Modes
- `auto` (default) — Try free → subscription → paid in routing order
- `free` (`corvyn/free`) — Only free-tier providers, no paid fallback
- `paid` (`corvyn/paid`) — Skip free-tier and free OpenRouter models, try paid only

### Config-Driven Providers

All providers are **optional**. User enables what they have in `corvyn.config.toml`.
API keys support env var resolution: `api_key = "$GEMINI_API_KEY"` or `api_key = "env:GEMINI_API_KEY"`.

| Provider | Tier | Env/API Key | Rate Limits |
|---|---|---|---|
| Groq | paid | $GROQ_API_KEY | pay-per-token |
| Gemini | free | $GEMINI_API_KEY | rpm, rpd |
| Cerebras | paid | $CEREBRAS_API_KEY | pay-per-token |
| SambaNova | paid | $SAMBANOVA_API_KEY | pay-per-token |
| Mistral | free | $MISTRAL_API_KEY | rpm, rpd, tpm |
| OpenRouter (free) | openrouter | $OPENROUTER_API_KEY | server-side |
| OpenRouter (paid) | openrouter | $OPENROUTER_API_KEY | server-side |
| OpenCode Go | paid | $OPENCODE_GO_API_KEY | subscription limits |
| OpenCode Zen (free) | free | $OPENCODE_ZEN_API_KEY | none |
| OpenCode Zen (paid) | paid | $OPENCODE_ZEN_API_KEY | pay-as-you-go |
| Cloudflare AI Gateway | paid | $CF_AIG_API_TOKEN | rpm, rpd (local tracking) |
| Anthropic | paid | $ANTHROPIC_API_KEY | none |
| OpenAI | paid | $OPENAI_API_KEY | none |
| DeepSeek | paid | $DEEPSEEK_API_KEY | none |
| Ollama | local | none (local) | unlimited |

### OpenRouter Integration

OpenRouter has 2 tiers with one API key:

**Free models** (`openrouter-free` in routing rules)
- `$0` cost, 429 → try next free model in list

**Paid models** (`openrouter-paid` in routing rules)
- Pay-as-you-go from user credits
- Used when free models exhausted or task requires it

**Rules:**
1. Free models ALWAYS tried before paid models
2. If free returns 429 → try next free → then paid → then next provider
3. Cost from OpenRouter's `usage.cost` in response (accurate, no price table)
4. One API key for everything (same key for free + paid)

### OpenCode Go Integration

Subscription-based gateway ($10/mo) at `https://opencode.ai/zen/go/v1/chat/completions`.

- Uses `opencode-go` in routing rules
- All models use OpenAI-compatible `/chat/completions` endpoint
- Flat subscription = $0 marginal cost per request (within limits)
- 14 models: GLM-5/5.1, Kimi K2.5/K2.6, MiMo variants, MiniMax M2.5/M2.7, Qwen3.5/3.6 Plus, DeepSeek V4 Pro/Flash

### OpenCode Zen Integration

Pay-as-you-go gateway at `https://opencode.ai/zen/v1/chat/completions`.

- Uses `opencode-zen-free` and `opencode-zen-paid` in routing rules
- Free models: Big Pickle, MiniMax M2.5 Free, Nemotron 3 Super Free, Hy3 Preview Free
- Paid models: Qwen3.5/3.6 Plus, MiniMax M2.7, Kimi K2.6, GLM 5.1
- Only OpenAI-compatible models supported (Claude/GPT models use different endpoints)

### Cloudflare AI Gateway Integration

Unified OpenAI-compatible proxy at `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat/chat/completions`.

- Uses `cloudflare-ai` in routing rules
- Routes through Cloudflare's edge network — adds caching, analytics, rate limiting, guardrails, DLP
- Models use `{provider}/{model}` format: `openai/gpt-4o`, `anthropic/claude-sonnet-4.5`, `google-ai-studio/gemini-2.5-flash`
- Auth: `cf-aig-authorization: Bearer {CF_AIG_TOKEN}` header always sent for gateway auth
- Supported upstream providers: OpenAI, Anthropic, Google AI Studio, Groq, Mistral, DeepSeek, Cerebras, xAI, Workers AI, OpenRouter, Cohere, Perplexity
- Local quota tracking (rpm/rpd) still applies — Corvyn tracks usage locally even though CF also tracks server-side
- Cost calculated locally from token counts (CF analytics available separately in CF dashboard)
- Config: `account_id`, `gateway_id`, `api_token`, `mode`, `models[]`, optional `provider_keys`

**Three modes:**

| Mode | Authorization header | Provider keys stored in... |
|---|---|---|
| `unified` (default) | Not sent | Nowhere — CF bills from loaded credits |
| `byok` | Not sent | CF dashboard (BYOK / Store Keys) |
| `passthrough` | Provider API key from `provider_keys` table | Your `.env` / corvyn config |

- `unified` — Load credits into CF account, CF handles provider billing. Simplest setup.
- `byok` — Store provider API keys in CF dashboard under Provider Keys. CF injects them at runtime.
- `passthrough` — Corvyn sends provider keys via `Authorization` header. Keys come from `[providers.cloudflare_ai.provider_keys]` table, mapped by provider prefix (e.g. `openai = "$OPENAI_API_KEY"`).

### Task Categories
- `security` — auth/encrypt/jwt/xss/csrf/injection keywords
- `debug` — fix/bug/error/crash/"not working" keywords
- `test` — test/spec/jest/vitest/mocha keywords
- `complex` — architect/design/system/infrastructure keywords
- `generate` — create/write/build/scaffold keywords
- `medium` — refactor/improve/optimize/update (default)
- `simple` — explain/describe/what/how keywords

Classification uses TF-IDF with stemming + 100+ tiebreaker rules. 100% accuracy on 150 test cases, ~0.07ms latency.

### Routing Strategy (config-driven)

Default routing in config:
```
security:  openrouter-free → opencode-go → openrouter-paid
complex:   openrouter-free → opencode-go → openrouter-paid
generate:  openrouter-free → opencode-go → cerebras → gemini
test:      openrouter-free → opencode-go → gemini → cerebras
debug:     openrouter-free → opencode-go → cerebras → gemini
medium:    openrouter-free → opencode-go → gemini → cerebras
simple:    cerebras → openrouter-free → opencode-go → gemini
```

When `opencode-zen` is enabled, `opencode-zen-free` and `opencode-zen-paid` can be added to routing rules.

When `cloudflare-ai` is enabled, `cloudflare-ai` can be added to routing rules. It iterates through all configured models in order.

### Quota Rules
- Quota incremented **only after** successful response (not before)
- Auto-resets at midnight local time
- 30s timeout per provider call
- Failed requests do NOT burn quota
- **RPM**: requests in last 60 seconds (free providers)
- **RPD**: requests since midnight (free providers)
- **TPM**: tokens since start of month (Mistral)
- **OpenRouter/OpenCode**: no local tracking, server handles limits
- **Cloudflare AI Gateway**: local rpm/rpd tracking (optional), CF also tracks server-side
- **Ollama/Paid**: no tracking needed

### Cost Tracking
- `calculateCost(provider, inputTokens, outputTokens)` — actual cost per provider
- `calculateSavings(actualCost, inputTokens, outputTokens)` — vs Claude Sonnet ($3/M input, $15/M output)
- OpenRouter: uses `usage.cost` from response directly (100% accurate)
- OpenCode Go: $0 marginal cost (subscription)
- Cost displayed in user's local currency after each request
- Daily stats aggregate cost and savings

### Usage Logging
Each completed request logs a one-liner:
```
[CORVYN] ✓ openrouter(FREE) tencent/hy3-preview:free | 33,892in/153out (34,045) | ₹0.00 cost, ₹9.88 saved | 8.1s
```

## Conventions

### Code Style
- TypeScript strict mode everywhere
- No `any` types
- Every async function must have error handling
- No comments unless asked
- Short functions, early returns
- `const` over `let` where possible

### SQLite
- Use `bun:sqlite` (NOT better-sqlite3 — Bun doesn't support native addons)
- `db.prepare(sql).run(...params)` for writes
- `db.prepare(sql).get(param)` for single row
- `db.prepare(sql).all()` for multiple rows
- WAL mode enabled

### Streaming
- MUST preserve streaming for all responses
- OpenCode depends on it
- Tool calls pass through unchanged
- Non-standard fields stripped from messages before sending (reasoning_content, reasoning)
- Non-standard fields stripped from SSE chunks (reasoning_details, native_finish_reason, provider)

### Database
- Never log full prompt content — only first 200 chars extracted, first 50 logged
- Zero telemetry. Nothing leaves machine except LLM API calls
- DB stored at `~/.corvyn/corvyn.db`

### Config
- Read with `smol-toml` `parse()`
- Look in current dir first, then `~/.corvyn/`
- All providers optional — missing fields use sensible defaults
- API keys resolved from env vars: `$VAR_NAME` or `env:VAR_NAME`
- User enables only what they have

### Server Endpoints
- `POST /v1/chat/completions` — OpenAI format (primary)
- `POST /v1/messages` — Anthropic format (OpenCode uses both)
- `POST /v1/completions` — Legacy completions
- `GET /v1/models` — Model listing
- `GET /health` — Health check

### CLI Commands
- `corvyn start` — Load config, init DB, check connections, start server, print banner
- `corvyn stats` — Show today's usage in local currency
- `corvyn quota` — Show per-provider quota bars
- `corvyn init` — Create default config file at ~/.corvyn/
- `corvyn doctor` — Run diagnostics (config, dedup, health, routing, savings, suggestions)
- `corvyn currency` — View or change display currency

## Dependency Notes
- `@ai-sdk/google` exports `createGoogleGenerativeAI` (NOT `createGoogle`)
- `@ai-sdk/ollama` does NOT exist — use `ollama-ai-provider` instead
- Hono's `serve` from `hono/bun` is missing — use `Bun.serve()` directly
- `better-sqlite3` fails on Bun — always use `bun:sqlite`
- Bun auto-loads `.env` files — no dotenv package needed

### OpenCode Setup
```
OPENAI_BASE_URL=http://localhost:4000
OPENAI_API_KEY=corvyn
```

## Build Commands
```
bun install                    # Install dependencies
bun run src/index.ts start     # Start proxy server
bun run src/index.ts stats     # Today's stats
bun run src/index.ts quota     # Quota status
bun run src/index.ts init      # Create config file
bun run src/index.ts doctor    # Run diagnostics
bun run src/index.ts currency  # View/change currency
bun run src/index.ts --help    # CLI help
bun run benchmark.ts           # Test classifier accuracy
```

## Testing Approach
- Start server, verify banner prints with provider status
- `corvyn stats` and `corvyn quota` must work without errors
- `corvyn doctor` must show all diagnostics without crashes
- Server must handle both OpenAI and Anthropic format requests
- Streaming must work (OpenCode depends on it)
- Tool calls must pass through with correct indices
- Quota must not increment on failed requests
- 30s timeout must prevent hung sessions
- OpenRouter: free models tried before paid, 429 handled gracefully
- OpenCode Go: all 14 models accessible via /chat/completions
- Paid mode: must NOT route to free OpenRouter models or free-tier providers
- Non-standard message fields (reasoning_content) must be stripped before sending
- Deduplication: OpenRouter paid models removed when direct key exists
- Currency: costs displayed in user's local currency
- Env vars: `$VAR_NAME` in config must resolve from `.env` / environment
