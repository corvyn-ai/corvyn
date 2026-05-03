![License](https://img.shields.io/badge/license-MIT-green)
![Built with Bun](https://img.shields.io/badge/built%20with-Bun-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Free](https://img.shields.io/badge/cost-free%20forever-brightgreen)
![Currencies](https://img.shields.io/badge/currencies-60%2B-yellow)

# CORVYN

> CORVYN routes your AI coding requests to free models automatically — and shows you exactly what it costs in your local currency.

Local AI routing proxy for OpenCode. Routes requests across free tiers, local models, and paid providers based on task type, quota, and availability.

## Features

- **Config-driven** — all providers are optional, enable only what you have
- **Task-aware routing** — classifies requests (security, complex, test, debug, medium, simple) and routes accordingly
- **Free tier quota management** — tracks RPM/RPD/TPM limits, auto-resets at midnight
- **Deduplication** — direct API keys automatically take priority over OpenRouter for the same models
- **Cost tracking** — records savings vs Claude Sonnet pricing
- **Multi-currency** — auto-detects from system locale or set manually (60+ currencies supported)
- **Streaming preserved** — full SSE streaming for all responses
- **Tool call support** — passes through tool calls with correct indices

## Quick Start

```bash
# Install dependencies
bun install

# Configure your providers
# Edit corvyn.config.toml and add your API keys
# Minimum needed: one free key (Gemini or Groq)
# Get Gemini free at: aistudio.google.com
# Get Groq free at: console.groq.com

# Start CORVYN
bun start

# In a new terminal — run OpenCode
opencode
# Select corvyn/auto as your model
```

## Connecting to OpenCode

CORVYN works as a drop-in provider for OpenCode. All requests route through CORVYN automatically — free tiers, local models, smart routing — everything works transparently.

### Step 1 — Start CORVYN

```bash
cd corvyn
bun start
```

Wait until you see:
```
Server running on http://localhost:4000
```

### Step 2 — Create OpenCode Config

Open or create:
```
~/.config/opencode/config.json
```

Add CORVYN as a provider:

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
        "auto": {
          "name": "CORVYN Auto Router"
        },
        "complex": {
          "name": "CORVYN Complex Tasks"
        },
        "simple": {
          "name": "CORVYN Simple Tasks"
        },
        "debug": {
          "name": "CORVYN Debug Tasks"
        },
        "test": {
          "name": "CORVYN Test Writer"
        }
      }
    }
  },
  "model": "corvyn/auto"
}
```

### Step 3 — Add API Key

```bash
mkdir -p ~/.local/share/opencode
```

Create or edit `~/.local/share/opencode/auth.json`:

```json
{
  "corvyn": {
    "apiKey": "corvyn"
  }
}
```

### Step 4 — Run OpenCode

Open a new terminal:

```bash
opencode
```

OpenCode now shows CORVYN in the provider list. Select `corvyn/auto` — CORVYN handles everything.

### How Model Selection Works

You don't need to pick a model manually. CORVYN classifies every task and picks automatically:

| You select      | CORVYN routes to              |
|-----------------|-------------------------------|
| corvyn/auto     | Best available for task       |
| corvyn/complex  | Powerful model (Nemotron etc) |
| corvyn/simple   | Fast free model (Gemini etc)  |
| corvyn/debug    | Best for bug fixing (Groq)    |
| corvyn/test     | Best for test writing         |

### Verify It's Working

In your CORVYN terminal you should see:
```
[CORVYN] → openrouter | minimax/minimax-m2.5:free | medium
[CORVYN] → groq       | llama-3.3-70b             | debug
[CORVYN] → ollama     | qwen2.5-coder:7b          | simple
```

Every request logged. Every model shown. Every cost tracked.

### Check Your Savings

```bash
corvyn stats
```

Output:
```
Today: 47 requests
Free tier:  41 (87%)
Local:       4 (9%)
Paid:        2 (4%)
Cost:      ₹1.20
Saved:    ₹340.00
```

## Commands

| Command           | What it does                        |
|-------------------|-------------------------------------|
| corvyn start      | Start the proxy server              |
| corvyn launch     | Start proxy + open OpenCode         |
| corvyn stats      | Show today's usage and savings      |
| corvyn quota      | Show free tier quota remaining      |
| corvyn doctor     | Check setup and diagnose issues     |
| corvyn currency   | Change your display currency        |
| corvyn init       | Interactive first-time setup wizard |
| corvyn last       | Show last 5 routed requests         |

## Supported Providers

### Free Providers (no cost)

| Provider   | Free Limit      | Get Key At              |
|------------|-----------------|-------------------------|
| Gemini     | 1,500 req/day   | aistudio.google.com     |
| Groq       | 14,400 req/day  | console.groq.com        |
| Cerebras   | 1,700 req/day   | cloud.cerebras.ai       |
| SambaNova  | 1,000 req/day   | cloud.sambanova.ai      |
| Mistral    | 500K tok/month  | console.mistral.ai      |
| OpenRouter | 25+ free models | openrouter.ai           |
| Ollama     | Unlimited local | ollama.ai               |

### Paid Providers (your own keys)

| Provider   | Why Use It              | Get Key At          |
|------------|-------------------------|---------------------|
| Anthropic  | Best for complex tasks  | console.anthropic.com|
| OpenAI     | GPT-4o when needed      | platform.openai.com |
| DeepSeek   | Cheapest paid option    | platform.deepseek.com|

## Local Currency Support

CORVYN auto-detects your currency from system locale. All costs and savings shown in YOUR money.

| Country    | Currency | Example savings display  |
|------------|----------|--------------------------|
| India      | ₹ INR    | Saved ₹340 today         |
| Nigeria    | ₦ NGN    | Saved ₦12,400 today      |
| Brazil     | R$ BRL   | Saved R$89 today         |
| Indonesia  | Rp IDR   | Saved Rp156,000 today    |
| Pakistan   | ₨ PKR    | Saved ₨940 today         |

To manually set your currency:

```bash
corvyn currency
```

Or in corvyn.config.toml:

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
daily   = 30
weekly  = 150
monthly = 500
```

### Providers

```toml
[providers.ollama]
enabled = true
host    = "http://localhost:11434"
models  = ["qwen2.5-coder:7b"]

[providers.groq]
enabled = true
api_key = "gsk_..."
models  = ["llama-3.3-70b-versatile"]

[providers.openrouter]
enabled     = true
api_key     = "sk-or-..."
free_models = ["nvidia/llama-3.1-nemotron-ultra-253b-v1:free", "minimax/minimax-m2.5:free"]
paid_models = ["anthropic/claude-sonnet-4-20250514", "deepseek/deepseek-chat"]

[providers.anthropic]
enabled = true
api_key = "sk-ant-..."
models  = ["claude-sonnet-4-20250514"]
```

### Routing

```toml
[routing]
security = ["anthropic", "openrouter-paid", "openrouter-free", "ollama"]
complex  = ["openrouter-free", "openrouter-paid", "anthropic", "ollama"]
generate = ["groq", "openrouter-free", "ollama"]
test     = ["openrouter-free", "gemini", "groq", "ollama"]
debug    = ["groq", "openrouter-free", "sambanova", "ollama"]
medium   = ["groq", "openrouter-free", "gemini", "ollama"]
simple   = ["cerebras", "groq", "openrouter-free", "ollama"]
```

## Architecture

```
OpenCode → POST /v1/chat/completions or /v1/messages
  ↓
server.ts → parse format (openai vs anthropic)
  ↓
router.ts → routeRequest()
  1. classifyTask(rawInput) → TaskCategory
  2. getRoutingOrderForTask(category, config) → Provider[]
  3. Check rpm/rpd/tpm limits
  4. Try providers in order (30s timeout each)
  5. On success: increment quota, return stream
  6. On failure: try next provider
```

### Provider Tiers

| Tier | Providers | Rate Limits |
|---|---|---|
| free | Groq, Gemini, Cerebras, SambaNova, Mistral | rpm, rpd, tpm |
| openrouter | OpenRouter free/paid models | server-side |
| local | Ollama | unlimited |
| paid | Anthropic, OpenAI, DeepSeek | none |

### Deduplication

When both a direct API key and OpenRouter have the same model, the direct key wins (lower latency, no markup). Controlled by `deduplicate = true` in config. OpenRouter free models are never deduplicated.

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
│   ├── classifier.ts    ← Task classification
│   └── db/
│       ├── schema.ts    ← Database schema
│       └── index.ts     ← bun:sqlite initialization
├── corvyn.config.toml   ← Default configuration
└── package.json
```

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Bun (bun:sqlite, Bun.serve) |
| Language | TypeScript strict mode |
| HTTP | Hono |
| AI SDK | Vercel AI SDK v4 (`ai`) |
| Database | bun:sqlite (WAL mode) |
| Config | smol-toml |
| CLI | Commander.js |
| Validation | Zod |

## Notes

- Quota increments **only after** successful response
- Failed requests do NOT burn quota
- Auto-resets at midnight local time
- DB stored at `~/.corvyn/corvyn.db`
- Zero telemetry — nothing leaves your machine except LLM API calls
- `better-sqlite3` fails on Bun — uses `bun:sqlite` instead

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
bun start
```

PRs welcome. Issues welcome. Stars welcome. 🚀

## Support & Sponsorship

CORVYN is free and open source forever.

If CORVYN saves you money consider:
- ⭐ Starring the repo
- 🐛 Reporting bugs
- 📢 Sharing with other developers
- 💰 Sponsoring on GitHub Sponsors

Built with ❤️ in Tamil Nadu, India. For developers everywhere who deserve affordable AI tools.
