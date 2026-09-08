/**
 * All email bodies for the event system live here so escaping and branding are
 * applied in exactly one place. Every template escapes its inputs itself —
 * callers pass raw values.
 */
import { escapeHeader, escapeHtml, safeAppLink } from "./escape.ts";

export interface RenderedEmail {
  subject: string;
  html: string;
}

export interface TemplateContext {
  appBaseUrl: string;
  /** Prefix added to subjects for synthetic operational tests. */
  test?: boolean;
}

const BRAND_GOLD = "#FACC15";

function layout(title: string, bodyHtml: string, footer?: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#000000;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <h1 style="color:${BRAND_GOLD};font-size:20px;margin:0 0 16px;">${escapeHtml(title)}</h1>
    <div style="background:#111111;border:1px solid #262626;border-radius:12px;padding:20px;font-size:14px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <p style="color:#8a8a8a;font-size:12px;margin-top:16px;">${escapeHtml(footer ?? "CashRidez automated notification.")}</p>
  </div>
</body></html>`;
}

function row(label: string, value: unknown): string {
  return `<p style="margin:4px 0;"><strong style="color:${BRAND_GOLD};">${escapeHtml(label)}:</strong> ${escapeHtml(value ?? "—")}</p>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:20px 0 0;"><a href="${escapeHtml(href)}" style="background:${BRAND_GOLD};color:#000000;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;display:inline-block;">${escapeHtml(label)}</a></p>`;
}

function subject(text: string, ctx: TemplateContext): string {
  const clean = escapeHeader(text);
  return ctx.test ? `[TEST] ${clean}` : clean;
}

/* ------------------------------------------------------------------ admin */

export interface IdVerificationAlertData {
  userName?: string | null;
  userEmail?: string | null;
  role?: string | null;
  submittedAt?: string | null;
  /** Optional short-lived signed admin review link, generated at send time. */
  reviewUrl?: string | null;
}

export function renderIdVerificationAlert(
  data: IdVerificationAlertData,
  ctx: TemplateContext,
): RenderedEmail {
  const body = [
    `<p style="margin:0 0 12px;">A user submitted an ID for verification. The image itself is never attached to this email.</p>`,
    row("Name", data.userName || "Unknown"),
    row("Email", data.userEmail || "Unknown"),
    row("Role", data.role || "Unknown"),
    row("Submitted", data.submittedAt || "just now"),
    data.reviewUrl
      ? button("Open admin review", data.reviewUrl)
      : `<p style="margin:16px 0 0;color:#8a8a8a;">Open the admin dashboard to review this submission.</p>`,
  ].join("\n");
  return {
    subject: subject("ID verification submitted", ctx),
    html: layout("ID verification submitted", body),
  };
}

export interface TripPostedAlertData {
  tripId?: string | null;
  riderName?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  pickupTime?: string | null;
  priceOffer?: number | string | null;
}

export function renderTripPostedAlert(
  data: TripPostedAlertData,
  ctx: TemplateContext,
): RenderedEmail {
  const body = [
    row("Rider", data.riderName || "Unknown"),
    row("Pickup", data.pickupAddress),
    row("Dropoff", data.dropoffAddress),
    row("Pickup time", data.pickupTime),
    row("Rider offer", data.priceOffer ?? "—"),
    row("Trip", data.tripId),
  ].join("\n");
  return {
    subject: subject("New trip posted", ctx),
    html: layout("New trip posted", body),
  };
}

export interface TripAssignedAlertData extends TripPostedAlertData {
  driverName?: string | null;
}

export function renderTripAssignedAlert(
  data: TripAssignedAlertData,
  ctx: TemplateContext,
): RenderedEmail {
  const body = [
    row("Driver", data.driverName || "Unknown"),
    row("Rider", data.riderName || "Unknown"),
    row("Pickup", data.pickupAddress),
    row("Dropoff", data.dropoffAddress),
    row("Pickup time", data.pickupTime),
    row("Trip", data.tripId),
  ].join("\n");
  return {
    subject: subject("Trip connected (open → assigned)", ctx),
    html: layout("Trip connected", body),
  };
}

export interface SubscriptionAlertData {
  userName?: string | null;
  userEmail?: string | null;
  status?: string | null;
  startedAt?: string | null;
}

export function renderSubscriptionAlert(
  data: SubscriptionAlertData,
  ctx: TemplateContext,
): RenderedEmail {
  const body = [
    row("Member", data.userName || "Unknown"),
    row("Email", data.userEmail || "Unknown"),
    row("Status", data.status || "active"),
    row("Started", data.startedAt || "just now"),
  ].join("\n");
  return {
    subject: subject("New membership activated", ctx),
    html: layout("New membership activated", body),
  };
}

export interface SupportAlertData {
  userName?: string | null;
  userEmail?: string | null;
  subjectLine?: string | null;
  body?: string | null;
  ticketId?: string | null;
}

export function renderSupportAlert(data: SupportAlertData, ctx: TemplateContext): RenderedEmail {
  const html = [
    row("From", data.userName || "Unknown"),
    row("Email", data.userEmail || "Unknown"),
    row("Subject", data.subjectLine),
    row("Ticket", data.ticketId),
    `<p style="margin:12px 0 0;white-space:pre-wrap;">${escapeHtml(data.body ?? "")}</p>`,
  ].join("\n");
  return {
    subject: subject(`Support message: ${escapeHeader(data.subjectLine ?? "no subject", 80)}`, ctx),
    html: layout("Support message received", html),
  };
}

/* ------------------------------------------------------------- subscriber */

export interface NewTripEmailData {
  tripId?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  pickupTime?: string | null;
  priceOffer?: number | string | null;
}

export function renderNewTripEmail(data: NewTripEmailData, ctx: TemplateContext): RenderedEmail {
  const link = safeAppLink(`/trip/${data.tripId ?? ""}`, ctx.appBaseUrl);
  const body = [
    `<p style="margin:0 0 12px;">A new trip was posted near you.</p>`,
    row("Pickup", data.pickupAddress),
    row("Dropoff", data.dropoffAddress),
    row("Pickup time", data.pickupTime),
    row("Rider offer", data.priceOffer ?? "—"),
    button("View the trip", link),
  ].join("\n");
  return {
    subject: subject("New trip posted near you", ctx),
    html: layout("New trip near you", body, "You receive this because trip alerts are on for your membership."),
  };
}

export interface RideUpdateEmailData extends NewTripEmailData {
  recipientName?: string | null;
  otherPartyName?: string | null;
  role?: "rider" | "driver";
}

export function renderTripAssignedEmail(
  data: RideUpdateEmailData,
  ctx: TemplateContext,
): RenderedEmail {
  const link = safeAppLink(`/trip/${data.tripId ?? ""}`, ctx.appBaseUrl);
  const other = data.role === "rider" ? "driver" : "rider";
  const body = [
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(data.recipientName || "there")}, your trip is connected.</p>`,
    row(other === "driver" ? "Driver" : "Rider", data.otherPartyName || "Your match"),
    row("Pickup", data.pickupAddress),
    row("Dropoff", data.dropoffAddress),
    row("Pickup time", data.pickupTime),
    button("Open the trip", link),
  ].join("\n");
  return {
    subject: subject("Your trip is connected", ctx),
    html: layout("Trip connected", body),
  };
}

export interface MessageEmailData {
  tripId?: string | null;
  senderName?: string | null;
  recipientName?: string | null;
}

/** Deliberately contains no message content and no phone numbers. */
export function renderTripMessageEmail(
  data: MessageEmailData,
  ctx: TemplateContext,
): RenderedEmail {
  const link = safeAppLink(`/trip/${data.tripId ?? ""}`, ctx.appBaseUrl);
  const body = [
    `<p style="margin:0 0 12px;">Hi ${escapeHtml(data.recipientName || "there")}, you have a new message from ${escapeHtml(data.senderName || "your trip partner")} about your trip.</p>`,
    `<p style="margin:0;color:#8a8a8a;">Message details stay in the app.</p>`,
    button("Read it in the app", link),
  ].join("\n");
  return {
    subject: subject("New message about your trip", ctx),
    html: layout("New trip message", body),
  };
}

export interface MembershipEmailData {
  recipientName?: string | null;
  status?: string | null;
}

export function renderMembershipConfirmationEmail(
  data: MembershipEmailData,
  ctx: TemplateContext,
): RenderedEmail {
  const link = safeAppLink("/subscription", ctx.appBaseUrl);
  const body = [
    `<p style="margin:0 0 12px;">Welcome aboard, ${escapeHtml(data.recipientName || "friend")}. Your CashRidez membership is ${escapeHtml(data.status || "active")}.</p>`,
    `<p style="margin:0;">You now have unlimited connected trips and email alerts for new trips, updates and messages.</p>`,
    button("Manage membership", link),
  ].join("\n");
  return {
    subject: subject("Your CashRidez membership is active", ctx),
    html: layout("Membership active", body),
  };
}

/* ------------------------------------------------------------- dispatcher */

export type AdminTemplateName =
  | "id_verification_submitted"
  | "trip_posted"
  | "trip_assigned"
  | "subscription_activated"
  | "support_message";

export const ADMIN_TEMPLATE_NAMES: readonly AdminTemplateName[] = Object.freeze([
  "id_verification_submitted",
  "trip_posted",
  "trip_assigned",
  "subscription_activated",
  "support_message",
]);

export function renderAdminTemplate(
  name: AdminTemplateName,
  data: Record<string, unknown>,
  ctx: TemplateContext,
): RenderedEmail {
  switch (name) {
    case "id_verification_submitted":
      return renderIdVerificationAlert(data as IdVerificationAlertData, ctx);
    case "trip_posted":
      return renderTripPostedAlert(data as TripPostedAlertData, ctx);
    case "trip_assigned":
      return renderTripAssignedAlert(data as TripAssignedAlertData, ctx);
    case "subscription_activated":
      return renderSubscriptionAlert(data as SubscriptionAlertData, ctx);
    case "support_message":
      return renderSupportAlert(data as SupportAlertData, ctx);
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown admin template: ${String(exhaustive)}`);
    }
  }
}

/** Clearly synthetic sample data for the operational [TEST] events. */
export function syntheticTemplateData(name: AdminTemplateName): Record<string, unknown> {
  const base = {
    userName: "TEST Sample User",
    userEmail: "test-sample@example.invalid",
    riderName: "TEST Sample Rider",
    driverName: "TEST Sample Driver",
    role: "driver",
    status: "active",
    submittedAt: "TEST timestamp",
    startedAt: "TEST timestamp",
    pickupAddress: "TEST 100 Sample St",
    dropoffAddress: "TEST 200 Example Ave",
    pickupTime: "TEST timestamp",
    priceOffer: "0.00",
    tripId: "00000000-0000-4000-8000-000000000000",
    ticketId: "00000000-0000-4000-8000-000000000000",
    subjectLine: "TEST support subject",
    body: "This is a synthetic test message. No real user, trip or subscription exists.",
  };
  return { template: name, ...base };
}

/* --------------------------------------------------- operational [TEST] */

/**
 * The five operational test event types. They exist so each admin template can
 * be exercised end to end without creating a fake user, trip, subscription or
 * support record.
 */
export type TestEventType =
  | "id_uploaded"
  | "trip_posted"
  | "trip_accepted"
  | "new_subscription"
  | "support_message";

export const TEST_EVENT_TYPES: readonly TestEventType[] = Object.freeze([
  "id_uploaded",
  "trip_posted",
  "trip_accepted",
  "new_subscription",
  "support_message",
]);

const TEST_TYPE_TO_TEMPLATE: Record<TestEventType, AdminTemplateName> = {
  id_uploaded: "id_verification_submitted",
  trip_posted: "trip_posted",
  trip_accepted: "trip_assigned",
  new_subscription: "subscription_activated",
  support_message: "support_message",
};

export function isTestEventType(value: unknown): value is TestEventType {
  return typeof value === "string" && (TEST_EVENT_TYPES as readonly string[]).includes(value);
}

export function testTemplateFor(type: TestEventType): AdminTemplateName {
  return TEST_TYPE_TO_TEMPLATE[type];
}

/** Render a synthetic [TEST] alert. Subjects are always prefixed with [TEST]. */
export function renderTestTemplate(type: TestEventType, appBaseUrl: string): RenderedEmail {
  const template = testTemplateFor(type);
  return renderAdminTemplate(template, syntheticTemplateData(template), {
    appBaseUrl,
    test: true,
  });
}
