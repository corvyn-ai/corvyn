import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Database } from 'bun:sqlite';
import { routeRequest } from './router';
import type { CorvynConfig } from './config';
import type { CurrencyInfo } from './currency';

interface ServerDeps {
  db: Database;
  config: CorvynConfig;
  currency: CurrencyInfo;
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();

  app.use('*', cors());

  app.get('/health', (c) => {
    return c.json({ status: 'ok', service: 'corvyn', version: '0.1.0' });
  });

  app.post('/v1/chat/completions', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      return routeRequest(deps.db, body, 'openai', deps.config, deps.currency);
    } catch (error) {
      return c.json(
        { error: { message: `Bad request: ${String(error)}`, type: 'invalid_request_error' } },
        { status: 400 }
      );
    }
  });

  app.post('/v1/messages', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      return routeRequest(deps.db, body, 'anthropic', deps.config, deps.currency);
    } catch (error) {
      return c.json(
        { error: { message: `Bad request: ${String(error)}`, type: 'invalid_request_error' } },
        { status: 400 }
      );
    }
  });

  app.post('/v1/completions', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const prompt = (body.prompt as string) ?? '';
      const converted: Record<string, unknown> = {
        ...body,
        messages: [{ role: 'user', content: prompt }],
      };
      delete converted.prompt;
      return routeRequest(deps.db, converted, 'openai', deps.config, deps.currency);
    } catch (error) {
      return c.json(
        { error: { message: `Bad request: ${String(error)}`, type: 'invalid_request_error' } },
        { status: 400 }
      );
    }
  });

  app.get('/v1/models', (c) => {
    return c.json({
      object: 'list',
      data: [
        { id: 'corvyn/auto', object: 'model', owned_by: 'corvyn' },
        { id: 'corvyn/free', object: 'model', owned_by: 'corvyn' },
        { id: 'corvyn/paid', object: 'model', owned_by: 'corvyn' },
        { id: 'openai/auto', object: 'model', owned_by: 'corvyn' },
        { id: 'openai/free', object: 'model', owned_by: 'corvyn' },
        { id: 'openai/paid', object: 'model', owned_by: 'corvyn' },
      ],
    });
  });

  app.notFound((c) => {
    return c.json(
      { error: { message: 'Not found', type: 'not_found_error' } },
      { status: 404 }
    );
  });

  app.onError((error, c) => {
    console.error('Server error:', error);
    return c.json(
      { error: { message: 'Internal server error', type: 'server_error' } },
      { status: 500 }
    );
  });

  return app;
}
