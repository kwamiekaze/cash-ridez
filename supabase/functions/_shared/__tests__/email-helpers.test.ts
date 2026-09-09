/**
 * Pure-TypeScript guarantees for the email event system: the fixed admin
 * allowlist, escaping, entitlement/preference gating, and the synthetic [TEST]
 * templates. No network, no database, no Deno-only APIs.
 */
import { describe, it, expect } from "vitest";
import {
  ADMIN_ALERT_RECIPIENTS,
  adminRecipients,
  isAdminRecipient,
  normalizeRecipients,
  restrictToAdminRecipients,
} from "../email/recipients.ts";
import {
  escapeHeader,
  escapeHtml,
  escapeLog,
  redactUrl,
  safeAppLink,
  safeEmailAddress,
} from "../email/escape.ts";
import {
  evaluateEmailEligibility,
  evaluateNewTripEligibility,
  hasTrustedEntitlement,
  preferenceAllows,
} from "../email/eligibility.ts";
import {
  ADMIN_TEMPLATE_NAMES,
  isTestEventType,
  renderTestTemplate,
  renderTripMessageEmail,
  TEST_EVENT_TYPES,
  testTemplateFor,
} from "../email/templates.ts";
import { FALLBACK_SENDERS, PREFERRED_SENDER, senderChain } from "../email/sender.ts";

const paying = {
  id: "u1",
  email: "member@example.com",
  is_driver: true,
  is_verified: true,
  subscription_active: true,
  subscription_status: "active",
  stripe_subscription_id: "sub_1",
  notification_preferences: { all_notifications: true },
};

describe("admin recipient allowlist", () => {
  it("is exactly the three operational addresses", () => {
    expect(adminRecipients()).toEqual([
      "kwamiekaze@gmail.com",
      "cashridezconnect@gmail.com",
      "connect@cashridez.com",
    ]);
    expect(ADMIN_ALERT_RECIPIENTS).toHaveLength(3);
  });

  it("cannot be extended by an injected address", () => {
    expect(restrictToAdminRecipients([
      "attacker@evil.test",
      "KwamieKaze@Gmail.com ",
      "connect@cashridez.com",
    ])).toEqual(["kwamiekaze@gmail.com", "connect@cashridez.com"]);
  });

  it("normalizes, de-duplicates and drops invalid entries", () => {
    expect(normalizeRecipients([" A@B.com", "a@b.com", "bad", null, 5])).toEqual(["a@b.com"]);
    expect(isAdminRecipient("nope@example.com")).toBe(false);
  });
});

describe("escaping", () => {
  it("escapes HTML injection", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).not.toContain("<script>");
  });

  it("strips header injection from subjects", () => {
    expect(escapeHeader("Hi\r\nBcc: evil@example.com")).toBe("Hi Bcc: evil@example.com");
  });

  it("keeps control characters and angle brackets out of logs", () => {
    expect(escapeLog("a\n<b>")).toBe("a b");
  });

  it("redacts signed URL query strings", () => {
    expect(redactUrl("https://x.test/storage/id.jpg?token=secret")).toBe(
      "https://x.test/storage/id.jpg?<redacted>",
    );
  });

  it("rejects unsafe addresses and off-origin links", () => {
    expect(safeEmailAddress("a b@c.com")).toBeNull();
    expect(safeEmailAddress("Name <a@b.com>")).toBeNull();
    expect(safeAppLink("https://evil.test/x", "https://cashridez.com")).toBe("https://cashridez.com");
    expect(safeAppLink("/trip/1", "https://cashridez.com")).toBe("https://cashridez.com/trip/1");
  });
});

describe("entitlement and preferences", () => {
  it("accepts paying and trusted-grant members only", () => {
    expect(hasTrustedEntitlement(paying)).toBe(true);
    expect(hasTrustedEntitlement({ subscription_active: true, subscription_status: "premium" })).toBe(true);
    // Stripe-linked "premium" is not the trusted admin grant.
    expect(hasTrustedEntitlement({
      subscription_active: true,
      subscription_status: "premium",
      stripe_subscription_id: "sub_x",
    })).toBe(false);
    expect(hasTrustedEntitlement({ subscription_active: false, subscription_status: "active" })).toBe(false);
    expect(hasTrustedEntitlement(null)).toBe(false);
  });

  it("honours category preference keys including the legacy new_offers key", () => {
    expect(preferenceAllows({ new_offers: true }, "new_trip")).toBe(true);
    expect(preferenceAllows({ new_trips: false, new_offers: false }, "new_trip")).toBe(false);
    expect(preferenceAllows({ messages: false }, "message")).toBe(false);
    expect(preferenceAllows({ all_notifications: true }, "message")).toBe(true);
  });

  it("blocks optional mail for unsubscribed users but allows essential mail", () => {
    const free = { ...paying, subscription_active: false, subscription_status: null };
    expect(evaluateEmailEligibility(free, "ride_update").eligible).toBe(false);
    expect(evaluateEmailEligibility(free, "verification_decision").eligible).toBe(true);
  });

  it("requires a verified driver who is not the rider for new-trip mail", () => {
    expect(evaluateNewTripEligibility(paying, { riderId: "u1" }).reason).toBe("is_rider");
    expect(evaluateNewTripEligibility({ ...paying, is_verified: false }).reason).toBe("not_verified");
    expect(evaluateNewTripEligibility(paying, { riderId: "someone-else" }).eligible).toBe(true);
  });
});

describe("[TEST] templates", () => {
  it("covers all five test types and maps to the five admin templates", () => {
    expect(TEST_EVENT_TYPES).toEqual([
      "id_uploaded",
      "trip_posted",
      "trip_accepted",
      "new_subscription",
      "support_message",
    ]);
    const mapped = TEST_EVENT_TYPES.map(testTemplateFor);
    expect(new Set(mapped)).toEqual(new Set(ADMIN_TEMPLATE_NAMES));
  });

  it("renders every test type with a [TEST] subject and synthetic data", () => {
    for (const type of TEST_EVENT_TYPES) {
      const email = renderTestTemplate(type, "https://cashridez.com");
      expect(email.subject.startsWith("[TEST] ")).toBe(true);
      expect(email.html).toContain("TEST");
      expect(email.html).not.toContain("<script>");
    }
    expect(isTestEventType("nope")).toBe(false);
  });

  it("never puts message content or phone numbers in the chat email", () => {
    const email = renderTripMessageEmail(
      { tripId: "t1", senderName: "Bob <b>", recipientName: "Ann" },
      { appBaseUrl: "https://cashridez.com" },
    );
    expect(email.html).toContain("Bob &lt;b&gt;");
    expect(email.html).not.toMatch(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/);
  });
});

describe("sender", () => {
  it("always tries connect@cashridez.com first, then the fallbacks", () => {
    expect(PREFERRED_SENDER).toBe("CashRidez <connect@cashridez.com>");
    expect(senderChain()).toEqual([PREFERRED_SENDER, ...FALLBACK_SENDERS]);
    expect(FALLBACK_SENDERS.every((s) => s.includes("updates.cashridez.com"))).toBe(true);
  });

  it("puts a caller-provided sender first and de-duplicates", () => {
    expect(senderChain("CashRidez <alerts@cashridez.com>")).toEqual([
      "CashRidez <alerts@cashridez.com>",
      PREFERRED_SENDER,
      ...FALLBACK_SENDERS,
    ]);
    expect(senderChain(PREFERRED_SENDER)).toEqual([PREFERRED_SENDER, ...FALLBACK_SENDERS]);
    expect(senderChain("   ")).toEqual([PREFERRED_SENDER, ...FALLBACK_SENDERS]);
  });
});

