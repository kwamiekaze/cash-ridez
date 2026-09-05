import { describe, it, expect } from "vitest";
import {
  escapeXml,
  extractContactFromRiderNote,
  isValidUsE164,
  maskPhone,
  normalizeUsE164,
  resolveParticipantPhone,
} from "../phone";
import {
  buildSignaturePayload,
  computeTwilioSignature,
  externalRequestUrl,
  verifyTwilioSignature,
} from "../twilio-signature";

describe("US E.164 normalization", () => {
  it("accepts common valid formats", () => {
    expect(normalizeUsE164("(678) 928-8816")).toBe("+16789288816");
    expect(normalizeUsE164("678.928.8816")).toBe("+16789288816");
    expect(normalizeUsE164("1 678 928 8816")).toBe("+16789288816");
    expect(normalizeUsE164("+16789288816")).toBe("+16789288816");
  });

  it("rejects malformed values instead of coercing them", () => {
    expect(normalizeUsE164("12345")).toBeNull();
    expect(normalizeUsE164("call me at home")).toBeNull();
    expect(normalizeUsE164("+44 20 7946 0958")).toBeNull();
    expect(normalizeUsE164("078-928-8816")).toBeNull(); // area code cannot start with 0
    expect(normalizeUsE164("678-128-8816")).toBeNull(); // exchange cannot start with 1
    expect(normalizeUsE164("")).toBeNull();
    expect(normalizeUsE164(null)).toBeNull();
  });

  it("validates strict E.164", () => {
    expect(isValidUsE164("+16789288816")).toBe(true);
    expect(isValidUsE164("6789288816")).toBe(false);
  });
});

describe("participant phone resolution order", () => {
  it("prefers the profile number", () => {
    expect(
      resolveParticipantPhone({
        profilePhone: "678-928-8816",
        adminOverride: "404-555-0134",
        riderNote: "Contact: 470-555-0199",
      }),
    ).toEqual({ phone: "+16789288816", source: "profile" });
  });

  it("falls back to the admin phone override", () => {
    expect(
      resolveParticipantPhone({ profilePhone: "  ", adminOverride: "404-555-0134", riderNote: null }),
    ).toEqual({ phone: "+14045550134", source: "admin_override" });
  });

  it("falls back to the rider note contact last", () => {
    expect(
      resolveParticipantPhone({
        profilePhone: null,
        adminOverride: null,
        riderNote: "Trip Details: airport | Contact: 470-555-0199 | Emergency: none",
      }),
    ).toEqual({ phone: "+14705550199", source: "rider_note" });
  });

  it("returns null when no usable number exists", () => {
    expect(resolveParticipantPhone({ profilePhone: "bad", adminOverride: "nope", riderNote: "Contact: none" }))
      .toEqual({ phone: null, source: null });
  });

  it("ignores a rider note with no Contact segment", () => {
    expect(extractContactFromRiderNote("Trip Details: airport run")).toBeNull();
  });

  it("masks numbers for logging", () => {
    expect(maskPhone("+16789288816")).toBe("***8816");
    expect(maskPhone(null)).toBe("none");
  });
});

describe("TwiML escaping", () => {
  it("escapes XML metacharacters", () => {
    expect(escapeXml(`a&b<c>"d'e`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;e");
  });
});

describe("Twilio signature verification", () => {
  const token = "test_auth_token";
  const url = "https://example.supabase.co/functions/v1/call-status?callId=abc";
  const params = { CallSid: "CA123", CallStatus: "completed", CallDuration: "42" };

  it("sorts params into the canonical payload", () => {
    expect(buildSignaturePayload("https://x/y", { b: "2", a: "1" })).toBe("https://x/ya1b2");
  });

  it("accepts a correctly signed request", async () => {
    const signature = await computeTwilioSignature(token, url, params);
    await expect(verifyTwilioSignature({ authToken: token, signature, url, params })).resolves.toBe(true);
  });

  it("rejects a tampered parameter", async () => {
    const signature = await computeTwilioSignature(token, url, params);
    const tampered = { ...params, CallStatus: "in-progress" };
    await expect(verifyTwilioSignature({ authToken: token, signature, url, params: tampered })).resolves.toBe(false);
  });

  it("rejects a signature minted for a different URL (replay to another callId)", async () => {
    const signature = await computeTwilioSignature(token, url, params);
    const otherUrl = "https://example.supabase.co/functions/v1/call-status?callId=other";
    await expect(verifyTwilioSignature({ authToken: token, signature, url: otherUrl, params })).resolves.toBe(false);
  });

  it("rejects a missing signature or missing token", async () => {
    await expect(verifyTwilioSignature({ authToken: token, signature: null, url, params })).resolves.toBe(false);
    await expect(verifyTwilioSignature({ authToken: undefined, signature: "x", url, params })).resolves.toBe(false);
  });

  it("rebuilds the externally visible URL from proxy headers", () => {
    const headers = new Headers({ "x-forwarded-host": "example.supabase.co", "x-forwarded-proto": "https" });
    expect(externalRequestUrl("http://internal:9000/functions/v1/call-status?callId=abc", headers))
      .toBe("https://example.supabase.co/functions/v1/call-status?callId=abc");
  });
});
