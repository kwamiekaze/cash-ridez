import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

type Listener = (event: any) => void;

interface SwHarness {
  listeners: Record<string, Listener[]>;
  context: any;
  cachePuts: Array<{ key: any; value: any }>;
}

function loadServiceWorker(opts: {
  fetchImpl: (req: any, init?: any) => Promise<any>;
  cacheMatch?: (key: any) => Promise<any>;
}): SwHarness {
  const source = readFileSync(
    path.resolve(process.cwd(), 'public/sw.js'),
    'utf8'
  );

  const listeners: Record<string, Listener[]> = {};
  const cachePuts: Array<{ key: any; value: any }> = [];

  const cacheObject = {
    addAll: async () => undefined,
    put: async (key: any, value: any) => {
      cachePuts.push({ key, value });
    },
  };

  const self: any = {
    location: { origin: 'https://cashridez.com' },
    addEventListener: (type: string, cb: Listener) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [] },
    registration: { showNotification: async () => undefined },
  };

  const context: any = {
    self,
    console,
    URL,
    Response: { error: () => ({ type: 'error' }) },
    caches: {
      open: async () => cacheObject,
      keys: async () => [],
      delete: async () => true,
      match: opts.cacheMatch || (async () => undefined),
    },
    fetch: opts.fetchImpl,
  };
  context.globalThis = context;

  vm.createContext(context);
  vm.runInContext(source, context);

  return { listeners, context, cachePuts };
}

function makeNavigationRequest(url: string) {
  return {
    url,
    method: 'GET',
    mode: 'navigate',
    headers: { get: () => 'text/html' },
  };
}

describe('public/sw.js app shell freshness', () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
  });

  it('does not precache / or /index.html', () => {
    const match = source.match(/const STATIC_ASSETS = \[([\s\S]*?)\]/);
    expect(match).toBeTruthy();
    const list = match![1];
    expect(list).not.toMatch(/['"]\/['"]/);
    expect(list).not.toMatch(/index\.html/);
  });

  it('serves navigations network-first with cache: no-store and caches the shell', async () => {
    const calls: Array<{ req: any; init: any }> = [];
    const networkResponse = {
      status: 200,
      type: 'basic',
      clone: () => ({ body: 'fresh-shell' }),
      body: 'fresh-shell',
    };

    const { listeners, cachePuts } = loadServiceWorker({
      fetchImpl: async (req, init) => {
        calls.push({ req, init });
        return networkResponse;
      },
    });

    let responded: any;
    const event = {
      request: makeNavigationRequest('https://cashridez.com/dashboard'),
      respondWith: (p: any) => {
        responded = p;
      },
    };

    listeners.fetch[0](event);
    const result = await responded;

    expect(calls).toHaveLength(1);
    expect(calls[0].init).toEqual({ cache: 'no-store' });
    expect(result).toBe(networkResponse);

    await new Promise((r) => setTimeout(r, 0));
    expect(cachePuts.map((c) => c.key)).toContain('/index.html');
  });

  it('falls back to the cached offline shell when the network fails', async () => {
    const offlineShell = { status: 200, body: 'offline-shell' };

    const { listeners } = loadServiceWorker({
      fetchImpl: async () => {
        throw new Error('offline');
      },
      cacheMatch: async (key: any) =>
        key === '/index.html' ? offlineShell : undefined,
    });

    let responded: any;
    listeners.fetch[0]({
      request: makeNavigationRequest('https://cashridez.com/trips'),
      respondWith: (p: any) => {
        responded = p;
      },
    });

    await expect(responded).resolves.toBe(offlineShell);
  });
});
