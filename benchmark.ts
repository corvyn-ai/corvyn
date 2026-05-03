import { classifyTask } from "./src/classifier";

const TESTS: [string, string][] = [
  // ══════════════════════════════════════
  // SECURITY (40 cases)
  // ══════════════════════════════════════
  ["check into security vulnerabilities", "security"],
  ["add password hashing", "security"],
  ["add jwt auth to the API", "security"],
  ["review the access control logic", "security"],
  ["implement oauth2 login flow", "security"],
  ["the api has no authentication", "security"],
  ["encrypt user data at rest", "security"],
  ["sanitize user input to prevent xss", "security"],
  ["add csrf protection to forms", "security"],
  ["store secrets in env variables", "security"],
  ["make this code more secure", "security"],
  ["test the security of the api", "security"],
  ["add role based access control", "security"],
  ["implement two factor authentication", "security"],
  ["the token is expired", "security"],
  ["add api key validation", "security"],
  ["prevent sql injection attacks", "security"],
  ["set up ssl certificates", "security"],
  ["hash the passwords with bcrypt", "security"],
  ["add cors headers to the api", "security"],
  ["the session is not being validated", "security"],
  ["implement rate limiting for auth endpoints", "security"],
  ["add input sanitization middleware", "security"],
  ["credentials are stored in plain text", "security"],
  ["configure oauth scopes for github login", "security"],
  ["rotate the api keys", "security"],
  ["add helmet middleware for security headers", "security"],
  ["the jwt secret is hardcoded", "security"],
  ["implement password reset flow", "security"],
  ["add brute force protection to login", "security"],
  ["audit the permissions model", "security"],
  ["users can access other users data", "security"],
  ["add encryption for sensitive fields", "security"],
  ["implement single sign on with saml", "security"],
  ["the cookie is not httponly", "security"],
  ["add content security policy headers", "security"],
  ["validate the webhook signature", "security"],
  ["implement oauth token refresh", "security"],
  ["the password policy is too weak", "security"],
  ["add ip whitelisting for admin routes", "security"],

  // ══════════════════════════════════════
  // DEBUG (40 cases)
  // ══════════════════════════════════════
  ["fix the login bug", "debug"],
  ["debug the streaming issue", "debug"],
  ["fix undefined error in router", "debug"],
  ["this test is failing", "debug"],
  ["app crashes on startup", "debug"],
  ["getting null pointer exception", "debug"],
  ["the page is not loading", "debug"],
  ["memory leak in the worker", "debug"],
  ["why is this returning wrong data", "debug"],
  ["TypeError cannot read property of undefined", "debug"],
  ["the build is broken", "debug"],
  ["fix the test runner", "debug"],
  ["check why tests are slow", "debug"],
  ["the server hangs after 10 requests", "debug"],
  ["getting 500 internal server error", "debug"],
  ["the websocket connection keeps dropping", "debug"],
  ["images are not displaying on mobile", "debug"],
  ["the form submission is not working", "debug"],
  ["database query returns empty results", "debug"],
  ["the cron job stopped running", "debug"],
  ["css styles are not being applied", "debug"],
  ["the redirect loop wont stop", "debug"],
  ["api returns 404 for existing resource", "debug"],
  ["the app freezes when uploading large files", "debug"],
  ["race condition in the payment handler", "debug"],
  ["the docker container keeps restarting", "debug"],
  ["hot reload is not working anymore", "debug"],
  ["the api response is truncated", "debug"],
  ["getting CORS error in the browser", "debug"],
  ["the pagination is off by one", "debug"],
  ["socket timeout after upgrade", "debug"],
  ["the env variables are not being loaded", "debug"],
  ["infinite loop in the recursive function", "debug"],
  ["the date is showing in wrong timezone", "debug"],
  ["file upload fails for files over 5mb", "debug"],
  ["the search returns duplicate results", "debug"],
  ["npm install fails with peer dependency error", "debug"],
  ["the middleware is not being called", "debug"],
  ["state is stale after navigation", "debug"],
  ["the animation stutters on scroll", "debug"],
  ["graphql resolver returns null unexpectedly", "debug"],

  // ══════════════════════════════════════
  // TEST (30 cases)
  // ══════════════════════════════════════
  ["write tests for the router", "test"],
  ["add unit tests for auth module", "test"],
  ["increase test coverage to 80%", "test"],
  ["mock the database in tests", "test"],
  ["the jest snapshot is outdated", "test"],
  ["add e2e tests for checkout flow", "test"],
  ["write integration tests", "test"],
  ["add test fixtures for user data", "test"],
  ["set up vitest for the project", "test"],
  ["write a test for the payment service", "test"],
  ["add mocha tests for the cli", "test"],
  ["the test suite takes too long", "debug"],
  ["mock the external api in tests", "test"],
  ["add snapshot tests for components", "test"],
  ["write regression tests for the bug", "test"],
  ["test the edge cases for date parsing", "test"],
  ["add chai assertions to the test", "test"],
  ["set up test coverage reporting", "test"],
  ["write spec for the new feature", "test"],
  ["add integration tests for the webhook", "test"],
  ["write smoke tests for deployment", "test"],
  ["add load tests with k6", "test"],
  ["test the api with supertest", "test"],
  ["write contract tests for the microservice", "test"],
  ["add visual regression tests", "test"],
  ["test the error boundary component", "test"],
  ["write tests for the custom hook", "test"],
  ["add playwright tests for the login flow", "test"],
  ["test the websocket reconnection logic", "test"],
  ["write property based tests with fast check", "test"],

  // ══════════════════════════════════════
  // COMPLEX (25 cases)
  // ══════════════════════════════════════
  ["architect a new microservice", "complex"],
  ["design a plugin system", "complex"],
  ["plan the database migration strategy", "complex"],
  ["rewrite the app from scratch", "complex"],
  ["design the system architecture", "complex"],
  ["set up monorepo with turborepo", "complex"],
  ["design a caching layer for the api", "complex"],
  ["plan the migration from mysql to postgres", "complex"],
  ["architect the event driven system", "complex"],
  ["design the data pipeline architecture", "complex"],
  ["set up kubernetes cluster for deployment", "complex"],
  ["plan the microservices communication pattern", "complex"],
  ["design a distributed task queue", "complex"],
  ["rewrite the legacy monolith", "complex"],
  ["architect the real time notification system", "complex"],
  ["design the database sharding strategy", "complex"],
  ["plan the multi tenant architecture", "complex"],
  ["set up ci cd pipeline with github actions", "complex"],
  ["design the api gateway pattern", "complex"],
  ["architect the message broker system", "complex"],
  ["plan the zero downtime deployment strategy", "complex"],
  ["design the event sourcing architecture", "complex"],
  ["set up infrastructure as code with terraform", "complex"],
  ["architect the search indexing pipeline", "complex"],
  ["design the multi region failover system", "complex"],

  // ══════════════════════════════════════
  // GENERATE (40 cases)
  // ══════════════════════════════════════
  ["build a portfolio page", "generate"],
  ["create a new API endpoint", "generate"],
  ["implement rate limiting", "generate"],
  ["scaffold a new project", "generate"],
  ["write a python fibonacci function", "generate"],
  ["create a docker compose file", "generate"],
  ["make a landing page", "generate"],
  ["build a todo app", "generate"],
  ["generate a pdf report", "generate"],
  ["write a bash script to deploy", "generate"],
  ["add error logging", "generate"],
  ["create a test helper", "generate"],
  ["design a new error page", "generate"],
  ["write documentation for the api", "generate"],
  ["create a new react component", "generate"],
  ["build a cli tool for migrations", "generate"],
  ["write a github actions workflow", "generate"],
  ["create a dockerfile for the app", "generate"],
  ["implement a search feature", "generate"],
  ["build a dashboard with charts", "generate"],
  ["write a cron job to clean old data", "generate"],
  ["create a middleware for logging", "generate"],
  ["implement file upload endpoint", "generate"],
  ["build a websocket chat server", "generate"],
  ["write a seed script for the database", "generate"],
  ["create a graphql schema", "generate"],
  ["build a notification service", "generate"],
  ["write a data migration script", "generate"],
  ["create an admin panel", "generate"],
  ["implement pagination for the api", "generate"],
  ["build a form builder component", "generate"],
  ["write a webhook handler", "generate"],
  ["create a rate limiter middleware", "generate"],
  ["implement dark mode toggle", "generate"],
  ["build an image gallery component", "generate"],
  ["write a csv export function", "generate"],
  ["create a breadcrumb component", "generate"],
  ["implement drag and drop sorting", "generate"],
  ["build a markdown editor", "generate"],
  ["write a retry wrapper for fetch", "generate"],

  // ══════════════════════════════════════
  // MEDIUM (35 cases)
  // ══════════════════════════════════════
  ["optimize the database queries", "medium"],
  ["refactor error handling", "medium"],
  ["update the dependencies", "medium"],
  ["clean up the codebase", "medium"],
  ["rename the user service", "medium"],
  ["convert class components to hooks", "medium"],
  ["improve the loading performance", "medium"],
  ["upgrade from node 18 to 20", "medium"],
  ["refactor the api response format", "medium"],
  ["optimize the bundle size", "medium"],
  ["move the utils to a shared package", "medium"],
  ["clean up unused imports", "medium"],
  ["improve the error messages", "medium"],
  ["update the eslint config", "medium"],
  ["refactor the database connection pool", "medium"],
  ["optimize image loading with lazy load", "medium"],
  ["restructure the project folders", "medium"],
  ["convert callbacks to async await", "medium"],
  ["upgrade the react version", "medium"],
  ["improve the api response time", "medium"],
  ["refactor the state management", "medium"],
  ["optimize the docker image size", "medium"],
  ["update the typescript config", "medium"],
  ["improve the logging format", "medium"],
  ["refactor the routing logic", "medium"],
  ["optimize the sql queries with indexes", "medium"],
  ["clean up the test utilities", "medium"],
  ["update the readme", "medium"],
  ["improve the dx with better types", "medium"],
  ["refactor the middleware chain", "medium"],
  ["optimize the cache invalidation", "medium"],
  ["convert the config to yaml", "medium"],
  ["improve the ci build speed", "medium"],
  ["update the api versioning scheme", "medium"],
  ["refactor the event emitter pattern", "medium"],

  // ══════════════════════════════════════
  // SIMPLE (30 cases)
  // ══════════════════════════════════════
  ["explain how cors works", "simple"],
  ["what is a promise", "simple"],
  ["how does the router work", "simple"],
  ["what is the difference between let and const", "simple"],
  ["describe the project structure", "simple"],
  ["list all api endpoints", "simple"],
  ["show me the config file", "simple"],
  ["explain the authentication flow", "simple"],
  ["what does this regex do", "simple"],
  ["how does the caching work", "simple"],
  ["what is the purpose of this middleware", "simple"],
  ["describe how the build process works", "simple"],
  ["explain the difference between sql and nosql", "simple"],
  ["what are the environment variables needed", "simple"],
  ["how does the deployment pipeline work", "simple"],
  ["explain how websockets work", "simple"],
  ["what is the event loop", "simple"],
  ["how does garbage collection work", "simple"],
  ["what is a closure in javascript", "simple"],
  ["explain the pub sub pattern", "simple"],
  ["what is the difference between http and https", "simple"],
  ["describe the folder structure", "simple"],
  ["how does the orm map to the database", "simple"],
  ["what is dependency injection", "simple"],
  ["explain how jwt tokens work", "simple"],
  ["what is the difference between rest and graphql", "simple"],
  ["how does the load balancer distribute traffic", "simple"],
  ["what is a race condition", "simple"],
  ["explain the observer pattern", "simple"],
  ["what is tree shaking", "simple"],

  // ══════════════════════════════════════
  // NEUTRAL / AMBIGUOUS (10 cases)
  // ══════════════════════════════════════
  ["hello world", "medium"],
  ["hey", "medium"],
  ["thanks", "medium"],
  ["ok do it", "medium"],
  ["continue", "medium"],
  ["yes", "medium"],
  ["sounds good", "medium"],
  ["go ahead", "medium"],
  ["please proceed", "medium"],
  ["lgtm", "medium"],
];

// ── Old keyword classifier ──────────────────────────────────────────

const OLD_KW: Record<string, string[]> = {
  security: ['security', 'auth', 'permission', 'access control', 'oauth', 'jwt', 'token', 'credential', 'vulnerability', 'xss', 'csrf', 'injection', 'encrypt', 'password', 'secret', 'cors', 'sanitize', 'validate input'],
  test: ['test', 'spec', 'jest', 'vitest', 'mocha', 'chai', 'unit test', 'integration test', 'coverage', 'assert'],
  debug: ['fix', 'bug', 'error', 'debug', 'broken', 'crash', 'not working', 'issue', 'wrong', 'fail', 'undefined', 'null', 'exception', 'stack trace'],
  complex: ['architect', 'design', 'system', 'structure', 'framework', 'scaffold', 'boilerplate', 'migration', 'rewrite'],
  generate: ['generate', 'create', 'write', 'build', 'make', 'produce', 'compose', 'draft', 'scaffold', 'setup', 'init', 'new'],
  medium: ['refactor', 'improve', 'optimize', 'update', 'modify', 'change', 'add feature', 'implement', 'add'],
  simple: ['explain', 'describe', 'what is', 'how does', 'define', 'tell me', 'show me', 'list', 'summarize'],
};
const OLD_PRI = ['security', 'test', 'debug', 'complex', 'generate', 'medium', 'simple'];
function oldClassify(input: string): string {
  const t = input.toLowerCase();
  for (const c of OLD_PRI) { for (const k of OLD_KW[c]!) { if (t.includes(k)) return c; } }
  return 'medium';
}

// ── Run ─────────────────────────────────────────────────────────────

console.log("");
console.log("TASK".padEnd(48) + "EXPECTED".padEnd(12) + "OLD-KW".padEnd(14) + "TF-IDF+TB");
console.log("─".repeat(88));

let kwOk = 0, tfOk = 0;
const tfFails: string[] = [];

for (const [task, expected] of TESTS) {
  const kw = oldClassify(task);
  if (kw === expected) kwOk++;
  const tf = classifyTask(task);
  if (tf === expected) tfOk++;
  else tfFails.push(`  ${task} → ${tf} (expected ${expected})`);

  const m = (v: string, e: string) => v === e ? `\x1b[32m✓ ${v}\x1b[0m` : `\x1b[31m✗ ${v}\x1b[0m`;
  console.log(task.substring(0, 46).padEnd(48) + expected.padEnd(12) + m(kw, expected).padEnd(25) + m(tf, expected));
}

console.log("─".repeat(88));
const p = (n: number) => ((n / TESTS.length) * 100).toFixed(0) + "%";
console.log("ACCURACY".padEnd(48) + "".padEnd(12) + `${kwOk}/${TESTS.length} (${p(kwOk)})`.padEnd(14) + `${tfOk}/${TESTS.length} (${p(tfOk)})`);
if (tfFails.length > 0) { console.log(""); console.log(`TF-IDF+TB FAILURES (${tfFails.length}):`); for (const f of tfFails) console.log(f); }
console.log("");
