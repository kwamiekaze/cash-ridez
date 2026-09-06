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
        return { eq: () => Promise.resolve(behaviour.update?.(patch) ?? { error: null }) };
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
  createdSessions?: any[];
}) {
  const created = { customers: [] as any[], sessions: [] as any[] };
  let customerPage = 0;
  let subPage = 0;

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
        create: vi.fn(async (params: any) => {
          const session = {
            id: `cs_${created.sessions.length}`,
            url: `https://checkout.stripe.com/cs_${created.sessions.length}`,
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
