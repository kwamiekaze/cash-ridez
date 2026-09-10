import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildApprovalEmail,
  buildDecisionEmail,
  buildRejectionEmail,
  DEFAULT_REJECTION_REASON,
  decisionEmailType,
  decisionIdempotencyKey,
  escapeHtml,
  isStaleClaim,
  isSyntheticQueueId,
  manualResendIdempotencyKey,
  MAX_DECISION_ATTEMPTS,
  normalizeDecision,
  PROFILE_URL,
  resolveRejectionReason,
  REVERIFY_URL,
  senderScopedIdempotencyKey,
  shouldEnqueueDecision,
  shouldRetry,
  STALE_CLAIM_TIMEOUT_MS,
} from "../verification-decision-core.ts";

describe("approval email", () => {
  it("says the ID was accepted and links to the profile page", () => {
    const { subject, html } = buildApprovalEmail("Kwamie", "rider");
    expect(subject).toContain("ID Accepted");
    expect(html).toContain("Your ID has been accepted");
    expect(html).toContain(PROFILE_URL);
    expect(html).toContain("Hi Kwamie");
  });

  it("keeps role specific guidance", () => {
    expect(buildApprovalEmail("A", "driver").html).toContain("vehicle details");
    expect(buildApprovalEmail("A", "rider").html).toContain("trip request");
  });

  it("falls back to a neutral greeting", () => {
    expect(buildApprovalEmail("   ", "rider").html).toContain("Hi there");
  });
});

describe("rejection email", () => {
  it("shows the authoritative reason and links to the re-verification flow", () => {
    const { subject, html } = buildRejectionEmail("Sam", "ID photo was blurry");
    expect(subject).toContain("Rejected");
    expect(html).toContain("it was rejected");
    expect(html).toContain("ID photo was blurry");
    expect(html).toContain(REVERIFY_URL);
  });

  it("uses a professional fallback when the reason is blank", () => {
    expect(buildRejectionEmail("Sam", "   ").html).toContain(
      DEFAULT_REJECTION_REASON,
    );
    expect(resolveRejectionReason(null)).toBe(DEFAULT_REJECTION_REASON);
  });

  it("HTML-escapes names and admin supplied reasons", () => {
    const html = buildRejectionEmail(
      '<img src=x onerror="alert(1)">',
      "<script>alert('x')</script>",
    ).html;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=");
    expect(html).toContain("&lt;script&gt;");
    expect(escapeHtml('a"b')).toBe("a&quot;b");
  });
});

describe("decision routing", () => {
  it("normalizes unknown decisions to approved", () => {
    expect(normalizeDecision("rejected")).toBe("rejected");
    expect(normalizeDecision("weird")).toBe("approved");
    expect(normalizeDecision(undefined)).toBe("approved");
  });

  it("builds the matching template", () => {
    expect(
      buildDecisionEmail("rejected", { firstName: "A", rejectionReason: "R" })
        .html,
    ).toContain("R");
    expect(buildDecisionEmail("approved", { firstName: "A", isDriver: true }).html)
      .toContain(PROFILE_URL);
  });

  it("maps email log types", () => {
    expect(decisionEmailType("rejected", "driver")).toBe("verification_rejected");
    expect(decisionEmailType("approved", "driver")).toBe(
      "verification_welcome_driver",
    );
    expect(decisionEmailType("approved", "rider")).toBe(
      "verification_welcome_rider",
    );
  });
});

describe("per-event idempotency", () => {
  it("keys on the queue row, not the user", () => {
    expect(decisionIdempotencyKey("q1")).toBe("verification-decision-q1");
    expect(decisionIdempotencyKey("q1")).not.toBe(decisionIdempotencyKey("q2"));
  });

  it("recognises synthetic ids from direct invocations", () => {
    expect(isSyntheticQueueId("direct-abc")).toBe(true);
    expect(isSyntheticQueueId("test-abc")).toBe(true);
    expect(isSyntheticQueueId("6f0f-real-uuid")).toBe(false);
  });

  it("bounds retries", () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(MAX_DECISION_ATTEMPTS - 1)).toBe(false);
  });
});

describe("transition enqueueing", () => {
  it("enqueues new approvals and rejections", () => {
    expect(shouldEnqueueDecision("pending", "approved")).toBe(true);
    expect(shouldEnqueueDecision("pending", "rejected")).toBe(true);
    expect(shouldEnqueueDecision("rejected", "approved")).toBe(true);
    expect(shouldEnqueueDecision("approved", "rejected")).toBe(true);
    expect(shouldEnqueueDecision(null, "approved")).toBe(true);
  });

  it("never re-enqueues an unchanged historical decision", () => {
    expect(shouldEnqueueDecision("approved", "approved")).toBe(false);
    expect(shouldEnqueueDecision("rejected", "rejected")).toBe(false);
    expect(shouldEnqueueDecision("approved", "pending")).toBe(false);
    expect(shouldEnqueueDecision("pending", "pending")).toBe(false);
  });
});

describe("provider idempotency wiring", () => {
  it("gives every sender attempt its own scoped key", () => {
    const base = decisionIdempotencyKey("queue-1");
    const keys = [0, 1, 2].map((i) => senderScopedIdempotencyKey(base, i));
    expect(new Set(keys).size).toBe(3);
    keys.forEach((k) => expect(k.startsWith(base)).toBe(true));
  });

  it("passes a scoped key to the Resend SDK options argument", async () => {
    const source = readFileSync(
      new URL("../email-sender.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("idempotencyKey?: string");
    expect(source).toContain("senderScopedIdempotencyKey(idempotencyKey, i)");
    expect(source).toContain("resend.emails.send(emailPayload, sendOptions)");

    const worker = readFileSync(
      new URL("../../send-verification-welcome-email/index.ts", import.meta.url),
      "utf8",
    );
    // The queue decision key reaches the sender.
    expect(worker).toMatch(/sendEmail\(resend, \{[\s\S]*idempotencyKey,[\s\S]*\}\)/);
  });

  it("makes each explicit admin resend unique but queue decisions stable", () => {
    expect(decisionIdempotencyKey("q1")).toBe(decisionIdempotencyKey("q1"));
    expect(manualResendIdempotencyKey("u1", "n1")).not.toBe(
      manualResendIdempotencyKey("u1", "n2"),
    );
    expect(manualResendIdempotencyKey("u1")).not.toBe(
      manualResendIdempotencyKey("u1"),
    );
  });
});

describe("stale claim recovery", () => {
  const now = Date.parse("2026-09-10T12:00:00Z");
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  it("recovers a claim older than the timeout", () => {
    expect(isStaleClaim(iso(STALE_CLAIM_TIMEOUT_MS + 1000), 0, now)).toBe(true);
  });

  it("leaves fresh claims alone", () => {
    expect(isStaleClaim(iso(60_000), 0, now)).toBe(false);
    expect(isStaleClaim(null, 0, now)).toBe(false);
    expect(isStaleClaim("not-a-date", 0, now)).toBe(false);
  });

  it("does not revive a row that already exhausted its attempts", () => {
    expect(
      isStaleClaim(iso(STALE_CLAIM_TIMEOUT_MS * 4), MAX_DECISION_ATTEMPTS, now),
    ).toBe(false);
  });

  it("only touches 'sending' rows and respects the attempt bound in SQL", () => {
    const worker = readFileSync(
      new URL("../../send-verification-welcome-email/index.ts", import.meta.url),
      "utf8",
    );
    expect(worker).toContain('.eq("status", "sending")');
    expect(worker).toContain('.lt("attempts", MAX_DECISION_ATTEMPTS)');
    expect(worker).toContain("recoverStaleClaims(supabase)");
    expect(worker).not.toContain("skipped_backlog");
  });
});

describe("direct request authorization", () => {
  const worker = readFileSync(
    new URL("../../send-verification-welcome-email/index.ts", import.meta.url),
    "utf8",
  );

  it("rejects unauthenticated direct/status requests", () => {
    expect(worker).toContain("const needsAdmin = body.action === \"status\" || Boolean(body.userId)");
    expect(worker).toContain("requireAdmin(req, supabase)");
    expect(worker).toContain('deny(401, "Unauthorized")');
    expect(worker).toContain('deny(403, "Admin role required")');
    expect(worker).toContain('service.rpc("has_role"');
  });

  it("keeps the unauthenticated cron queue processor", () => {
    expect(worker).toContain("claimBatch(supabase)");
    // needsAdmin is false for an empty body, so the queue path stays open.
    expect(worker).not.toContain("requireAdmin(req, supabase);\n    const queueItems");
  });

  it("ignores caller-supplied recipient/name/role/decision/reason", () => {
    expect(worker).toContain('user_email: profile.email');
    expect(worker).toContain('decision: normalizeDecision(profile.verification_status)');
    expect(worker).toContain('rejection_reason: profile.verification_notes ?? null');
    expect(worker).not.toContain("user_email: userEmail");
    expect(worker).not.toContain("first_name: firstName,\n          is_driver: isDriver");
  });
});

describe("rapid repeated decisions", () => {
  it("enqueues each distinct transition in a rejected -> approved -> rejected burst", () => {
    const burst: Array<[string, string]> = [
      ["pending", "rejected"],
      ["rejected", "approved"],
      ["approved", "rejected"],
    ];
    expect(burst.every(([a, b]) => shouldEnqueueDecision(a, b))).toBe(true);
    // Each event gets its own queue UUID, so keys never collide.
    const keys = ["q1", "q2", "q3"].map(decisionIdempotencyKey);
    expect(new Set(keys).size).toBe(3);
  });
});
