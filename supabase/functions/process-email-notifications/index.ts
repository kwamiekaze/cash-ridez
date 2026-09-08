/**
 * Bounded email outbox worker.
 *
 * SAFETY MODEL
 *   * The request body is READ AND IGNORED. Invoking this function can do
 *     nothing except process outbox rows that the database already authorised,
 *     which is why verify_jwt = false is acceptable for it.
 *   * No recipient address, subject or body ever comes from the caller. Rows
 *     are claimed with claim_email_events() (service-role only) and every
 *     authoritative row/profile is re-read here.
 *   * Admin alerts are hard-restricted to the fixed three-address allowlist.
 *   * Each (event, recipient) pair is recorded, so a crash mid-run cannot cause
 *     a duplicate send. Transient failures release the event with bounded
 *     exponential backoff; permanent failures stop after 5 attempts.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { sendEmail } from "../_shared/email-sender.ts";
import { adminRecipients, restrictToAdminRecipients } from "../_shared/email/recipients.ts";
import { escapeLog, redactUrl, safeEmailAddress } from "../_shared/email/escape.ts";
import {
  evaluateEmailEligibility,
  evaluateNewTripEligibility,
  type RecipientProfileLike,
} from "../_shared/email/eligibility.ts";
import { PREFERRED_SENDER } from "../_shared/email/sender.ts";
import { isNearbyZip } from "../_shared/geo.ts";
import {
  isTestEventType,
  renderAdminTemplate,
  renderTestTemplate,
  renderMembershipConfirmationEmail,
  renderNewTripEmail,
  renderTripAssignedEmail,
  renderTripMessageEmail,
  type RenderedEmail,
  type TemplateContext,
} from "../_shared/email/templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
/** The only addresses a synthetic [TEST] alert may be delivered to. */
const TEST_RECIPIENTS: readonly string[] = Object.freeze([
  "kwamiekaze@gmail.com",
  "connect@cashridez.com",
]);
const PROFILE_COLUMNS =
  "id, email, full_name, is_verified, is_driver, is_rider, profile_zip, subscription_active, subscription_status, stripe_subscription_id, notification_preferences";

interface Target {
  email: string;
  kind: "admin" | "rider" | "driver" | "subscriber";
  userId?: string | null;
  rendered: RenderedEmail;
}

class RetryableError extends Error {}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);
const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");

const appBaseUrl = (Deno.env.get("APP_BASE_URL") ?? "https://cashridez.com").replace(/\/+$/, "");

function ctx(test = false): TemplateContext {
  return { appBaseUrl, test };
}

async function fetchProfile(id: unknown): Promise<RecipientProfileLike | null> {
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new RetryableError(`profile lookup failed: ${error.message}`);
  return (data as RecipientProfileLike) ?? null;
}

async function fetchRide(id: unknown): Promise<any | null> {
  if (typeof id !== "string" || !id) return null;
  const { data, error } = await supabase
    .from("ride_requests")
    .select("id, rider_id, assigned_driver_id, status, pickup_address, dropoff_address, pickup_time, pickup_zip, price_offer")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new RetryableError(`ride lookup failed: ${error.message}`);
  return data ?? null;
}

function adminTargets(rendered: RenderedEmail): Target[] {
  return restrictToAdminRecipients(adminRecipients()).map((email) => ({
    email,
    kind: "admin" as const,
    rendered,
  }));
}

/** Build the full recipient set for an event. Never trusts the payload. */
async function buildTargets(event: any): Promise<Target[]> {
  const payload = (event?.payload ?? {}) as Record<string, unknown>;
  const targets: Target[] = [];

  switch (event.event_type) {
    case "test_alert": {
      const testType = payload.test_type;
      if (!isTestEventType(testType)) {
        throw new Error(`unknown test type: ${escapeLog(testType)}`);
      }
      // The recipient is re-checked here: it must be on the fixed admin
      // allowlist AND one of the two operational test addresses.
      const requested = restrictToAdminRecipients([payload.recipient]).filter((email) =>
        TEST_RECIPIENTS.includes(email)
      );
      if (requested.length === 0) return [];
      const rendered = renderTestTemplate(testType, appBaseUrl);
      return requested.map((email) => ({ email, kind: "admin" as const, rendered }));
    }

    case "id_verification_submitted": {
      let userId: unknown = payload.user_id;
      let role: unknown = null;
      let submittedAt: unknown = null;
      let reviewKey = typeof payload.user_id === "string" ? payload.user_id : "";

      const submissionId = typeof payload.submission_id === "string" ? payload.submission_id : "";
      if (submissionId) {
        const { data, error } = await supabase
          .from("kyc_submissions")
          .select("id, user_id, role, status, submitted_at")
          .eq("id", submissionId)
          .maybeSingle();
        if (error) throw new RetryableError(`kyc lookup failed: ${error.message}`);
        if (!data) return [];
        userId = data.user_id;
        role = data.role;
        submittedAt = data.submitted_at;
        reviewKey = String(data.id);
      }

      const profile = await fetchProfile(userId);
      if (!profile && !submissionId) return [];
      // Deep link only — the ID image itself is never attached or linked, and
      // the link is never written to the logs.
      const reviewUrl = `${appBaseUrl}/admin?review=${encodeURIComponent(reviewKey)}`;
      return adminTargets(renderAdminTemplate("id_verification_submitted", {
        userName: profile?.full_name,
        userEmail: profile?.email,
        role,
        submittedAt,
        reviewUrl,
      }, ctx()));
    }

    case "trip_posted": {
      const ride = await fetchRide(payload.ride_id);
      if (!ride) return [];
      const rider = await fetchProfile(ride.rider_id);
      const tripData = {
        tripId: ride.id,
        riderName: rider?.full_name,
        pickupAddress: ride.pickup_address,
        dropoffAddress: ride.dropoff_address,
        pickupTime: ride.pickup_time,
        priceOffer: ride.price_offer,
      };
      targets.push(...adminTargets(renderAdminTemplate("trip_posted", tripData, ctx())));

      // Exactly the same targeting as send-new-trip-notification: AVAILABLE
      // drivers with a current ZIP, near the pickup ZIP. We never scan or mail
      // every subscribed driver.
      const { data: statuses, error: statusError } = await supabase
        .from("driver_status")
        .select("user_id, current_zip, state")
        .eq("state", "available")
        .not("current_zip", "is", null);
      if (statusError) throw new RetryableError(`driver status lookup failed: ${statusError.message}`);

      const nearbyIds: string[] = [];
      for (const row of (statuses ?? []) as Array<{ user_id?: unknown; current_zip?: unknown }>) {
        const id = typeof row.user_id === "string" ? row.user_id : null;
        if (!id || id === ride.rider_id) continue;
        if (!isNearbyZip(row.current_zip, ride.pickup_zip)) continue;
        if (!nearbyIds.includes(id)) nearbyIds.push(id);
      }
      if (nearbyIds.length === 0) return targets;

      const { data: drivers, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .in("id", nearbyIds.slice(0, 500));
      if (error) throw new RetryableError(`driver lookup failed: ${error.message}`);

      const driverEmail = renderNewTripEmail(tripData, ctx());
      for (const driver of (drivers ?? []) as RecipientProfileLike[]) {
        // Verified driver + trusted entitlement + all_notifications/new_trips/new_offers.
        const verdict = evaluateNewTripEligibility(driver, { riderId: ride.rider_id });
        if (!verdict.eligible) continue;
        const email = safeEmailAddress(driver.email);
        if (!email) continue;
        targets.push({ email, kind: "driver", userId: driver.id, rendered: driverEmail });
      }
      return targets;
    }

    case "trip_assigned": {
      const ride = await fetchRide(payload.ride_id);
      if (!ride) return [];
      const rider = await fetchProfile(ride.rider_id);
      const driver = await fetchProfile(ride.assigned_driver_id ?? payload.driver_id);
      const shared = {
        tripId: ride.id,
        riderName: rider?.full_name,
        driverName: driver?.full_name,
        pickupAddress: ride.pickup_address,
        dropoffAddress: ride.dropoff_address,
        pickupTime: ride.pickup_time,
        priceOffer: ride.price_offer,
      };
      targets.push(...adminTargets(renderAdminTemplate("trip_assigned", shared, ctx())));

      for (const [profile, role] of [[rider, "rider"], [driver, "driver"]] as const) {
        if (!profile) continue;
        if (!evaluateEmailEligibility(profile, "ride_update").eligible) continue;
        const email = safeEmailAddress(profile.email);
        if (!email) continue;
        targets.push({
          email,
          kind: role,
          userId: profile.id,
          rendered: renderTripAssignedEmail({
            ...shared,
            role,
            recipientName: profile.full_name,
            otherPartyName: role === "rider" ? driver?.full_name : rider?.full_name,
          }, ctx()),
        });
      }
      return targets;
    }

    case "subscription_activated": {
      const profile = await fetchProfile(payload.user_id);
      if (!profile) return [];
      targets.push(...adminTargets(renderAdminTemplate("subscription_activated", {
        userName: profile.full_name,
        userEmail: profile.email,
        status: profile.subscription_status,
      }, ctx())));

      if (evaluateEmailEligibility(profile, "membership").eligible) {
        const email = safeEmailAddress(profile.email);
        if (email) {
          targets.push({
            email,
            kind: "subscriber",
            userId: profile.id,
            rendered: renderMembershipConfirmationEmail(
              { recipientName: profile.full_name, status: profile.subscription_status },
              ctx(),
            ),
          });
        }
      }
      return targets;
    }

    case "support_message": {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, user_id, subject, body")
        .eq("id", String(payload.ticket_id ?? ""))
        .maybeSingle();
      if (error) throw new RetryableError(`support lookup failed: ${error.message}`);
      if (!data) return [];
      const profile = await fetchProfile(data.user_id);
      return adminTargets(renderAdminTemplate("support_message", {
        ticketId: data.id,
        userName: profile?.full_name,
        userEmail: profile?.email,
        subjectLine: data.subject,
        body: data.body,
      }, ctx()));
    }

    case "ride_message": {
      const ride = await fetchRide(payload.ride_id);
      if (!ride) return [];
      const senderId = typeof payload.sender_id === "string" ? payload.sender_id : null;
      const sender = await fetchProfile(senderId);
      const participantIds = [ride.rider_id, ride.assigned_driver_id].filter(
        (id): id is string => typeof id === "string" && id !== senderId,
      );
      for (const id of participantIds) {
        const profile = await fetchProfile(id);
        if (!profile) continue;
        if (!evaluateEmailEligibility(profile, "message").eligible) continue;
        const email = safeEmailAddress(profile.email);
        if (!email) continue;
        targets.push({
          email,
          kind: id === ride.rider_id ? "rider" : "driver",
          userId: profile.id,
          rendered: renderTripMessageEmail({
            tripId: ride.id,
            senderName: sender?.full_name,
            recipientName: profile.full_name,
          }, ctx()),
        });
      }
      return targets;
    }

    default:
      throw new Error(`unsupported event type: ${escapeLog(event.event_type)}`);
  }
}

/**
 * Atomically reserve (event, recipient) BEFORE calling Resend.
 * Returns false when the pair was already sent or is actively being processed
 * by another run, so a crash between "sent" and "recorded" can never produce a
 * duplicate email. Stale reservations are reclaimed by the RPC itself.
 */
async function reserveDelivery(eventId: string, target: Target): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_email_delivery", {
    p_event_id: eventId,
    p_recipient: target.email,
    p_kind: target.kind,
    p_user_id: target.userId ?? null,
  });
  if (error) throw new RetryableError(`delivery reservation failed: ${error.message}`);
  return data === true;
}

async function record(
  eventId: string,
  target: Target,
  status: "sent" | "failed" | "skipped",
  error?: string,
  providerId?: string,
) {
  const { error: rpcError } = await supabase.rpc("record_email_delivery", {
    p_event_id: eventId,
    p_recipient: target.email,
    p_kind: target.kind,
    p_status: status,
    p_user_id: target.userId ?? null,
    p_error: error ? escapeLog(error, 400) : null,
    p_provider_id: providerId ?? null,
  });
  if (rpcError) throw new RetryableError(`delivery record failed: ${rpcError.message}`);
}

async function processEvent(event: any): Promise<{ sent: number; failed: number }> {
  const targets = await buildTargets(event);
  let sent = 0;
  let failed = 0;

  for (const target of targets) {
    if (!(await reserveDelivery(event.id, target))) continue;

    const result = await sendEmail(resend, {
      to: [target.email],
      subject: target.rendered.subject,
      html: target.rendered.html,
      from: PREFERRED_SENDER,
    });

    if (result.success) {
      sent += 1;
      await record(event.id, target, "sent", undefined, result.data?.data?.id ?? null);
    } else {
      failed += 1;
      await record(event.id, target, "failed", result.error);
    }
  }

  if (failed > 0) {
    throw new RetryableError(`${failed} of ${targets.length} recipients failed`);
  }
  return { sent, failed };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // The body is intentionally consumed and discarded: it can influence nothing.
  try {
    await req.text();
  } catch {
    // ignore
  }

  let claimed: any[] = [];
  try {
    const { data, error } = await supabase.rpc("claim_email_events", { p_limit: BATCH_SIZE });
    if (error) throw new Error(error.message);
    claimed = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[PROCESS-EMAIL-NOTIFICATIONS] claim failed:", escapeLog((err as Error)?.message));
    return new Response(JSON.stringify({ error: "claim_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let processed = 0;
  let totalSent = 0;

  for (const event of claimed) {
    try {
      const { sent } = await processEvent(event);
      totalSent += sent;
      processed += 1;
      const { error } = await supabase.rpc("complete_email_event", { p_event_id: event.id });
      if (error) console.error("[PROCESS-EMAIL-NOTIFICATIONS] complete failed:", escapeLog(error.message));
    } catch (err) {
      const retryable = err instanceof RetryableError;
      console.error(
        `[PROCESS-EMAIL-NOTIFICATIONS] event ${escapeLog(event.event_type)} failed (retryable=${retryable}):`,
        escapeLog((err as Error)?.message),
      );
      await supabase.rpc("fail_email_event", {
        p_event_id: event.id,
        p_error: escapeLog((err as Error)?.message, 400),
        p_retryable: retryable,
      });
    }
  }

  console.log(
    `[PROCESS-EMAIL-NOTIFICATIONS] claimed=${claimed.length} processed=${processed} sent=${totalSent} app=${redactUrl(appBaseUrl)}`,
  );

  return new Response(JSON.stringify({ claimed: claimed.length, processed, sent: totalSent }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
};

serve(handler);
