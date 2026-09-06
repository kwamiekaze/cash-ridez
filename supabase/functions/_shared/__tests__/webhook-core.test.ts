import { describe, it, expect, vi } from "vitest";
import { handleStripeEvent } from "../webhook-core";
import { billingRpc, makeStripe, makeSupabase, MEMBERSHIP_PRODUCT, OTHER_PRODUCT, sub } from "./mocks";

const PROFILE = {
  id: "user-1",
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  subscription_active: true,
  subscription_status: "active",
};

const claimStore = () => ({ rpc: billingRpc() });

const deps = (supabase: any, stripe: any) => ({
  supabase,
  stripe,
  resolveMembershipProductId: vi.fn(async () => MEMBERSHIP_PRODUCT),
});

const event = (type: string, object: any, id = "evt_1") => ({
  id,
  type,
  created: 2000,
  data: { object },
});

describe("unhandled events", () => {
  it("returns 200 without resolving membership config", async () => {
    const supabase = makeSupabase({});
    const { stripe } = makeStripe({});
    const d = deps(supabase, stripe);
    const result = await handleStripeEvent(d, event("customer.discount.created", {}));
    expect(result.status).toBe(200);
    expect(d.resolveMembershipProductId).not.toHaveBeenCalled();
    expect(supabase.calls.some((c) => c.op === "rpc")).toBe(false);
  });
});

describe("idempotency + notifications", () => {
  it("processes an event once and skips concurrent redelivery", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: PROFILE, error: null }) } },
      rpc: claims.rpc,
    });
    const { stripe } = makeStripe({ subscriptions: [sub({ status: "active" })] });

    const first = await handleStripeEvent(deps(supabase, stripe), event("invoice.payment_failed", {
      id: "in_1",
      customer: "cus_1",
      parent: { subscription_details: { subscription: "sub_1" } },
    }));
    const second = await handleStripeEvent(deps(supabase, stripe), event("invoice.payment_failed", {
      id: "in_1",
      customer: "cus_1",
      parent: { subscription_details: { subscription: "sub_1" } },
    }));

    expect(first.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    const entitlementCalls = supabase.calls.filter((c) => c.name === "apply_billing_entitlement");
    expect(entitlementCalls).toHaveLength(1);
  });

  it("sends exactly one payment_failed notification and only when access is lost", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: PROFILE, error: null }) } },
      rpc: claims.rpc,
    });
    const { stripe } = makeStripe({ subscriptions: [sub({ status: "past_due" })] });

    await handleStripeEvent(deps(supabase, stripe), event("invoice.payment_failed", {
      id: "in_2",
      customer: "cus_1",
      parent: { subscription_details: { subscription: "sub_1" } },
    }, "evt_pf"));

    const call = supabase.calls.find((c) => c.name === "apply_billing_entitlement");
    expect(call?.payload.p_notification?.p_type).toBe("payment_failed");
  });
});

describe("authoritative current membership", () => {
  it("an old canceled invoice cannot revoke a live membership", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: PROFILE, error: null }) } },
      rpc: claims.rpc,
    });
    const { stripe } = makeStripe({
      subscriptions: [
        sub({ id: "sub_old", status: "canceled", created: 1 }),
        sub({ id: "sub_new", status: "active", created: 9 }),
      ],
    });

    await handleStripeEvent(deps(supabase, stripe), event("invoice.payment_succeeded", {
      id: "in_old",
      customer: "cus_1",
      parent: { subscription_details: { subscription: "sub_old" } },
    }));

    const call = supabase.calls.find((c) => c.name === "apply_billing_entitlement");
    expect(call?.payload.p_entitlement.subscription_active).toBe(true);
    expect(call?.payload.p_entitlement.stripe_subscription_id).toBe("sub_new");
  });

  it("ignores an unrelated product without touching entitlement", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: { ...PROFILE, subscription_active: false, stripe_subscription_id: null }, error: null }) } },
      rpc: claims.rpc,
    });
    const { stripe } = makeStripe({
      subscriptions: [sub({ id: "sub_other", items: { data: [{ price: { product: OTHER_PRODUCT } }] } })],
    });

    const result = await handleStripeEvent(deps(supabase, stripe), event("customer.subscription.updated", {
      id: "sub_other",
      customer: "cus_1",
    }));

    expect(result.status).toBe(200);
    expect(supabase.calls.some((c) => c.name === "apply_billing_entitlement")).toBe(false);
  });

  it("never revokes admin-granted premium", async () => {
    const claims = claimStore();
    const granted = {
      id: "user-g",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: null,
      subscription_active: true,
      subscription_status: "premium",
    };
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: granted, error: null }) } },
      rpc: claims.rpc,
    });
    const { stripe } = makeStripe({ subscriptions: [] });

    const result = await handleStripeEvent(deps(supabase, stripe), event("customer.subscription.deleted", {
      id: "sub_gone",
      customer: "cus_1",
    }));

    expect(result.status).toBe(200);
    expect(supabase.calls.some((c) => c.name === "apply_billing_entitlement")).toBe(false);
  });
});

describe("failure handling", () => {
  it("returns 5xx and releases the claim when the entitlement write fails", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: {
        profiles: { select: () => ({ data: PROFILE, error: null }) },
        billing_logs: { insert: () => ({ error: { message: "log denied" } }) },
      },
      rpc: {
        ...claims.rpc,
        apply_billing_entitlement: () => ({ data: null, error: { message: "deadlock", code: "40P01" } }),
      },
    });
    const { stripe } = makeStripe({ subscriptions: [sub({ status: "active" })] });

    const result = await handleStripeEvent(deps(supabase, stripe), event("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
    }));

    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(supabase.calls.some((c) => c.name === "release_billing_event")).toBe(true);
  });

  it("returns 5xx (not 200) when a transient Stripe error occurs", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: PROFILE, error: null }) } },
      rpc: claims.rpc,
    });
    const stripe: any = {
      subscriptions: { list: async () => { throw new Error("gateway timeout"); } },
      customers: { retrieve: async () => ({ id: "cus_1", metadata: {} }) },
    };

    const result = await handleStripeEvent(deps(supabase, stripe), event("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
    }));

    expect(result.status).toBe(500);
    expect(supabase.calls.some((c) => c.name === "apply_billing_entitlement")).toBe(false);
  });

  it("does not mark an event processed when the profile is not linked yet", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: null, error: null }) } },
      rpc: claims.rpc,
    });
    const { stripe } = makeStripe({ customers: [{ id: "cus_1", metadata: {} }] });

    const result = await handleStripeEvent(deps(supabase, stripe), event("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
    }));

    expect(result.status).toBe(503);
    expect(supabase.calls.some((c) => c.name === "release_billing_event")).toBe(true);
  });

  it("passes a DB-reserved monotonic generation as the ordering guard", async () => {
    const claims = claimStore();
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: PROFILE, error: null }) } },
      rpc: claims.rpc,
    });
    const { stripe } = makeStripe({ subscriptions: [sub({ status: "active" })] });

    await handleStripeEvent(deps(supabase, stripe), event("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
    }));

    const call = supabase.calls.find((c) => c.name === "apply_billing_entitlement");
    expect(typeof call?.payload.p_generation).toBe("number");
    expect(call?.payload.p_generation).toBeGreaterThan(0);
    expect(call?.payload.p_claim_token).toEqual(expect.any(String));
  });
});
