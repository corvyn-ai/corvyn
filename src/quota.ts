import type { Database } from 'bun:sqlite';
import type { Provider } from './providers';

export interface QuotaInfo {
  provider: string;
  requestsToday: number;
  requestsLimit: number;
  remaining: number;
  lastReset: string;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0]!;
}

function getStartOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Quota operations ────────────────────────────────────────────────

function resetIfNeeded(db: Database, provider: Provider): void {
  const today = getToday();
  const key = providerKey(provider);

  const row = db
    .prepare('SELECT last_reset FROM quota_state WHERE provider = ?')
    .get(key) as { last_reset: string } | undefined;

  if (!row) {
    const now = new Date().toISOString();
    const limit = provider.rpd ?? 999999;
    db.prepare(
      'INSERT INTO quota_state (provider, requests_today, requests_limit, last_reset, updated_at) VALUES (?, 0, ?, ?, ?)'
    ).run(key, limit, today, now);
    return;
  }

  if (row.last_reset !== today) {
    const limit = provider.rpd ?? 999999;
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE quota_state SET requests_today = 0, requests_limit = ?, last_reset = ?, updated_at = ? WHERE provider = ?'
    ).run(limit, today, now, key);
  }
}

function providerKey(provider: Provider): string {
  if (provider.tier === 'openrouter' && provider.modelId) {
    return `openrouter:${provider.modelId}`;
  }
  return provider.name.toLowerCase();
}

export function hasQuota(db: Database, provider: Provider): boolean {
  if (provider.tier === 'local') {
    return true;
  }

  if (provider.tier === 'paid') {
    return true;
  }

  if (provider.tier === 'openrouter') {
    return true;
  }

  if (provider.rpd !== undefined) {
    resetIfNeeded(db, provider);

    const key = providerKey(provider);
    const row = db
      .prepare('SELECT requests_today, requests_limit FROM quota_state WHERE provider = ?')
      .get(key) as { requests_today: number; requests_limit: number } | undefined;

    if (!row) {
      return true;
    }

    return row.requests_today < row.requests_limit;
  }

  return true;
}

export function hasRpmQuota(
  db: Database,
  provider: Provider,
  rpmLimit: number
): boolean {
  if (rpmLimit === undefined || rpmLimit === 0) {
    return true;
  }

  const key = providerKey(provider);
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

  const row = db
    .prepare(
      'SELECT COUNT(*) as count FROM requests WHERE provider_used = ? AND timestamp > ?'
    )
    .get(key, oneMinuteAgo) as { count: number } | undefined;

  if (!row) {
    return true;
  }

  return row.count < rpmLimit;
}

export function hasTpmQuota(
  db: Database,
  provider: Provider,
  tpmLimit: number
): boolean {
  if (tpmLimit === undefined || tpmLimit === 0) {
    return true;
  }

  const key = providerKey(provider);
  const monthStart = getStartOfMonth();

  const row = db
    .prepare(
      'SELECT COALESCE(SUM(tokens_input + tokens_output), 0) as total FROM requests WHERE provider_used = ? AND timestamp > ?'
    )
    .get(key, monthStart) as { total: number } | undefined;

  if (!row) {
    return true;
  }

  return row.total < tpmLimit;
}

export function incrementQuota(db: Database, provider: Provider): void {
  if (provider.tier === 'local') {
    return;
  }

  if (provider.tier === 'openrouter') {
    return;
  }

  if (provider.tier === 'paid') {
    return;
  }

  if (provider.rpd !== undefined) {
    resetIfNeeded(db, provider);
    const key = providerKey(provider);
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE quota_state SET requests_today = requests_today + 1, updated_at = ? WHERE provider = ?'
    ).run(now, key);
  }
}

export function getQuotaStatus(db: Database): QuotaInfo[] {
  const rows = db
    .prepare(
      'SELECT provider, requests_today, requests_limit, last_reset FROM quota_state'
    )
    .all() as Array<{
      provider: string;
      requests_today: number;
      requests_limit: number;
      last_reset: string;
    }>;

  return rows.map((row) => ({
    provider: row.provider,
    requestsToday: row.requests_today,
    requestsLimit: row.requests_limit,
    remaining: Math.max(0, row.requests_limit - row.requests_today),
    lastReset: row.last_reset,
  }));
}

// ── Daily stats ─────────────────────────────────────────────────────

export function getTodayStats(db: Database): {
  totalRequests: number;
  freeRequests: number;
  localRequests: number;
  paidRequests: number;
  costUsd: number;
  costLocal: number;
  savedLocal: number;
  currencyCode: string;
} {
  const today = getToday();
  const row = db
    .prepare(
      'SELECT total_requests, free_requests, local_requests, paid_requests, cost_usd, cost_local, saved_local, currency_code FROM daily_stats WHERE date = ?'
    )
    .get(today) as
    | {
        total_requests: number;
        free_requests: number;
        local_requests: number;
        paid_requests: number;
        cost_usd: number;
        cost_local: number;
        saved_local: number;
        currency_code: string;
      }
    | undefined;

  if (!row) {
    return {
      totalRequests: 0,
      freeRequests: 0,
      localRequests: 0,
      paidRequests: 0,
      costUsd: 0,
      costLocal: 0,
      savedLocal: 0,
      currencyCode: 'USD',
    };
  }

  return {
    totalRequests: row.total_requests,
    freeRequests: row.free_requests,
    localRequests: row.local_requests,
    paidRequests: row.paid_requests,
    costUsd: row.cost_usd,
    costLocal: row.cost_local,
    savedLocal: row.saved_local,
    currencyCode: row.currency_code,
  };
}

// ── Record request ──────────────────────────────────────────────────

export interface BudgetStatus {
  dailySpend: number;
  weeklySpend: number;
  monthlySpend: number;
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  dailyExceeded: boolean;
  weeklyExceeded: boolean;
  monthlyExceeded: boolean;
  blocked: boolean;
}

function getStartOfWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return monday.toISOString().split('T')[0]!;
}

export function checkBudget(
  db: Database,
  dailyLimit: number,
  weeklyLimit: number,
  monthlyLimit: number,
): BudgetStatus {
  const today = getToday();
  const weekStart = getStartOfWeek();
  const monthStart = getStartOfMonth();

  // Budget limits are in local currency, so compare against cost_local
  const dailyRow = db
    .prepare('SELECT COALESCE(SUM(cost_local), 0) as total FROM daily_stats WHERE date = ?')
    .get(today) as { total: number } | undefined;
  const dailySpend = dailyRow?.total ?? 0;

  const weeklyRow = db
    .prepare('SELECT COALESCE(SUM(cost_local), 0) as total FROM daily_stats WHERE date >= ?')
    .get(weekStart) as { total: number } | undefined;
  const weeklySpend = weeklyRow?.total ?? 0;

  const monthlyRow = db
    .prepare('SELECT COALESCE(SUM(cost_local), 0) as total FROM daily_stats WHERE date >= ?')
    .get(monthStart) as { total: number } | undefined;
  const monthlySpend = monthlyRow?.total ?? 0;

  const dailyExceeded = dailyLimit > 0 && dailySpend >= dailyLimit;
  const weeklyExceeded = weeklyLimit > 0 && weeklySpend >= weeklyLimit;
  const monthlyExceeded = monthlyLimit > 0 && monthlySpend >= monthlyLimit;

  return {
    dailySpend,
    weeklySpend,
    monthlySpend,
    dailyLimit,
    weeklyLimit,
    monthlyLimit,
    dailyExceeded,
    weeklyExceeded,
    monthlyExceeded,
    blocked: dailyExceeded || weeklyExceeded || monthlyExceeded,
  };
}

export function recordRequest(
  db: Database,
  data: {
    timestamp: string;
    taskCategory: string;
    providerUsed: string;
    modelUsed: string;
    providerTier: string;
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
    costLocal: number;
    savedUsd: number;
    currencyCode: string;
    latencyMs: number;
  }
): void {
  db.prepare(
    `INSERT INTO requests (timestamp, task_category, provider_used, model_used, provider_tier, tokens_input, tokens_output, cost_usd, cost_local, saved_usd, currency_code, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.timestamp,
    data.taskCategory,
    data.providerUsed,
    data.modelUsed,
    data.providerTier,
    data.tokensInput,
    data.tokensOutput,
    data.costUsd,
    data.costLocal,
    data.savedUsd,
    data.currencyCode,
    data.latencyMs
  );

  const today = data.timestamp.split('T')[0]!;

  const tierFlag =
    data.providerTier === 'free'
      ? 'free'
      : data.providerTier === 'local'
        ? 'local'
        : data.providerTier === 'openrouter'
          ? (data.modelUsed.endsWith(':free') ? 'free' : 'paid')
          : 'paid';

  const existing = db
    .prepare('SELECT date FROM daily_stats WHERE date = ?')
    .get(today) as { date: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE daily_stats SET
        total_requests = total_requests + 1,
        free_requests = free_requests + ?,
        local_requests = local_requests + ?,
        paid_requests = paid_requests + ?,
        cost_usd = cost_usd + ?,
        cost_local = cost_local + ?,
        saved_local = saved_local + ?
       WHERE date = ?`
    ).run(
      tierFlag === 'free' ? 1 : 0,
      tierFlag === 'local' ? 1 : 0,
      tierFlag === 'paid' ? 1 : 0,
      data.costUsd,
      data.costLocal,
      data.savedUsd,
      today
    );
  } else {
    db.prepare(
      `INSERT INTO daily_stats (date, total_requests, free_requests, local_requests, paid_requests, cost_usd, cost_local, saved_local, currency_code)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      today,
      tierFlag === 'free' ? 1 : 0,
      tierFlag === 'local' ? 1 : 0,
      tierFlag === 'paid' ? 1 : 0,
      data.costUsd,
      data.costLocal,
      data.savedUsd,
      data.currencyCode
    );
  }
}
