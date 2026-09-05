import { describe, it, expect } from "vitest";
import {
  buildEntitlementUpdate,
  getInvoiceSubscriptionId,
  getSubscriptionPeriodEnd,
  getSubscriptionPriceIds,
  getSubscriptionProductIds,
  isActiveStatus,
  isGrantedPremium,
  isMembershipSubscription,
  periodEndToIso,
  shouldRevokeOnError,
} from "../stripe-compat";

const MEMBERSHIP_PRODUCT = "prod_TLlXcQVuyapr5i";
const LEGACY_PRICE = "price_1SP40FBc1X8FCxHUKUel58fp";
const CURRENT_PRICE = "price_1U9xRIBc1X8FCxHUqrheyxdP";

const basilSubscription = {
  id: "sub_basil",
  status: "active",
  items: {
    data: [
      {
        current_period_end: 1800000000,
        price: { id: CURRENT_PRICE, product: MEMBERSHIP_PRODUCT },
      },
    ],
  },
};

const legacySubscription = {
  id: "sub_legacy",
  status: "active",
  current_period_end: 1700000000,
  items: { data: [{ price: { id: LEGACY_PRICE, product: MEMBERSHIP_PRODUCT } }] },
};

describe("period end parsing", () => {
  it("reads the new per-item current_period_end", () => {
    expect(getSubscriptionPeriodEnd(basilSubscription)).toBe(1800000000);
  });

  it("falls back to the legacy top-level field", () => {
    expect(getSubscriptionPeriodEnd(legacySubscription)).toBe(1700000000);
  });

  it("returns null rather than guessing when absent", () => {
    expect(getSubscriptionPeriodEnd({ id: "sub_x", items: { data: [] } })).toBeNull();
    expect(getSubscriptionPeriodEnd(null)).toBeNull();
    expect(periodEndToIso(null)).toBeNull();
  });

  it("uses the furthest item period end for multi-item subscriptions", () => {
    const sub = {
      items: {
        data: [{ current_period_end: 100 }, { current_period_end: 500 }],
      },
    };
    expect(getSubscriptionPeriodEnd(sub)).toBe(500);
  });

  it("converts to ISO", () => {
    expect(periodEndToIso(1800000000)).toBe(new Date(1800000000 * 1000).toISOString());
  });
});

describe("invoice -> subscription id", () => {
  it("reads parent.subscription_details.subscription", () => {
    const invoice = {
      id: "in_1",
      parent: { subscription_details: { subscription: "sub_new" } },
    };
    expect(getInvoiceSubscriptionId(invoice)).toBe("sub_new");
  });

  it("supports an expanded subscription object", () => {
    const invoice = {
      parent: { subscription_details: { subscription: { id: "sub_expanded" } } },
    };
    expect(getInvoiceSubscriptionId(invoice)).toBe("sub_expanded");
  });

  it("falls back to the legacy top-level field", () => {
    expect(getInvoiceSubscriptionId({ subscription: "sub_legacy" })).toBe("sub_legacy");
  });

  it("returns null for one-off invoices", () => {
    expect(getInvoiceSubscriptionId({ id: "in_2" })).toBeNull();
    expect(getInvoiceSubscriptionId(null)).toBeNull();
  });
});

describe("membership scoping by product", () => {
  it("keeps legacy-price subscribers in scope", () => {
    expect(isMembershipSubscription(legacySubscription, MEMBERSHIP_PRODUCT)).toBe(true);
    expect(getSubscriptionPriceIds(legacySubscription)).toEqual([LEGACY_PRICE]);
  });

  it("includes current-price subscribers", () => {
    expect(isMembershipSubscription(basilSubscription, MEMBERSHIP_PRODUCT)).toBe(true);
  });

  it("excludes unrelated products", () => {
    const other = { items: { data: [{ price: { product: "prod_other" } }] } };
    expect(isMembershipSubscription(other, MEMBERSHIP_PRODUCT)).toBe(false);
    expect(getSubscriptionProductIds(other)).toEqual(["prod_other"]);
  });

  it("does not exclude anything when the product is unknown", () => {
    expect(isMembershipSubscription(basilSubscription, null)).toBe(true);
  });
});

describe("entitlement synchronization", () => {
  it("sets active/is_member/status/period together", () => {
    expect(buildEntitlementUpdate(basilSubscription)).toEqual({
      subscription_active: true,
      subscription_status: "active",
      subscription_current_period_end: 1800000000,
      is_member: true,
      stripe_subscription_id: "sub_basil",
    });
  });

  it("deactivates consistently for canceled subscriptions", () => {
    const update = buildEntitlementUpdate({ id: "sub_c", status: "canceled", items: { data: [] } });
    expect(update.subscription_active).toBe(false);
    expect(update.is_member).toBe(false);
    expect(update.subscription_status).toBe("canceled");
  });

  it("treats trialing as active and past_due as inactive", () => {
    expect(isActiveStatus("trialing")).toBe(true);
    expect(isActiveStatus("past_due")).toBe(false);
    expect(isActiveStatus(undefined)).toBe(false);
  });
});

describe("admin granted premium", () => {
  it("recognises granted access with no Stripe subscription", () => {
    expect(isGrantedPremium({ subscription_active: true, subscription_status: "premium", stripe_subscription_id: null }))
      .toBe(true);
  });

  it("does not treat a real Stripe subscriber as granted", () => {
    expect(isGrantedPremium({ subscription_active: true, subscription_status: "premium", stripe_subscription_id: "sub_1" }))
      .toBe(false);
  });

  it("does not treat ordinary users as granted", () => {
    expect(isGrantedPremium({ subscription_active: false, subscription_status: "active" })).toBe(false);
    expect(isGrantedPremium(null)).toBe(false);
  });
});

describe("never revoke on transport errors", () => {
  it("revokes only on a definitive missing resource", () => {
    expect(shouldRevokeOnError({ code: "resource_missing" })).toBe(true);
    expect(shouldRevokeOnError({ type: "StripeInvalidRequestError", statusCode: 404 })).toBe(true);
  });

  it("does not revoke on network/API/parse failures", () => {
    expect(shouldRevokeOnError({ type: "StripeConnectionError" })).toBe(false);
    expect(shouldRevokeOnError({ type: "StripeAPIError", statusCode: 500 })).toBe(false);
    expect(shouldRevokeOnError({ type: "StripeRateLimitError", statusCode: 429 })).toBe(false);
    expect(shouldRevokeOnError(new TypeError("boom") as any)).toBe(false);
    expect(shouldRevokeOnError(null)).toBe(false);
  });
});
