![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-0.1.4-blue)
![Built with Bun](https://img.shields.io/badge/built%20with-Bun-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Currencies](https://img.shields.io/badge/currencies-60%2B-yellow)

# CORVYN

> AI routing proxy that uses free models automatically and shows costs in your local currency.

Local AI routing proxy for [OpenCode](https://opencode.ai). Routes requests across free tiers, local models, subscription gateways, and paid providers based on task type, quota, and availability.

## Features

- **Config-driven** — all providers optional, enable only what you have
- **Task-aware routing** — TF-IDF classifier (251/251, 100% accuracy, 0.07ms) picks the best provider per request
- **Three routing modes** — `auto` (free → subscription → paid), `free` (free only), `paid` (paid only)
- **Free tier quota management** — tracks RPM/RPD/TPM limits, auto-resets at midnight
- **Subscription gateway** — OpenCode Go ($10/mo flat) and OpenCode Zen (pay-as-you-go) support
- **Deduplication** — direct API keys take priority over OpenRouter for the same models
- **Cost tracking** — records savings vs Claude Sonnet pricing, shown in your local currency
- **Multi-currency** — auto-detects from system locale or set manually (60+ currencies)
- **Streaming preserved** — full SSE streaming for all responses
- **Tool call support** — passes through tool calls with correct indices

## Install

One command:

```bash
curl -fsSL https://raw.githubusercontent.com/corvyn-ai/corvyn/main/install.sh | bash
```

Or download a binary from [github.com/corvyn-ai/corvyn/releases/latest](https://github.com/corvyn-ai/corvyn/releases/latest):

| Binary | Platform |
|---|---|
| `corvyn-macos-arm64` | Mac Apple Silicon |
| `corvyn-macos-x64` | Mac Intel |
| `corvyn-linux-x64` | Linux |
| `corvyn-windows-x64` | Windows |

## Quick Start

```bash
corvyn init      # Create config, add your API keys
corvyn start     # Start the proxy on localhost:4000
```

## Connecting to OpenCode

CORVYN works as a drop-in provider for OpenCode. All requests route through CORVYN automatically — free tiers, local models, smart routing — everything works transparently.

### Step 1 — Start CORVYN

```bash
corvyn start
```

Wait until you see:
```
Server running on http://localhost:4000
```

### Step 2 — Create OpenCode Config

Open or create `~/.config/opencode/config.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "corvyn": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CORVYN",
      "options": {
        "baseURL": "http://localhost:4000/v1"
      },
      "models": {
        "auto": { "name": "CORVYN Auto Router" },
        "free": { "name": "CORVYN Free Only" },
        "paid": { "name": "CORVYN Paid Only" }
      }
    }
  },
  "model": "corvyn/auto"
}
```

### Step 3 — Add API Key

Create or edit `~/.local/share/opencode/auth.json`:

```json
{
  "corvyn": {
    "apiKey": "corvyn"
  }
}
```

### Step 4 — Run OpenCode

```bash
opencode
```

OpenCode now shows CORVYN in the provider list. Select `corvyn/auto` — CORVYN handles everything.

### How Model Selection Works

| You select | What happens |
|---|---|
| `corvyn/auto` | Classifies task, tries free → subscription → paid |
| `corvyn/free` | Free-tier providers only, no paid fallback |
| `corvyn/paid` | Skips free tier, uses paid providers directly |

### Verify It's Working

In your CORVYN terminal you should see:
```
[CORVYN] ✓ openrouter(FREE) qwen/qwen3-coder:free | 33,892in/153out (34,045) | ₹0.00 cost, ₹9.88 saved | 8.1s
```

Every request logged. Every model shown. Every cost tracked.

### Check Your Savings

```bash
corvyn stats
```

```
CORVYN Daily Stats
══════════════════════════════
Total Requests:  31
Free Tier:       26
Local (Ollama):  0
Paid:            5
──────────────────────────────
Cost:            ₹0.00
Saved:           ₹388.83
──────────────────────────────
Budget (daily):  ₹0.00 / ₹30.00 (0%)
Budget (weekly): ₹232.06 / ₹150.00 (2%)
Budget (month):  ₹232.06 / ₹500.00 (0%)
```

## Classifier

TF-IDF + tiebreaker rules. Zero ML models. Zero API calls. Pure TypeScript.

- **251/251** test cases — 100% accuracy
- **0.07ms** per classification

Categories (highest to lowest priority):

| Category | Triggers on |
|---|---|
| `security` | auth, encrypt, jwt, xss, csrf, injection |
| `complex` | architect, design, system, infrastructure |
| `generate` | create, write, build, scaffold |
| `test` | test, spec, jest, vitest, mocha |
| `debug` | fix, bug, error, crash, "not working" |
| `medium` | refactor, improve, optimize, update (default) |
| `simple` | explain, describe, what, how |

## Commands

| Command | What it does |
|---|---|
| `corvyn start` | Start the proxy server |
| `corvyn stats` | Show today's usage and savings |
| `corvyn quota` | Show free tier quota remaining |
| `corvyn init` | Interactive first-time setup wizard |
| `corvyn doctor` | Check setup and diagnose issues |
| `corvyn currency` | View or change display currency |

## Supported Providers

### Free Providers (no cost)

| Provider | Free Limit | Get Key At |
|---|---|---|
| Gemini | 1,500 req/day | [aistudio.google.com](https://aistudio.google.com) |
| Cerebras | 1,700 req/day | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| Groq | 14,400 req/day | [console.groq.com](https://console.groq.com) |
| SambaNova | 1,000 req/day | [cloud.sambanova.ai](https://cloud.sambanova.ai) |
| Mistral | 500K tok/month | [console.mistral.ai](https://console.mistral.ai) |
| OpenRouter | 25+ free models | [openrouter.ai](https://openrouter.ai) |
| Ollama | Unlimited local | [ollama.ai](https://ollama.ai) |

### Subscription Gateways

| Provider | Pricing | Models | Get Access At |
|---|---|---|---|
| OpenCode Go | $10/mo flat | 14 models (GLM, Kimi, MiMo, MiniMax, Qwen, DeepSeek) | [opencode.ai](https://opencode.ai) |
| OpenCode Zen | Pay-as-you-go | Free + paid tiers | [opencode.ai](https://opencode.ai) |

### Paid Providers (your own keys)

| Provider | Why Use It | Get Key At |
|---|---|---|
| Anthropic | Best for complex tasks | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | GPT-5 when needed | [platform.openai.com](https://platform.openai.com) |
| DeepSeek | Cheapest paid option | [platform.deepseek.com](https://platform.deepseek.com) |

All providers use the OpenAI-compatible API via `baseURL`. One SDK (`openai`) handles everything.

## Local Currency Support

CORVYN auto-detects your currency from system locale. All costs and savings shown in your money.

| Country | Currency | Example savings display |
|---|---|---|
| India | ₹ INR | Saved ₹340 today |
| Nigeria | ₦ NGN | Saved ₦12,400 today |
| Brazil | R$ BRL | Saved R$89 today |
| Indonesia | Rp IDR | Saved Rp156,000 today |
| Pakistan | ₨ PKR | Saved ₨940 today |

To manually set your currency:

```bash
corvyn currency
```

Or in `corvyn.config.toml`:

```toml
[currency]
mode     = "manual"
override = "NGN"
```

Supports 60+ world currencies.

## Configuration

Config is loaded from `./corvyn.config.toml` (project root) or `~/.corvyn/corvyn.config.toml`. All providers are optional.

### Currency

```toml
[currency]
mode     = "auto"     # auto = detect from locale, manual = use override
override = ""         # ISO 4217 code: INR, NGN, BRL, USD, EUR, etc.
```

### Budget

```toml
[budget]
daily   = 30      # in your display currency
weekly  = 150
monthly = 500
```

### Providers

```toml
[providers.ollama]
enabled = true
host    = "http://localhost:11434"
models  = ["qwen3:4b"]

[providers.gemini]
enabled = true
api_key = "$GEMINI_API_KEY"
rpm     = 15
rpd     = 1500
models  = ["gemini-2.5-flash"]

[providers.openrouter]
enabled     = true
api_key     = "$OPENROUTER_API_KEY"
free_models = ["qwen/qwen3-coder:free", "nvidia/nemotron-3-super-120b-a12b:free"]
paid_models = ["anthropic/claude-sonnet-4.6", "deepseek/deepseek-chat-v3.1"]

[providers.opencode_go]
enabled = true
api_key = "$OPENCODE_GO_API_KEY"
models  = ["glm-5.1", "kimi-k2.6", "qwen3.6-plus", "deepseek-v4-pro"]

[providers.anthropic]
enabled = true
api_key = "$ANTHROPIC_API_KEY"
models  = ["claude-sonnet-4-20250514"]
```

API keys support env var resolution: `"$GEMINI_API_KEY"` or `"env:GEMINI_API_KEY"`.

### Routing

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

## Architecture

```
OpenCode → POST /v1/chat/completions or /v1/messages
  ↓
server.ts → parse format (openai vs anthropic)
  ↓
router.ts → routeRequest()
  1. classifyTask(rawInput) → TaskCategory
  2. detectMode(modelHint) → auto | free | paid
  3. getRoutingOrderForTask(category, config) → Provider[]
  4. Strip non-standard fields from messages
  5. Loop providers in routing order:
     a. Skip if disabled / no API key / no quota
     b. Check rpm/rpd/tpm limits
     c. tryProvider() → fetch with 30s timeout, stream SSE
     d. On success: increment quota, log usage, return stream
     e. On failure: log error, try next
  6. Fallback: 503 with list of configured providers
```

### Provider Tiers

| Tier | Providers | Rate Limits |
|---|---|---|
| free | Groq, Gemini, Cerebras, SambaNova, Mistral | rpm, rpd, tpm |
| openrouter | OpenRouter free/paid models | server-side |
| subscription | OpenCode Go, OpenCode Zen | server-side |
| local | Ollama | unlimited |
| paid | Anthropic, OpenAI, DeepSeek | none |

### Deduplication

When both a direct API key and OpenRouter have the same model, the direct key wins (lower latency, no markup). OpenRouter free models are never deduplicated.

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Bun (`bun:sqlite`, `Bun.serve`) |
| Language | TypeScript strict mode |
| HTTP | Hono |
| AI SDK | `openai` (raw OpenAI SDK) |
| Database | bun:sqlite (WAL mode) |
| Config | smol-toml |
| CLI | Commander.js |
| Classifier | TF-IDF + tiebreakers |

## Project Structure

```
corvyn/
├── src/
│   ├── index.ts         ← CLI entry (start/stats/quota/init/doctor/currency)
│   ├── server.ts        ← Hono proxy endpoints
│   ├── router.ts        ← Core routing engine + streaming
│   ├── config.ts        ← Config types + TOML loader
│   ├── providers.ts     ← Provider builder + cost calculation
│   ├── deduplicator.ts  ← Conflict resolution
│   ├── quota.ts         ← RPM/RPD/TPM tracking
│   ├── currency.ts      ← Multi-currency support + exchange rates
│   ├── classifier.ts    ← TF-IDF task classification
│   └── db/
│       └── index.ts     ← bun:sqlite initialization + schema
├── corvyn.config.toml   ← Default configuration
└── package.json
```

## Notes

- Quota increments **only after** successful response
- Failed requests do NOT burn quota
- Auto-resets at midnight local time
- DB stored at `~/.corvyn/corvyn.db`
- Zero telemetry — nothing leaves your machine except LLM API calls

## Contributing

CORVYN is MIT licensed and built for developers who find AI tools too expensive.

Ways to contribute:
- Add new free tier providers
- Improve task classification
- Add new currency support
- Fix bugs and improve routing
- Improve documentation

```bash
git clone https://github.com/corvyn-ai/corvyn
cd corvyn
bun install
bun run src/index.ts start
```

PRs welcome. Issues welcome. Stars welcome.

---

Built with ❤️ in Tamil Nadu, India.
For the 45 million developers who deserve affordable AI tools.

[corvyn.cc](https://corvyn.cc)
