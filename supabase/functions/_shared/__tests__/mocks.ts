import { vi } from "vitest";

export interface TableBehaviour {
  select?: () => { data: any; error: any };
  update?: (patch: any) => { error: any };
  insert?: (row: any) => { error: any };
}

/**
 * Minimal Supabase mock supporting the query shapes used by the billing code:
 *   from(t).select(c).eq(k, v).maybeSingle()
 *   from(t).update(p).eq(k, v)
 *   from(t).insert(row)
 *   rpc(name, args)
 */
export function makeSupabase(config: {
  tables?: Record<string, TableBehaviour>;
  rpc?: Record<string, (args: any) => { data: any; error: any }>;
}) {
  const calls: { table?: string; op: string; payload?: any; name?: string }[] = [];

  const from = (table: string) => {
    const behaviour = config.tables?.[table] ?? {};
    const builder: any = {
      select: () => {
        calls.push({ table, op: "select" });
        const chain: any = {
          eq: () => chain,
          is: () => chain,
          limit: () => Promise.resolve(behaviour.select?.() ?? { data: [], error: null }),
          maybeSingle: () => Promise.resolve(behaviour.select?.() ?? { data: null, error: null }),
          single: () => Promise.resolve(behaviour.select?.() ?? { data: null, error: null }),
        };
        return chain;
      },
      update: (patch: any) => {
        calls.push({ table, op: "update", payload: patch });
        const result = () => behaviour.update?.(patch) ?? { error: null };
        // Chainable and awaitable: .eq().is().select() as well as bare await.
        const chain: any = {
          eq: () => chain,
          is: () => chain,
          select: () => {
            const r: any = result();
            return Promise.resolve(
              r.error ? r : { data: r.data ?? [{ id: "user-1" }], error: null },
            );
          },
          then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
        };
        return chain;
      },
      insert: (row: any) => {
        calls.push({ table, op: "insert", payload: row });
        return Promise.resolve(behaviour.insert?.(row) ?? { error: null });
      },
    };
    return builder;
  };

  const rpc = (name: string, args: any) => {
    calls.push({ op: "rpc", name, payload: args });
    const fn = config.rpc?.[name];
    if (!fn) {
      return Promise.resolve({
        data: null,
        error: { code: "PGRST202", message: `Could not find the function public.${name}` },
      });
    }
    return Promise.resolve(fn(args));
  };

  return { from, rpc, calls };
}

export function makeStripe(config: {
  customers?: any[];
  customersHasMorePages?: any[][];
  subscriptions?: any[];
  subscriptionPages?: any[][];
  prices?: Record<string, any>;
  openSessions?: any[];
  /** session id -> line items returned by listLineItems */
  sessionLineItems?: Record<string, any[]>;
  createdSessions?: any[];
}) {
  const created = { customers: [] as any[], sessions: [] as any[] };
  let customerPage = 0;
  let subPage = 0;

  const findSession = (id: string) =>
    (config.openSessions ?? []).find((s: any) => s.id === id) ??
    created.sessions.find((s: any) => s.id === id) ??
    null;

  const stripe: any = {
    customers: {
      list: vi.fn(async () => {
        if (config.customersHasMorePages) {
          const page = config.customersHasMorePages[customerPage] ?? [];
          const hasMore = customerPage < config.customersHasMorePages.length - 1;
          customerPage++;
          return { data: page, has_more: hasMore };
        }
        return { data: config.customers ?? [], has_more: false };
      }),
      retrieve: vi.fn(async (id: string) => {
        const all = (config.customersHasMorePages ?? []).flat().concat(config.customers ?? []);
        const found = all.find((c: any) => c.id === id);
        if (!found) {
          const err: any = new Error("No such customer");
          err.code = "resource_missing";
          throw err;
        }
        return found;
      }),
      create: vi.fn(async (params: any) => {
        const customer = { id: `cus_new_${created.customers.length}`, ...params };
        created.customers.push(customer);
        return customer;
      }),
    },
    subscriptions: {
      list: vi.fn(async () => {
        if (config.subscriptionPages) {
          const page = config.subscriptionPages[subPage] ?? [];
          const hasMore = subPage < config.subscriptionPages.length - 1;
          subPage++;
          return { data: page, has_more: hasMore };
        }
        return { data: config.subscriptions ?? [], has_more: false };
      }),
      retrieve: vi.fn(async (id: string) => {
        const found = (config.subscriptions ?? []).find((s: any) => s.id === id);
        if (!found) {
          const err: any = new Error("No such subscription");
          err.code = "resource_missing";
          throw err;
        }
        return found;
      }),
    },
    prices: {
      retrieve: vi.fn(async (id: string) => {
        const price = config.prices?.[id];
        if (!price) throw new Error("No such price");
        return price;
      }),
    },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: config.openSessions ?? [], has_more: false })),
        listLineItems: vi.fn(async (id: string) => ({
          data: config.sessionLineItems?.[id] ?? [],
          has_more: false,
        })),
        retrieve: vi.fn(async (id: string) => {
          const found = findSession(id);
          if (!found) {
            const err: any = new Error("No such session");
            err.code = "resource_missing";
            throw err;
          }
          return found;
        }),
        create: vi.fn(async (params: any) => {
          const session = {
            id: `cs_${created.sessions.length}`,
            url: `https://checkout.stripe.com/cs_${created.sessions.length}`,
            status: "open",
            ...params,
          };
          created.sessions.push(session);
          return session;
        }),
      },
    },
    billingPortal: {
      sessions: { create: vi.fn(async () => ({ id: "bps_1", url: "https://portal" })) },
    },
  };

  return { stripe, created };
}

export const MEMBERSHIP_PRODUCT = "prod_membership";
export const OTHER_PRODUCT = "prod_other";
export const PRICE_ID = "price_199";

export const sub = (over: Partial<any> = {}): any => ({
  id: "sub_1",
  status: "active",
  created: 1000,
  customer: "cus_1",
  items: {
    data: [{ current_period_end: 1800000000, price: { id: PRICE_ID, product: MEMBERSHIP_PRODUCT } }],
  },
  ...over,
});

/**
 * Default in-memory implementations of the atomic billing RPCs shipped in
 * docs/pending-migrations/billing.sql. Tests override individual entries to
 * exercise failure paths.
 */
export function billingRpc(over: Record<string, (args: any) => { data: any; error: any }> = {}) {
  const events = new Map<string, { status: string; token: string }>();
  const generations = new Map<string, number>();
  const applied = new Map<string, number>();
  const attempts = new Map<string, { key: string; sessionId: string | null }>();
  const locks = new Map<string, string>();
  let tokenSeq = 0;

  const base: Record<string, (args: any) => { data: any; error: any }> = {
    claim_billing_event: ({ p_event_id }: any) => {
      const existing = events.get(p_event_id);
      if (!existing) {
        const token = `tok_${++tokenSeq}`;
        events.set(p_event_id, { status: "processing", token });
        return { data: { outcome: "claimed", token }, error: null };
      }
      if (existing.status === "succeeded") {
        return { data: { outcome: "succeeded", token: null }, error: null };
      }
      if (existing.status === "failed") {
        const token = `tok_${++tokenSeq}`;
        events.set(p_event_id, { status: "processing", token });
        return { data: { outcome: "reclaimed", token }, error: null };
      }
      return { data: { outcome: "processing", token: null }, error: null };
    },
    release_billing_event: ({ p_event_id }: any) => {
      const existing = events.get(p_event_id);
      if (existing) existing.status = "failed";
      return { data: true, error: null };
    },
    complete_billing_event: ({ p_event_id, p_claim_token }: any) => {
      const existing = events.get(p_event_id);
      if (!existing || existing.token !== p_claim_token || existing.status !== "processing") {
        return { data: { completed: false, reason: "claim_lost" }, error: null };
      }
      existing.status = "succeeded";
      return { data: { completed: true }, error: null };
    },
    reserve_billing_sync_generation: ({ p_user_id }: any) => {
      const next = (generations.get(p_user_id) ?? 0) + 1;
      generations.set(p_user_id, next);
      return { data: next, error: null };
    },
    apply_billing_sync: ({ p_user_id, p_generation }: any) => {
      const last = applied.get(p_user_id) ?? 0;
      if (p_generation <= last) {
        return { data: { applied: false, stale: true, granted: false }, error: null };
      }
      applied.set(p_user_id, p_generation);
      return { data: { applied: true, stale: false, granted: false }, error: null };
    },
    apply_billing_entitlement: ({ p_event_id, p_claim_token, p_user_id, p_generation }: any) => {
      const existing = events.get(p_event_id);
      if (!existing || existing.token !== p_claim_token || existing.status !== "processing") {
        return { data: null, error: { message: "claim lost", code: "P0001" } };
      }
      existing.status = "succeeded";
      const last = applied.get(p_user_id) ?? 0;
      if (p_generation <= last) {
        return { data: { applied: false, stale: true, granted: false }, error: null };
      }
      applied.set(p_user_id, p_generation);
      return { data: { applied: true, stale: false, granted: false }, error: null };
    },
    claim_checkout_slot: ({ p_user_id, p_owner_token }: any) => {
      if (locks.has(p_user_id)) return { data: { granted: false }, error: null };
      locks.set(p_user_id, p_owner_token);
      return { data: { granted: true }, error: null };
    },
    release_checkout_slot: ({ p_user_id, p_owner_token }: any) => {
      if (locks.get(p_user_id) === p_owner_token) locks.delete(p_user_id);
      return { data: true, error: null };
    },
    begin_checkout_attempt: ({ p_user_id, p_price_id }: any) => {
      const mapKey = `${p_user_id}:${p_price_id}`;
      const existing = attempts.get(mapKey);
      if (existing) {
        return { data: { key: existing.key, session_id: existing.sessionId }, error: null };
      }
      const key = `checkout:${p_user_id}:${++tokenSeq}`;
      attempts.set(mapKey, { key, sessionId: null });
      return { data: { key, session_id: null }, error: null };
    },
    record_checkout_attempt: ({ p_user_id, p_key, p_session_id }: any) => {
      for (const [mapKey, value] of attempts) {
        if (mapKey.startsWith(`${p_user_id}:`) && value.key === p_key) value.sessionId = p_session_id;
      }
      return { data: true, error: null };
    },
    retire_checkout_attempt: ({ p_user_id, p_key }: any) => {
      for (const [mapKey, value] of [...attempts]) {
        if (mapKey.startsWith(`${p_user_id}:`) && value.key === p_key) attempts.delete(mapKey);
      }
      return { data: true, error: null };
    },
  };

  return { ...base, ...over };
}

