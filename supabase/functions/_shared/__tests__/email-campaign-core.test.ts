import { describe, expect, it } from "vitest";
import {
  DEFAULT_THROTTLE_SECONDS,
  DRIVER_AUDIENCE_SIZES,
  DRIVER_EMAIL_PRESETS,
  MAX_RECIPIENTS_PER_RUN,
  PRESET_FOOTER,
  computeCampaignCounts,
  computeIdempotencyKey,
  dedupeByEmail,
  deriveFirstName,
  estimateCompletionSeconds,
  formatDurationShort,
  isRateLimited,
  isValidAudienceSize,
  parseRetryAfterMs,
  renderTemplate,
  validateTemplates,
} from "../email-campaign-core.ts";

describe("audience size validation", () => {
  it("accepts only 10, 20, 30 and 50", () => {
    expect(DRIVER_AUDIENCE_SIZES).toEqual([10, 20, 30, 50]);
    for (const size of DRIVER_AUDIENCE_SIZES) {
      expect(isValidAudienceSize(size)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const bad of [0, 1, 5, 11, 25, 40, 51, 100, -10, 10.5, "10", null, undefined, NaN]) {
      expect(isValidAudienceSize(bad as unknown)).toBe(false);
    }
  });
});

describe("template personalization", () => {
  it("substitutes the first name everywhere", () => {
    expect(renderTemplate("Hi {first_name}, {first_name}!", "Sam")).toBe("Hi Sam, Sam!");
  });

  it("falls back to 'there' when the name is missing or blank", () => {
    expect(renderTemplate("Hi {first_name},", null)).toBe("Hi there,");
    expect(renderTemplate("Hi {first_name},", "   ")).toBe("Hi there,");
    expect(renderTemplate("Hi {first_name},", undefined)).toBe("Hi there,");
  });

  it("derives a first name from full or display name", () => {
    expect(deriveFirstName("Jordan Michael Lee", null)).toBe("Jordan");
    expect(deriveFirstName("  ", "Casey R")).toBe("Casey");
    expect(deriveFirstName(null, null)).toBeNull();
  });

  it("validates subject and body lengths", () => {
    expect(validateTemplates("Hello", "Body").ok).toBe(true);
    expect(validateTemplates("", "Body").ok).toBe(false);
    expect(validateTemplates("Hello", "  ").ok).toBe(false);
    expect(validateTemplates("x".repeat(201), "Body").ok).toBe(false);
    expect(validateTemplates("Hello", "x".repeat(10001)).ok).toBe(false);
  });
});

describe("presets", () => {
  it("carries the exact approved subjects and a preferences footer", () => {
    const [ride, feature] = DRIVER_EMAIL_PRESETS;
    expect(ride.subject).toBe("A new ride may be waiting near you");
    expect(feature.subject).toBe("New CashRidez features are ready");
    for (const preset of DRIVER_EMAIL_PRESETS) {
      expect(preset.body).toContain("{first_name}");
      expect(preset.body).toContain(PRESET_FOOTER);
      expect(preset.body).not.toMatch(/guaranteed/i);
      expect(preset.body).not.toMatch(/spam/i);
    }
  });
});

describe("recipient selection rules", () => {
  it("dedupes emails case-insensitively keeping the first (most recent)", () => {
    const rows = dedupeByEmail([
      { email: "Driver@Example.com", first_name: "A", last_active_at: "2026-09-09T10:00:00Z" },
      { email: "driver@example.com", first_name: "B", last_active_at: "2026-09-01T10:00:00Z" },
      { email: "other@example.com", first_name: "C", last_active_at: "2026-08-01T10:00:00Z" },
    ]);
    expect(rows.map((r) => r.email)).toEqual(["driver@example.com", "other@example.com"]);
    expect(rows[0].first_name).toBe("A");
  });

  it("drops empty and malformed email addresses", () => {
    const rows = dedupeByEmail([
      { email: "" },
      { email: "   " },
      { email: "not-an-email" },
      { email: "ok@example.com" },
    ] as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("ok@example.com");
  });
});

describe("worker batching, throttle and counts", () => {
  it("caps a run at 10 recipients and throttles at 5 seconds", () => {
    expect(MAX_RECIPIENTS_PER_RUN).toBe(10);
    expect(DEFAULT_THROTTLE_SECONDS).toBe(5);
  });

  it("produces a stable idempotency key per recipient", () => {
    const a = computeIdempotencyKey("c1", "r1");
    expect(a).toBe(computeIdempotencyKey("c1", "r1"));
    expect(a).not.toBe(computeIdempotencyKey("c1", "r2"));
    expect(a).not.toBe(computeIdempotencyKey("c2", "r1"));
    expect(a).not.toBe(computeIdempotencyKey("c1", "r1", "fallback"));
  });

  it("treats 429 and 5xx as retryable, 4xx as permanent", () => {
    expect(isRateLimited(429, "Too many requests")).toBe(true);
    expect(isRateLimited(503, "unavailable")).toBe(true);
    expect(isRateLimited(200, "Rate limit exceeded")).toBe(true);
    expect(isRateLimited(422, "Invalid recipient")).toBe(false);
  });

  it("honours Retry-After seconds and dates, and backs off otherwise", () => {
    const now = Date.parse("2026-09-10T00:00:00Z");
    expect(parseRetryAfterMs("12", 1, now)).toBe(12000);
    expect(parseRetryAfterMs("2026-09-10T00:00:30Z", 1, now)).toBe(30000);
    expect(parseRetryAfterMs(null, 1, now)).toBe(5000);
    expect(parseRetryAfterMs(null, 3, now)).toBe(20000);
    expect(parseRetryAfterMs(null, 20, now)).toBe(300000);
  });

  it("recalculates counts from recipient rows and only completes when drained", () => {
    const partial = computeCampaignCounts([
      { status: "sent" }, { status: "sent" }, { status: "failed" },
      { status: "queued" }, { status: "skipped" },
    ]);
    expect(partial).toMatchObject({ sent: 2, failed: 1, queued: 1, skipped: 1, total: 5 });
    expect(partial.isComplete).toBe(false);

    expect(computeCampaignCounts([{ status: "sent" }, { status: "sending" }]).isComplete).toBe(false);
    expect(computeCampaignCounts([{ status: "sent" }, { status: "failed" }]).isComplete).toBe(true);
    expect(computeCampaignCounts([]).isComplete).toBe(true);
  });

  it("estimates completion across batches of ten", () => {
    expect(estimateCompletionSeconds(0)).toBe(0);
    expect(estimateCompletionSeconds(1)).toBe(0);
    expect(estimateCompletionSeconds(10)).toBe(45);
    expect(estimateCompletionSeconds(20)).toBe(105);
    expect(estimateCompletionSeconds(50)).toBe(285);
    expect(formatDurationShort(105)).toBe("1m 45s");
    expect(formatDurationShort(120)).toBe("2m");
    expect(formatDurationShort(45)).toBe("45s");
  });
});
