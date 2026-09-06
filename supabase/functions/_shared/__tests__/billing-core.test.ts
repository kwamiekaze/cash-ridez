import { describe, it, expect } from "vitest";
import {
  AmbiguousCustomerError,
  RetryableBillingError,
  findCustomerByUserMetadata,
  hasRenewableMembership,
  listAllSubscriptions,
  loadProfileOrThrow,
  pickCurrentMembership,
  resolveAppOrigin,
  resolveCustomerForUser,
} from "../billing-core";
import { makeStripe, makeSupabase, MEMBERSHIP_PRODUCT, OTHER_PRODUCT, sub } from "./mocks";

const USER = { id: "user-1", email: "rider@example.com" };

describe("origin allowlist", () => {
  it("accepts the app's own domains", () => {
    expect(resolveAppOrigin("https://cashridez.com")).toBe("https://cashridez.com");
    expect(resolveAppOrigin("https://cash-ridez.lovable.app")).toBe("https://cash-ridez.lovable.app");
  });

  it("rejects any other lovable.app project", () => {
    expect(resolveAppOrigin("https://evil-project.lovable.app")).toBe("https://cashridez.com");
    expect(resolveAppOrigin("https://cashridez.com.attacker.net")).toBe("https://cashridez.com");
    expect(resolveAppOrigin("https://evil.lovableproject.com")).toBe("https://cashridez.com");
  });
});

describe("profile loading", () => {
  it("throws on a query error instead of assuming a free account", async () => {
    const supabase = makeSupabase({
      tables: { profiles: { select: () => ({ data: null, error: { message: "boom" } }) } },
    });
    await expect(loadProfileOrThrow(supabase, USER.id)).rejects.toBeInstanceOf(RetryableBillingError);
  });

  it("throws when the profile row is missing", async () => {
    const supabase = makeSupabase({ tables: { profiles: { select: () => ({ data: null, error: null }) } } });
    await expect(loadProfileOrThrow(supabase, USER.id)).rejects.toThrow(/not found/);
  });
});

describe("customer binding (security)", () => {
  it("never binds a customer that merely shares the email", async () => {
    const { stripe } = makeStripe({
      customers: [
        { id: "cus_attacker", email: USER.email, metadata: {} },
        { id: "cus_other_user", email: USER.email, metadata: { supabase_user_id: "user-2" } },
      ],
    });
    const found = await findCustomerByUserMetadata(stripe, USER.email, USER.id);
    expect(found).toBeNull();
  });

  it("fails safely when two customers claim the same user", async () => {
    const { stripe } = makeStripe({
      customers: [
        { id: "cus_a", metadata: { supabase_user_id: USER.id } },
        { id: "cus_b", metadata: { supabase_user_id: USER.id } },
      ],
    });
    await expect(findCustomerByUserMetadata(stripe, USER.email, USER.id)).rejects.toBeInstanceOf(
      AmbiguousCustomerError,
    );
  });

  it("paginates the email search", async () => {
    const { stripe } = makeStripe({
      customersHasMorePages: [
        Array.from({ length: 100 }, (_, i) => ({ id: `cus_p1_${i}`, metadata: {} })),
        [{ id: "cus_match", metadata: { supabase_user_id: USER.id } }],
      ],
    });
    await expect(findCustomerByUserMetadata(stripe, USER.email, USER.id)).resolves.toBe("cus_match");
    expect(stripe.customers.list).toHaveBeenCalledTimes(2);
  });

  it("does not create a customer for the portal path when none matches", async () => {
    const { stripe, created } = makeStripe({ customers: [{ id: "cus_x", metadata: {} }] });
    const supabase = makeSupabase({});
    const result = await resolveCustomerForUser(stripe, supabase, USER, {}, { createIfMissing: false });
    expect(result).toBeNull();
    expect(created.customers).toHaveLength(0);
  });

  it("aborts when persisting the recovered mapping fails", async () => {
    const { stripe } = makeStripe({
      customers: [{ id: "cus_ok", metadata: { supabase_user_id: USER.id } }],
    });
    const supabase = makeSupabase({
      tables: { profiles: { update: () => ({ error: { message: "write denied" } }) } },
    });
    await expect(
      resolveCustomerForUser(stripe, supabase, USER, {}, { createIfMissing: true }),
    ).rejects.toThrow(/Profile update failed/);
  });

  it("rejects a stored customer owned by a different user", async () => {
    const { stripe } = makeStripe({
      customers: [
        { id: "cus_stored", metadata: { supabase_user_id: "someone-else" } },
        { id: "cus_mine", metadata: { supabase_user_id: USER.id } },
      ],
    });
    const supabase = makeSupabase({});
    const result = await resolveCustomerForUser(
      stripe,
      supabase,
      USER,
      { stripe_customer_id: "cus_stored" },
      { createIfMissing: false },
    );
    expect(result).toBe("cus_mine");
  });
});

describe("authoritative membership selection", () => {
  it("prefers an active membership over an older canceled one", () => {
    const chosen = pickCurrentMembership(
      [
        sub({ id: "sub_old", status: "canceled", created: 100 }),
        sub({ id: "sub_new", status: "active", created: 200 }),
      ],
      MEMBERSHIP_PRODUCT,
    );
    expect(chosen.id).toBe("sub_new");
  });

  it("ignores subscriptions for other products", () => {
    const chosen = pickCurrentMembership(
      [sub({ id: "sub_other", items: { data: [{ price: { product: OTHER_PRODUCT } }] } })],
      MEMBERSHIP_PRODUCT,
    );
    expect(chosen).toBeNull();
  });

  it("pages past 20 subscriptions", async () => {
    const { stripe } = makeStripe({
      subscriptionPages: [
        Array.from({ length: 100 }, (_, i) => sub({ id: `sub_${i}`, status: "canceled", created: i })),
        [sub({ id: "sub_live", status: "active", created: 999 })],
      ],
    });
    const all = await listAllSubscriptions(stripe, "cus_1");
    expect(all).toHaveLength(101);
    expect(pickCurrentMembership(all, MEMBERSHIP_PRODUCT).id).toBe("sub_live");
  });

  it("treats a Stripe list failure as retryable, not as 'no membership'", async () => {
    const stripe: any = { subscriptions: { list: async () => { throw new Error("503"); } } };
    await expect(listAllSubscriptions(stripe, "cus_1")).rejects.toBeInstanceOf(RetryableBillingError);
  });

  it("blocks reselling to past_due/unpaid members", () => {
    expect(hasRenewableMembership(sub({ status: "past_due" }))).toBe(true);
    expect(hasRenewableMembership(sub({ status: "unpaid" }))).toBe(true);
    expect(hasRenewableMembership(sub({ status: "canceled" }))).toBe(false);
    expect(hasRenewableMembership(null)).toBe(false);
  });
});
