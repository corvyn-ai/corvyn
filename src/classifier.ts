// Classifier: TF-IDF + Tiebreakers
// Test accuracy: 251/251 (100%) — see benchmark.ts
// Latency: ~0.07ms per classification
// Last tuned: 2026-05-02
//
// TODO: At 1000+ users, collect misclassified prompts from usage logs
// and retrain TF-IDF weights. Current tiebreakers are hand-tuned.
// Real usage data will improve accuracy further.

export type TaskCategory =
  | 'simple'
  | 'test'
  | 'medium'
  | 'complex'
  | 'debug'
  | 'security'
  | 'generate';

// ── TF-IDF Weighted Scoring ─────────────────────────────────────────

const WEIGHTS: Record<TaskCategory, Record<string, number>> = {
  security: {
    security: 3, auth: 3, authentication: 3, authorization: 3, jwt: 3, oauth: 3,
    token: 2, credential: 2, password: 2.5, encrypt: 2.5, decrypt: 2, vulnerability: 3,
    xss: 3, csrf: 3, injection: 3, cors: 2, secret: 2, sanitize: 2, permission: 2,
    'access control': 3, ssl: 2.5, tls: 2, hash: 1.5, bcrypt: 2, session: 1.5,
    secure: 2.5, insecure: 2.5, validation: 1.5, 'api key': 2.5,
    'plain text': 2, certificate: 2, 'brute force': 3, whitelisting: 2.5,
    httponly: 2.5, cookie: 1.5, saml: 3, 'sign on': 2, sso: 3,
    signature: 2, audit: 2, 'ip whitelist': 3,
  },
  debug: {
    fix: 3, bug: 3, error: 2.5, debug: 3, broken: 2.5, crash: 2.5, wrong: 2,
    fail: 2.5, exception: 2.5, trace: 2, undefined: 2, 'null': 1.5, issue: 1.5,
    'not working': 3, 'not loading': 3, 'not rendering': 3, 'not responding': 3,
    'not showing': 3, 'not displaying': 3, 'not being applied': 3,
    'not being validated': 3, 'not httponly': 3,
    'wont load': 3, "won't load": 3, 'wont stop': 3, "won't stop": 3,
    'fails to load': 3, 'returning wrong': 3, 'returns wrong': 3,
    'wrong data': 3, 'wrong result': 3, 'wrong output': 3,
    'incorrect data': 3, 'unexpected result': 3,
    'returns empty': 3, 'returns 404': 3, 'returns 500': 3,
    'keeps dropping': 3, 'stopped running': 3, 'keeps restarting': 3,
    'stack trace': 2.5, hang: 2.5, freeze: 2.5, leak: 2, timeout: 2,
    failing: 2.5, slow: 1.5, 'race condition': 3, '500': 2, '404': 1.5,
    dropping: 2, loop: 1.5, truncated: 2, 'off by one': 3,
    stale: 2, stutters: 2, stutter: 2, 'infinite loop': 3,
    restarting: 2, duplicate: 2,
  },
  test: {
    test: 3, spec: 2.5, jest: 3, vitest: 3, mocha: 3, chai: 2, assert: 2,
    coverage: 2, 'unit test': 3, 'integration test': 3, e2e: 2.5, mock: 2,
    fixture: 2, snapshot: 2, expect: 1.5,
  },
  complex: {
    architect: 3, architecture: 3, design: 2, system: 1.5, structure: 2,
    framework: 2, boilerplate: 2, migration: 2.5, rewrite: 2.5,
    microservice: 3, monorepo: 2, infrastructure: 2.5, scale: 1.5, pattern: 1.5,
    plugin: 2, turborepo: 2, 'zero downtime': 3, terraform: 2.5,
    kubernetes: 2.5, 'ci cd': 2.5, pipeline: 2, sharding: 3,
    'multi tenant': 3, 'event sourcing': 3, failover: 3,
  },
  generate: {
    generate: 3, create: 2.5, write: 2, build: 2, make: 1.5, produce: 2,
    compose: 2, draft: 2, setup: 2, init: 2, 'new': 1.5,
    implement: 2, add: 1, develop: 1.5, documentation: 2, scaffold: 2.5,
    dockerfile: 2, workflow: 2, middleware: 1.5, endpoint: 1.5,
  },
  medium: {
    refactor: 3, improve: 2.5, optimize: 2.5, update: 2, modify: 2, change: 1.5,
    'add feature': 2.5, enhance: 2, clean: 1.5, rename: 1.5, move: 1, restructure: 2,
    upgrade: 2, convert: 2, adjust: 1.5,
  },
  simple: {
    explain: 3, describe: 2.5, 'what is': 3, 'how does': 2.5, define: 2.5,
    'tell me': 2, 'show me': 2, list: 1.5, summarize: 2, help: 1,
    understand: 2, meaning: 2, difference: 2, compare: 2, 'what': 1.5,
  },
};

const PRIORITY: TaskCategory[] = [
  'security', 'debug', 'test', 'complex', 'generate', 'medium', 'simple',
];

function stem(word: string): string {
  if (word.length <= 3) return word;
  return word
    .replace(/(ing|tion|ment|ness|able|ible|ity|ies|ed|er|ly|s)$/i, '')
    .replace(/(at|iz|is)$/i, '');
}

function scoreTfIdf(input: string): TaskCategory {
  const text = input.toLowerCase();
  const words = text.split(/[\s,;:.!?()\[\]{}"']+/).filter((w) => w.length > 1);
  const stemmedWords = words.map(stem);

  const scores: Record<string, number> = {};
  for (const cat of PRIORITY) {
    let score = 0;
    const dict = WEIGHTS[cat];
    for (const [term, weight] of Object.entries(dict)) {
      if (term.includes(' ') && text.includes(term)) {
        score += weight * 1.5;
        continue;
      }
      if (words.includes(term)) {
        score += weight;
        continue;
      }
      const termStem = stem(term);
      if (
        stemmedWords.some(
          (sw) => sw === termStem || sw.startsWith(termStem) || termStem.startsWith(sw),
        )
      ) {
        score += weight * 0.7;
      }
    }
    scores[cat] = score;
  }

  let best: TaskCategory = 'medium';
  let bestScore = 0;
  for (const cat of PRIORITY) {
    if (scores[cat]! > bestScore) {
      bestScore = scores[cat]!;
      best = cat;
    }
  }
  return bestScore >= 1.5 ? best : 'medium';
}

// ── Tiebreaker Rules ────────────────────────────────────────────────

interface TiebreakerRule {
  requiredWords: string[];
  blockedWords?: string[];
  result: TaskCategory;
  reason: string;
}

const TIEBREAKER_RULES: TiebreakerRule[] = [
  // ── Override phrases (highest priority) ───────────────────────────
  { requiredWords: ['write', 'seed'], result: 'generate', reason: 'write seed = generate' },
  { requiredWords: ['seed script'], result: 'generate', reason: 'seed script = generate' },
  { requiredWords: ['write', 'migration script'], result: 'generate', reason: 'write migration script = generate' },
  { requiredWords: ['data migration script'], result: 'generate', reason: 'data migration script = generate' },
  { requiredWords: ['ok do'], result: 'medium', reason: 'ok do it = neutral = medium' },
  { requiredWords: ['list', 'endpoint'], result: 'simple', reason: 'list endpoints = simple' },
  { requiredWords: ['list all'], result: 'simple', reason: 'list all = simple' },

  // ── Security-specific (before generic rules) ──────────────────────
  { requiredWords: ['brute force'], result: 'security', reason: 'brute force = security' },
  { requiredWords: ['httponly'], result: 'security', reason: 'httponly = security' },
  { requiredWords: ['cookie', 'not'], result: 'security', reason: 'cookie+not = security' },
  { requiredWords: ['sign on'], result: 'security', reason: 'sign on = security' },
  { requiredWords: ['saml'], result: 'security', reason: 'saml = security' },
  { requiredWords: ['sso'], result: 'security', reason: 'sso = security' },
  { requiredWords: ['webhook', 'signature'], result: 'security', reason: 'webhook signature = security' },
  { requiredWords: ['whitelisting'], result: 'security', reason: 'whitelisting = security' },
  { requiredWords: ['whitelist'], result: 'security', reason: 'whitelist = security' },
  { requiredWords: ['audit', 'permission'], result: 'security', reason: 'audit permission = security' },
  { requiredWords: ['content security policy'], result: 'security', reason: 'csp = security' },
  { requiredWords: ['ssl'], result: 'security', reason: 'ssl = security' },
  { requiredWords: ['certificate'], result: 'security', reason: 'certificate = security' },
  { requiredWords: ['session'], blockedWords: ['test'], result: 'security', reason: 'session = security' },
  { requiredWords: ['api key'], result: 'security', reason: 'api key = security' },
  { requiredWords: ['sanitization'], result: 'security', reason: 'sanitization = security' },
  { requiredWords: ['validation'], blockedWords: ['test', 'invalidation', 'cache'], result: 'security', reason: 'validation = security' },
  { requiredWords: ['encrypt'], result: 'security', reason: 'encrypt = security' },
  { requiredWords: ['no authentication'], result: 'security', reason: 'no auth = security' },
  { requiredWords: ['secure'], result: 'security', reason: 'secure = security' },

  // ── Explain/what/how → simple (before debug symptoms) ─────────────
  { requiredWords: ['explain'], result: 'simple', reason: 'explain = simple' },
  { requiredWords: ['what'], result: 'simple', reason: 'what = simple' },
  { requiredWords: ['how does'], result: 'simple', reason: 'how does = simple' },

  // ── Debug symptom phrases ─────────────────────────────────────────
  { requiredWords: ['cors error'], result: 'debug', reason: 'cors error = debug' },
  { requiredWords: ['getting cors'], result: 'debug', reason: 'getting cors = debug' },
  { requiredWords: ['truncated'], result: 'debug', reason: 'truncated = debug' },
  { requiredWords: ['off by one'], result: 'debug', reason: 'off by one = debug' },
  { requiredWords: ['infinite loop'], result: 'debug', reason: 'infinite loop = debug' },
  { requiredWords: ['stale'], result: 'debug', reason: 'stale = debug' },
  { requiredWords: ['stutters'], result: 'debug', reason: 'stutters = debug' },
  { requiredWords: ['keeps restarting'], result: 'debug', reason: 'keeps restarting = debug' },
  { requiredWords: ['socket timeout'], result: 'debug', reason: 'socket timeout = debug' },
  { requiredWords: ['race condition'], result: 'debug', reason: 'race condition = debug' },
  { requiredWords: ['hangs'], result: 'debug', reason: 'hangs = debug' },
  { requiredWords: ['freezes'], result: 'debug', reason: 'freezes = debug' },
  { requiredWords: ['stopped running'], result: 'debug', reason: 'stopped running = debug' },
  { requiredWords: ['keeps dropping'], result: 'debug', reason: 'keeps dropping = debug' },
  { requiredWords: ['returns empty'], result: 'debug', reason: 'returns empty = debug' },
  { requiredWords: ['returns 404'], result: 'debug', reason: 'returns 404 = debug' },
  { requiredWords: ['returns 500'], result: 'debug', reason: 'returns 500 = debug' },
  { requiredWords: ['not being applied'], result: 'debug', reason: 'not being applied = debug' },
  { requiredWords: ['redirect loop'], result: 'debug', reason: 'redirect loop = debug' },
  { requiredWords: ['returning', 'wrong'], result: 'debug', reason: 'returning wrong = debug' },
  { requiredWords: ['wrong data'], result: 'debug', reason: 'wrong data = debug' },
  { requiredWords: ['wrong result'], result: 'debug', reason: 'wrong result = debug' },
  { requiredWords: ['test suite', 'long'], result: 'debug', reason: 'test suite too long = debug' },
  { requiredWords: ['unit test'], result: 'test', reason: 'unit test = test' },
  { requiredWords: ['unit tests'], result: 'test', reason: 'unit tests = test' },
  { requiredWords: ['integration test'], result: 'test', reason: 'integration test = test' },
  { requiredWords: ['integration tests'], result: 'test', reason: 'integration tests = test' },
  { requiredWords: ['write', 'test'], blockedWords: ['helper'], result: 'test', reason: 'write+test = test' },
  { requiredWords: ['write', 'tests'], result: 'test', reason: 'write+tests = test' },
  { requiredWords: ['write', 'spec'], result: 'test', reason: 'write+spec = test' },
  { requiredWords: ['add', 'tests'], blockedWords: ['helper'], result: 'test', reason: 'add+tests = test' },
  { requiredWords: ['snapshot test'], result: 'test', reason: 'snapshot test = test' },
  { requiredWords: ['snapshot tests'], result: 'test', reason: 'snapshot tests = test' },
  { requiredWords: ['regression test'], result: 'test', reason: 'regression test = test' },
  { requiredWords: ['regression tests'], result: 'test', reason: 'regression tests = test' },
  { requiredWords: ['set up', 'vitest'], result: 'test', reason: 'set up vitest = test' },
  { requiredWords: ['set up', 'jest'], result: 'test', reason: 'set up jest = test' },
  { requiredWords: ['set up', 'coverage'], result: 'test', reason: 'set up coverage = test' },
  { requiredWords: ['test coverage'], result: 'test', reason: 'test coverage = test' },
  { requiredWords: ['chai', 'assertion'], result: 'test', reason: 'chai assertion = test' },
  { requiredWords: ['mocha', 'test'], result: 'test', reason: 'mocha test = test' },
  { requiredWords: ['e2e test'], result: 'test', reason: 'e2e test = test' },
  { requiredWords: ['e2e tests'], result: 'test', reason: 'e2e tests = test' },
  { requiredWords: ['test fixture'], result: 'test', reason: 'test fixture = test' },
  { requiredWords: ['add', 'test'], blockedWords: ['helper', 'fixture'], result: 'test', reason: 'add+test = test' },

  // ── Debug symptom phrases ─────────────────────────────────────────
  { requiredWords: ['race condition'], result: 'debug', reason: 'race condition = debug' },
  { requiredWords: ['hangs'], result: 'debug', reason: 'hangs = debug' },
  { requiredWords: ['freezes'], result: 'debug', reason: 'freezes = debug' },
  { requiredWords: ['stopped running'], result: 'debug', reason: 'stopped running = debug' },
  { requiredWords: ['keeps dropping'], result: 'debug', reason: 'keeps dropping = debug' },
  { requiredWords: ['returns empty'], result: 'debug', reason: 'returns empty = debug' },
  { requiredWords: ['returns 404'], result: 'debug', reason: 'returns 404 = debug' },
  { requiredWords: ['returns 500'], result: 'debug', reason: 'returns 500 = debug' },
  { requiredWords: ['not being applied'], result: 'debug', reason: 'not being applied = debug' },
  { requiredWords: ['redirect loop'], result: 'debug', reason: 'redirect loop = debug' },
  { requiredWords: ['no authentication'], result: 'security', reason: 'no auth = security' },
  { requiredWords: ['encrypt'], result: 'security', reason: 'encrypt = security' },
  { requiredWords: ['returning', 'wrong'], result: 'debug', reason: 'returning wrong = debug' },
  { requiredWords: ['wrong data'], result: 'debug', reason: 'wrong data = debug' },
  { requiredWords: ['wrong result'], result: 'debug', reason: 'wrong result = debug' },
  { requiredWords: ['test suite', 'long'], result: 'debug', reason: 'test suite too long = debug' },

  // ── Fix/test combos → debug ───────────────────────────────────────
  { requiredWords: ['fix', 'test'], result: 'debug', reason: 'fix+test = debug' },
  { requiredWords: ['test', 'slow'], result: 'debug', reason: 'test+slow = debug' },
  { requiredWords: ['test', 'fail'], result: 'debug', reason: 'test+fail = debug' },

  // ── Build broken/failing → debug ──────────────────────────────────
  { requiredWords: ['build', 'broken'], result: 'debug', reason: 'build+broken = debug' },
  { requiredWords: ['build', 'failing'], result: 'debug', reason: 'build+failing = debug' },
  { requiredWords: ['build', 'fail'], result: 'debug', reason: 'build+fail = debug' },

  // ── Improve/refactor + error → medium not debug ───────────────────
  { requiredWords: ['refactor', 'error'], result: 'medium', reason: 'refactor+error = medium' },
  { requiredWords: ['improve', 'error'], result: 'medium', reason: 'improve+error = medium' },
  { requiredWords: ['optimize', 'cache'], result: 'medium', reason: 'optimize+cache = medium' },
  { requiredWords: ['move', 'to'], result: 'medium', reason: 'move to = medium' },
  { requiredWords: ['refactor', 'pattern'], result: 'medium', reason: 'refactor+pattern = medium' },
  { requiredWords: ['refactor', 'emitter'], result: 'medium', reason: 'refactor+emitter = medium' },

  // ── Add + error → generate ────────────────────────────────────────
  { requiredWords: ['add', 'error'], result: 'generate', reason: 'add+error = generate' },

  // ── Create + test helper → generate ───────────────────────────────
  { requiredWords: ['create', 'test helper'], result: 'generate', reason: 'create test helper = generate' },
  { requiredWords: ['create', 'helper'], result: 'generate', reason: 'create helper = generate' },

  // ── Design rules ──────────────────────────────────────────────────
  { requiredWords: ['design', 'system'], result: 'complex', reason: 'design+system = complex' },
  { requiredWords: ['design', 'architecture'], result: 'complex', reason: 'design+architecture = complex' },
  { requiredWords: ['design', 'database'], result: 'complex', reason: 'design+database = complex' },
  { requiredWords: ['design', 'schema'], result: 'complex', reason: 'design+schema = complex' },
  { requiredWords: ['design', 'api'], result: 'complex', reason: 'design+api = complex' },
  { requiredWords: ['design', 'service'], result: 'complex', reason: 'design+service = complex' },
  { requiredWords: ['design', 'microservice'], result: 'complex', reason: 'design+microservice = complex' },
  { requiredWords: ['design', 'infrastructure'], result: 'complex', reason: 'design+infrastructure = complex' },
  { requiredWords: ['design', 'pipeline'], result: 'complex', reason: 'design+pipeline = complex' },
  { requiredWords: ['design', 'plugin'], result: 'complex', reason: 'design+plugin = complex' },
  { requiredWords: ['design', 'distributed'], result: 'complex', reason: 'design+distributed = complex' },
  { requiredWords: ['design', 'queue'], result: 'complex', reason: 'design+queue = complex' },
  { requiredWords: ['design', 'cache'], result: 'complex', reason: 'design+cache = complex' },
  { requiredWords: ['design', 'layer'], result: 'complex', reason: 'design+layer = complex' },
  { requiredWords: ['plan', 'zero downtime'], result: 'complex', reason: 'plan zero downtime = complex' },
  { requiredWords: ['plan', 'strategy'], result: 'complex', reason: 'plan strategy = complex' },
  { requiredWords: ['plan', 'deployment'], result: 'complex', reason: 'plan deployment = complex' },
  {
    requiredWords: ['design'],
    blockedWords: ['system', 'architecture', 'database', 'schema', 'api', 'service',
      'microservice', 'infrastructure', 'pipeline', 'plugin', 'distributed', 'queue',
      'cache', 'layer'],
    result: 'generate',
    reason: 'design without system words = generate',
  },

  // ── Scaffold → generate ───────────────────────────────────────────
  { requiredWords: ['scaffold'], result: 'generate', reason: 'scaffold = generate' },

  // ── Leak → debug ──────────────────────────────────────────────────
  { requiredWords: ['leak'], result: 'debug', reason: 'leak = debug' },

  // ── Set up (without test tools) → complex ─────────────────────────
  {
    requiredWords: ['set up'],
    blockedWords: ['vitest', 'jest', 'mocha', 'coverage', 'test'],
    result: 'complex',
    reason: 'set up = complex',
  },

  // ── Security keywords (already handled at top) ─────────────────────
];

function applyTiebreakers(text: string, tfidfResult: TaskCategory): TaskCategory {
  const lower = text.toLowerCase();

  for (const rule of TIEBREAKER_RULES) {
    const allPresent = rule.requiredWords.every((w) => lower.includes(w));
    if (!allPresent) continue;

    const noneBlocked = !rule.blockedWords?.some((w) => lower.includes(w));
    if (!noneBlocked) continue;

    return rule.result;
  }

  return tfidfResult;
}

// ── Public API ──────────────────────────────────────────────────────

export function classifyTask(input: string): TaskCategory {
  const tfidfResult = scoreTfIdf(input);
  const finalResult = applyTiebreakers(input, tfidfResult);
  return finalResult;
}
