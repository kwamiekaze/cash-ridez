import { describe, it, expect, vi } from "vitest";
import { createMembershipCheckout } from "../checkout-core";
import { getSubscriptionStatus } from "../status-core";
import { makeStripe, makeSupabase, MEMBERSHIP_PRODUCT, PRICE_ID, sub } from "./mocks";

const USER = { id: "user-1", email: "rider@example.com" };
const PRICES = {
  [PRICE_ID]: { id: PRICE_ID, active: true, recurring: { interval: "month" }, product: MEMBERSHIP_PRODUCT },
};

const checkoutDeps = (supabase: any, stripe: any) => ({
  supabase,
  stripe,
  resolveMembershipPriceId: vi.fn(async () => PRICE_ID),
});

const profileRow = (over: any = {}) => ({
  id: USER.id,
  stripe_customer_id: "cus_1",
  stripe_subscription_id: null,
  subscription_active: false,
  subscription_status: null,
  completed_trips_count: 2,
  connected_trips_count: 1,
  ...over,
});

describe("checkout", () => {
  it("aborts when the profile lookup errors (no customer is created)", async () => {
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: null, error: { message: "db down" } }) } },
    });
    const { stripe, created } = makeStripe({ prices: PRICES });
    await expect(
      createMembershipCheckout(checkoutDeps(supabase, stripe), { user: USER, origin: "https://cashridez.com" }),
    ).rejects.toThrow(/Profile lookup failed/);
    expect(created.customers).toHaveLength(0);
  });

  it("refuses to sell a second membership to a past_due member and points at billing", async () => {
    const supabase = makeSupabase({ tables: { profiles: { select: () => ({ data: profileRow(), error: null }) } } });
    const { stripe } = makeStripe({
      prices: PRICES,
      customers: [{ id: "cus_1", metadata: { supabase_user_id: USER.id } }],
      subscriptions: [sub({ status: "past_due" })],
    });
    const result = await createMembershipCheckout(checkoutDeps(supabase, stripe), {
      user: USER,
      origin: "https://cashridez.com",
    });
    expect(result.status).toBe(409);
    expect(result.body.manage_billing).toBe(true);
  });

  it("reuses an already-open checkout session instead of opening another", async () => {
    const supabase = makeSupabase({ tables: { profiles: { select: () => ({ data: profileRow(), error: null }) } } });
    const { stripe, created } = makeStripe({
      prices: PRICES,
      customers: [{ id: "cus_1", metadata: { supabase_user_id: USER.id } }],
      subscriptions: [],
      openSessions: [{ id: "cs_open", mode: "subscription", url: "https://checkout/open", expires_at: 9e9 }],
    });
    const result = await createMembershipCheckout(checkoutDeps(supabase, stripe), {
      user: USER,
      origin: "https://cashridez.com",
    });
    expect(result.body.reused).toBe(true);
    expect(created.sessions).toHaveLength(0);
  });

  it("serializes concurrent checkout requests per user", async () => {
    let held = false;
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: profileRow(), error: null }) } },
      rpc: {
        claim_checkout_slot: () => {
          if (held) return { data: false, error: null };
          held = true;
          return { data: true, error: null };
        },
        release_checkout_slot: () => {
          held = false;
          return { data: null, error: null };
        },
      },
    });
    const { stripe } = makeStripe({
      prices: PRICES,
      customers: [{ id: "cus_1", metadata: { supabase_user_id: USER.id } }],
      subscriptions: [],
    });

    const [a, b] = await Promise.all([
      createMembershipCheckout(checkoutDeps(supabase, stripe), { user: USER, origin: "https://cashridez.com" }),
      createMembershipCheckout(checkoutDeps(supabase, stripe), { user: USER, origin: "https://cashridez.com" }),
    ]);
    const codes = [a.body.code, b.body.code];
    expect(codes).toContain("checkout_in_progress");
  });

  it("rejects a non-recurring or inactive price", async () => {
    const supabase = makeSupabase({ tables: { profiles: { select: () => ({ data: profileRow(), error: null }) } } });
    const { stripe } = makeStripe({
      prices: { [PRICE_ID]: { id: PRICE_ID, active: true, product: MEMBERSHIP_PRODUCT } },
    });
    await expect(
      createMembershipCheckout(checkoutDeps(supabase, stripe), { user: USER, origin: "https://cashridez.com" }),
    ).rejects.toThrow(/not a recurring price/);
  });
});

describe("status resolution", () => {
  const statusDeps = (supabase: any, stripe: any, resolveProduct?: any) => ({
    supabase,
    stripe,
    resolveMembershipProductId: resolveProduct ?? (async () => MEMBERSHIP_PRODUCT),
  });

  it("aborts instead of reporting a free account when the profile is missing", async () => {
    const supabase = makeSupabase({ tables: { profiles: { select: () => ({ data: null, error: null }) } } });
    const { stripe } = makeStripe({});
    await expect(getSubscriptionStatus(statusDeps(supabase, stripe), USER.id)).rejects.toThrow(/not found/);
  });

  it("keeps confirmed state and flags stale when Stripe is unavailable", async () => {
    const supabase = makeSupabase({
      tables: {
        profiles: {
          select: () => ({
            data: profileRow({ subscription_active: true, subscription_status: "active", connected_trips_count: 7 }),
            error: null,
          }),
        },
      },
    });
    const stripe: any = { subscriptions: { list: async () => { throw new Error("timeout"); } } };
    const result = await getSubscriptionStatus(statusDeps(supabase, stripe), USER.id);
    expect(result.body.stale).toBe(true);
    expect(result.body.subscribed).toBe(true);
    expect(result.body.connected_trips).toBe(7);
  });

  it("does not claim success when the entitlement write fails", async () => {
    const supabase = makeSupabase({
      tables: {
        profiles: {
          select: () => ({ data: profileRow(), error: null }),
          update: () => ({ error: { message: "write failed" } }),
        },
      },
    });
    const { stripe } = makeStripe({ subscriptions: [sub({ status: "active" })] });
    const result = await getSubscriptionStatus(statusDeps(supabase, stripe), USER.id);
    expect(result.body.retryable_error).toBe("db_write_failed");
    expect(result.body.stale).toBe(true);
  });

  it("reports stale on a membership config error rather than revoking", async () => {
    const supabase = makeSupabase({
      tables: {
        profiles: {
          select: () => ({ data: profileRow({ subscription_active: true, subscription_status: "active" }), error: null }),
        },
      },
    });
    const { stripe } = makeStripe({});
    const result = await getSubscriptionStatus(
      statusDeps(supabase, stripe, async () => { throw new Error("no price configured"); }),
      USER.id,
    );
    expect(result.body.retryable_error).toBe("membership_config_unavailable");
    expect(result.body.subscribed).toBe(true);
  });
});
