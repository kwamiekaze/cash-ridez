import { describe, expect, it } from "vitest";
import {
  buildApprovalEmail,
  buildDecisionEmail,
  buildRejectionEmail,
  DEFAULT_REJECTION_REASON,
  decisionEmailType,
  decisionIdempotencyKey,
  escapeHtml,
  isSyntheticQueueId,
  MAX_DECISION_ATTEMPTS,
  normalizeDecision,
  PROFILE_URL,
  resolveRejectionReason,
  REVERIFY_URL,
  shouldEnqueueDecision,
  shouldRetry,
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
