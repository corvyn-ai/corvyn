import type { Database } from "bun:sqlite";
import type { Provider } from "./providers";
import { calculateCost, calculateSavings } from "./providers";
import type { CorvynConfig } from "./config";
import {
  getRoutingOrderForTask,
  getAvailableProviders,
  getOpenRouterPaidProviders,
} from "./providers";
import {
  hasQuota,
  hasRpmQuota,
  hasTpmQuota,
  incrementQuota,
  recordRequest,
  checkBudget,
} from "./quota";
import { classifyTask } from "./classifier";
import type { CurrencyInfo } from "./currency";
import { formatCost } from "./currency";

// ── Types ───────────────────────────────────────────────────────────

interface ParsedRequest {
  messages: unknown[];
  tools: unknown[] | undefined;
  temperature: number | undefined;
  maxTokens: number | undefined;
  stream: boolean;
  rawInput: string;
  modelHint: string;
  system: string | undefined;
}

// ── Request parsing ─────────────────────────────────────────────────

function extractRawInput(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (typeof msg !== "object" || msg === null) continue;
    const m = msg as Record<string, unknown>;
    if (m.role !== "user") continue;

    if (typeof m.content === "string" && m.content.length > 0) {
      return m.content.substring(0, 200);
    }
    if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "text"
        ) {
          const text = (block as Record<string, unknown>).text;
          if (typeof text === "string") return text.substring(0, 200);
        }
      }
    }
  }
  return "";
}

function parseOpenAIRequest(body: Record<string, unknown>): ParsedRequest {
  const messages = (body.messages ?? []) as unknown[];
  const tools = Array.isArray(body.tools) && body.tools.length > 0
    ? (body.tools as unknown[])
    : undefined;

  return {
    messages,
    tools,
    temperature: body.temperature as number | undefined,
    maxTokens: (body.max_tokens as number | undefined),
    stream: (body.stream as boolean) ?? true,
    rawInput: extractRawInput(messages),
    modelHint: (body.model as string) ?? "unknown",
    system: undefined,
  };
}

function parseAnthropicRequest(body: Record<string, unknown>): ParsedRequest {
  const rawMessages = (body.messages ?? []) as unknown[];
  const messages: unknown[] = [];

  let system: string | undefined;
  if (typeof body.system === "string" && body.system.length > 0) {
    system = body.system;
    messages.push({ role: "system", content: body.system });
  } else if (Array.isArray(body.system)) {
    const parts: string[] = [];
    for (const block of body.system) {
      if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string") parts.push(b.text);
      }
    }
    if (parts.length > 0) {
      system = parts.join("\n");
      messages.push({ role: "system", content: system });
    }
  }

  for (const raw of rawMessages) {
    const msg = raw as Record<string, unknown>;
    const role = msg.role as string;

    if (role === "assistant" && Array.isArray(msg.content)) {
      const textParts: string[] = [];
      const toolCalls: unknown[] = [];
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (block.type === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          const rawInput = block.input ?? {};
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput),
            },
          });
        }
      }
      const converted: Record<string, unknown> = {
        role: "assistant",
        content: textParts.join("") || null,
      };
      if (toolCalls.length > 0) {
        converted.tool_calls = toolCalls;
      }
      messages.push(converted);
    } else if (role === "user" && Array.isArray(msg.content)) {
      const hasToolResult = (msg.content as Array<Record<string, unknown>>).some(
        (b) => b.type === "tool_result"
      );
      if (hasToolResult) {
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block.type === "tool_result") {
            messages.push({
              role: "tool",
              tool_call_id: block.tool_use_id,
              content: typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content ?? ""),
            });
          }
        }
      } else {
        messages.push(msg);
      }
    } else {
      messages.push(msg);
    }
  }

  const tools = Array.isArray(body.tools) && body.tools.length > 0
    ? (body.tools as Array<Record<string, unknown>>).map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }))
    : undefined;

  return {
    messages,
    tools,
    temperature: body.temperature as number | undefined,
    maxTokens: body.max_tokens as number | undefined,
    stream: true,
    rawInput: extractRawInput(messages),
    modelHint: (body.model as string) ?? "unknown",
    system,
  };
}

// ── Usage summary logger ────────────────────────────────────────────

function logUsageSummary(
  ctx: StreamCtx,
  tokIn: number,
  tokOut: number,
  costUsd: number,
  savedUsd: number,
  latency: number,
): void {
  const totalTok = tokIn + tokOut;
  const localCost = formatCost(costUsd, ctx.currency);
  const localSaved = formatCost(savedUsd, ctx.currency);
  const tierLabel = ctx.provider.tier === "free" ? "FREE"
    : ctx.provider.tier === "local" ? "LOCAL"
    : ctx.provider.tier === "openrouter"
      ? (ctx.provider.modelId.endsWith(":free") ? "FREE" : "PAID")
    : "PAID";
  const secs = (latency / 1000).toFixed(1);
  const model = ctx.provider.modelId.length > 30
    ? ctx.provider.modelId.substring(0, 27) + "..."
    : ctx.provider.modelId;

  console.log(`[CORVYN] ✓ ${ctx.provider.name}(${tierLabel}) ${model} | ${tokIn.toLocaleString()}in/${tokOut.toLocaleString()}out (${totalTok.toLocaleString()}) | ${localCost} cost, ${localSaved} saved | ${secs}s`);
}

// ── SSE stream proxy — parses chunks, cleans them, writes usage to DB ───

interface StreamCtx {
  db: Database;
  provider: Provider;
  taskCategory: string;
  currency: CurrencyInfo;
  startTime: number;
}

function createSSEProxy(upstream: ReadableStream<Uint8Array>, ctx: StreamCtx): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = "";

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const t = line.trim();
            if (t === "" || t.startsWith(":")) continue;
            if (!t.startsWith("data: ")) continue;
            const payload = t.slice(6).trim();

            if (payload === "[DONE]") {
              controller.enqueue(enc.encode("data: [DONE]\n\n"));
              reader.releaseLock();
              controller.close();
              return;
            }

            try {
              const chunk = JSON.parse(payload) as Record<string, unknown>;

              // Clean non-standard fields
              const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
              if (choices) {
                for (const c of choices) {
                  const d = c.delta as Record<string, unknown> | undefined;
                  if (d) { delete d.reasoning_details; }
                  delete c.native_finish_reason;
                }
              }
              delete chunk.provider;

              // Capture usage from final chunk and write to DB
              const u = chunk.usage as Record<string, unknown> | undefined;
              if (u && typeof u.prompt_tokens === "number") {
                const tokIn = (u.prompt_tokens as number) ?? 0;
                const tokOut = (u.completion_tokens as number) ?? 0;
                const orCost = (u.cost as number) ?? 0;
                const costUsd = orCost > 0 ? orCost : calculateCost(ctx.provider.name, tokIn, tokOut);
                const savedUsd = calculateSavings(costUsd, tokIn, tokOut);
                const latency = Date.now() - ctx.startTime;
                try {
                  recordRequest(ctx.db, {
                    timestamp: new Date().toISOString(),
                    taskCategory: ctx.taskCategory,
                    providerUsed: ctx.provider.name,
                    modelUsed: ctx.provider.modelId,
                    providerTier: ctx.provider.tier,
                    tokensInput: tokIn, tokensOutput: tokOut,
                    costUsd, costLocal: costUsd * ctx.currency.rate,
                    savedUsd, currencyCode: ctx.currency.code,
                    latencyMs: latency,
                  });
                } catch {}
                logUsageSummary(ctx, tokIn, tokOut, costUsd, savedUsd, latency);
              }

              controller.enqueue(enc.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } catch {}
          }
        }
      } catch (err) {
        console.error(`[CORVYN] Stream error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        reader.releaseLock();
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// ── Try a single provider ───────────────────────────────────────────

async function tryProvider(
  provider: Provider,
  parsed: ParsedRequest,
  format: "openai" | "anthropic",
  ctx: StreamCtx,
): Promise<Response> {
  const url = `${provider.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    ...(provider.headers ?? {}),
  };

  // Strip non-standard fields from messages that some providers reject
  const cleanedMessages = (parsed.messages as Array<Record<string, unknown>>).map((msg) => {
    if (typeof msg !== "object" || msg === null) return msg;
    const { reasoning_content, reasoning, ...rest } = msg;
    return rest;
  });

  const body: Record<string, unknown> = {
    model: provider.modelId,
    messages: cleanedMessages,
    stream: true,
  };
  if (parsed.tools) body.tools = parsed.tools;
  if (parsed.temperature !== undefined) body.temperature = parsed.temperature;
  if (parsed.maxTokens !== undefined) body.max_tokens = parsed.maxTokens;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`${provider.name} ${upstream.status}: ${errText.substring(0, 200)}`);
  }
  if (!upstream.body) throw new Error(`${provider.name}: no body`);

  const stream = (format === "openai")
    ? createSSEProxy(upstream.body, ctx)
    : convertOpenAIToAnthropicStream(upstream.body, provider.modelId);

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

// ── Anthropic SSE converter ─────────────────────────────────────────

function convertOpenAIToAnthropicStream(body: ReadableStream<Uint8Array>, modelId: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const msgId = `msg_corvyn_${Date.now()}`;
  let buf = "";
  let textBlockOpen = false;
  let blockIdx = 0;
  // Track active tool call blocks by OpenAI tool call index
  const activeToolBlocks = new Map<number, { anthropicIdx: number; id: string; name: string }>();

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(`event: message_start\ndata: ${JSON.stringify({
        type: "message_start", message: { id: msgId, type: "message", role: "assistant", model: modelId, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
      })}\n\n`));

      const reader = body.getReader();
      let stopReason = "end_turn";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const chunk = JSON.parse(data) as Record<string, unknown>;
              const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
              if (!choices?.[0]) continue;
              const choice = choices[0];
              const delta = choice.delta as Record<string, unknown> | undefined;
              const finishReason = choice.finish_reason as string | null | undefined;

              if (delta) {
                // ── Text content ──
                if (typeof delta.content === "string" && delta.content.length > 0) {
                  if (!textBlockOpen) {
                    textBlockOpen = true;
                    controller.enqueue(enc.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: blockIdx, content_block: { type: "text", text: "" } })}\n\n`));
                  }
                  controller.enqueue(enc.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: blockIdx, delta: { type: "text_delta", text: delta.content } })}\n\n`));
                }

                // ── Tool calls (streamed incrementally by OpenAI) ──
                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
                    const tcIdx = (tc.index as number) ?? 0;
                    const fn = tc.function as Record<string, unknown> | undefined;

                    // New tool call: has id + function.name
                    if (tc.id && fn?.name) {
                      // Close text block if open
                      if (textBlockOpen) {
                        controller.enqueue(enc.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: blockIdx })}\n\n`));
                        blockIdx++;
                        textBlockOpen = false;
                      }

                      const toolBlockIdx = blockIdx;
                      activeToolBlocks.set(tcIdx, { anthropicIdx: toolBlockIdx, id: tc.id as string, name: fn.name as string });

                      // Emit content_block_start with empty input (args stream via deltas)
                      controller.enqueue(enc.encode(`event: content_block_start\ndata: ${JSON.stringify({
                        type: "content_block_start",
                        index: toolBlockIdx,
                        content_block: { type: "tool_use", id: tc.id, name: fn.name, input: {} },
                      })}\n\n`));
                      blockIdx++;

                      // If this first chunk also carries argument data, emit it
                      if (typeof fn.arguments === "string" && fn.arguments.length > 0) {
                        controller.enqueue(enc.encode(`event: content_block_delta\ndata: ${JSON.stringify({
                          type: "content_block_delta",
                          index: toolBlockIdx,
                          delta: { type: "input_json_delta", partial_json: fn.arguments },
                        })}\n\n`));
                      }
                    } else if (fn && typeof fn.arguments === "string" && fn.arguments.length > 0) {
                      // Continuation chunk: just argument fragments
                      const active = activeToolBlocks.get(tcIdx);
                      if (active) {
                        controller.enqueue(enc.encode(`event: content_block_delta\ndata: ${JSON.stringify({
                          type: "content_block_delta",
                          index: active.anthropicIdx,
                          delta: { type: "input_json_delta", partial_json: fn.arguments },
                        })}\n\n`));
                      }
                    }
                  }
                }
              }

              // ── Finish reason ──
              if (finishReason === "tool_calls") {
                stopReason = "tool_use";
              } else if (finishReason === "stop") {
                stopReason = "end_turn";
              }
            } catch {}
          }
        }
      } finally { reader.releaseLock(); }

      // Close any open text block
      if (textBlockOpen) {
        controller.enqueue(enc.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: blockIdx })}\n\n`));
      }
      // Close any open tool blocks
      for (const [, tb] of activeToolBlocks) {
        controller.enqueue(enc.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: tb.anthropicIdx })}\n\n`));
      }

      controller.enqueue(enc.encode(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`));
      controller.enqueue(enc.encode(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`));
      controller.close();
    },
  });
}

// ── Routing ─────────────────────────────────────────────────────────

type RoutingMode = "auto" | "free" | "paid";

function detectMode(hint: string): RoutingMode {
  const h = hint.toLowerCase().replace("corvyn/", "");
  if (h === "free" || h === "free-only") return "free";
  if (h === "paid" || h === "paid-only") return "paid";
  return "auto";
}

export async function routeRequest(
  db: Database,
  body: Record<string, unknown>,
  format: "openai" | "anthropic",
  config: CorvynConfig,
  currency: CurrencyInfo,
): Promise<Response> {
  const parsed = format === "openai" ? parseOpenAIRequest(body) : parseAnthropicRequest(body);
  const mode = detectMode(parsed.modelHint);
  const task = classifyTask(parsed.rawInput);
  const t0 = Date.now();
  const tried = new Set<string>();

  console.log(`[CORVYN] Mode: ${mode} | Task: ${task} | "${parsed.rawInput.substring(0, 50)}"`);

  // ── Budget enforcement ────────────────────────────────────────────
  const budget = checkBudget(db, config.budget.daily, config.budget.weekly, config.budget.monthly);
  if (budget.blocked) {
    const reason = budget.dailyExceeded ? "daily" : budget.weeklyExceeded ? "weekly" : "monthly";
    const spend = budget.dailyExceeded ? budget.dailySpend : budget.weeklyExceeded ? budget.weeklySpend : budget.monthlySpend;
    const limit = budget.dailyExceeded ? budget.dailyLimit : budget.weeklyExceeded ? budget.weeklyLimit : budget.monthlyLimit;
    console.log(`[CORVYN] ⊘ Budget exceeded — ${reason} limit ${currency.symbol}${limit.toFixed(2)} (spent ${currency.symbol}${spend.toFixed(2)})`);

    // Still allow free and local providers
    if (mode === "paid") {
      return new Response(
        JSON.stringify({ error: { message: `Budget exceeded: ${reason} limit (${currency.symbol}${limit.toFixed(2)}). Spent ${currency.symbol}${spend.toFixed(2)}. Use corvyn/free or wait for reset.`, type: "budget_exceeded" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    // In auto/free mode, continue but only with free/local providers
  }

  const ctx = (p: Provider): StreamCtx => ({ db, provider: p, taskCategory: task, currency, startTime: t0 });

  // ── PAID mode ─────────────────────────────────────────────────────
  if (mode === "paid") {
    if (budget.blocked) {
      return new Response(
        JSON.stringify({ error: { message: `Budget exceeded. Use corvyn/free or wait for reset.`, type: "budget_exceeded" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    // Use the normal routing order but only keep actually-paid providers
    const allProviders = getRoutingOrderForTask(task, config);
    const isFreeProvider = (p: Provider): boolean =>
      p.tier === "free" ||
      (p.tier === "openrouter" && p.modelId.endsWith(":free"));
    const paid = allProviders.filter((p) => !isFreeProvider(p));
    // Also include OpenRouter paid + direct paid keys not already in routing
    const extra = [
      ...getOpenRouterPaidProviders(config, task),
      ...getAvailableProviders(config).filter((p) => p.tier === "paid"),
    ];
    for (const p of extra) {
      const key = `${p.name}:${p.modelId}`;
      if (!paid.some((x) => `${x.name}:${x.modelId}` === key)) {
        paid.push(p);
      }
    }
    for (const p of paid) {
      tried.add(`${p.name}:${p.modelId}`);
      try {
        console.log(`[CORVYN] Trying ${p.name} (${p.modelId}) [paid]...`);
        const res = await tryProvider(p, parsed, format, ctx(p));
        console.log(`[CORVYN] ✓ ${p.name} | ${p.modelId} | ${task} [paid]`);
        return res;
      } catch (e) { logErr(p, e); }
    }
    return err503(config);
  }

  // ── FREE / AUTO mode ──────────────────────────────────────────────
  const providers = getRoutingOrderForTask(task, config);
  for (const p of providers) {
    if (p.tier === "free") {
      try { if (!hasQuota(db, p)) { console.log(`[CORVYN] ⊘ ${p.name} (${p.modelId}) — quota`); continue; } } catch { continue; }
      if (p.rpm !== undefined && !hasRpmQuota(db, p, p.rpm)) { console.log(`[CORVYN] ⊘ ${p.name} (${p.modelId}) — RPM`); continue; }
      if (p.tpm !== undefined && !hasTpmQuota(db, p, p.tpm)) { console.log(`[CORVYN] ⊘ ${p.name} (${p.modelId}) — TPM`); continue; }
    }
    tried.add(`${p.name}:${p.modelId}`);
    try {
      console.log(`[CORVYN] Trying ${p.name} (${p.modelId})...`);
      const res = await tryProvider(p, parsed, format, ctx(p));
      console.log(`[CORVYN] ✓ ${p.name} | ${p.modelId} | ${task}`);
      incrementQuota(db, p);
      return res;
    } catch (e) { logErr(p, e); }
  }

  // FREE mode: no paid fallback
  if (mode === "free") {
    return new Response(
      JSON.stringify({ error: { message: "All free providers exhausted.", type: "service_unavailable" } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // AUTO mode: fall back to paid (only if budget allows)
  if (!budget.blocked) {
    const paidFallbacks = [
      ...getOpenRouterPaidProviders(config, task).filter((p) => !tried.has(`${p.name}:${p.modelId}`)),
      ...getAvailableProviders(config).filter((p) => p.tier === "paid" && !tried.has(`${p.name}:${p.modelId}`)),
    ];
    if (paidFallbacks.length > 0) {
      console.log(`[CORVYN] Free exhausted, trying paid...`);
      for (const p of paidFallbacks) {
        tried.add(`${p.name}:${p.modelId}`);
        try {
          console.log(`[CORVYN] Trying ${p.name} (${p.modelId}) [paid fallback]...`);
          const res = await tryProvider(p, parsed, format, ctx(p));
          console.log(`[CORVYN] ✓ ${p.name} | ${p.modelId} | ${task} (paid fallback)`);
          return res;
        } catch (e) { logErr(p, e); }
      }
    }
  } else {
    console.log(`[CORVYN] ⊘ Skipping paid fallback — budget exceeded`);
  }

  return err503(config);
}

function logErr(p: Provider, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  const rl = msg.includes("429") || msg.toLowerCase().includes("rate");
  console.error(`[CORVYN] ✗ ${p.name} (${p.modelId}): ${msg.substring(0, 120)}${rl ? " [rate-limited]" : ""}`);
}

function err503(config: CorvynConfig): Response {
  const names = getAvailableProviders(config).map((p) => p.name).join(", ") || "none";
  return new Response(
    JSON.stringify({ error: { message: `All providers exhausted. Configured: ${names}`, type: "service_unavailable" } }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}
