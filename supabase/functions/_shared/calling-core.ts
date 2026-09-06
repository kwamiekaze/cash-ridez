/**
 * Dependency-injected core for CashRidez masked calling.
 *
 * Everything that decides WHO gets dialed, WHICH record is written and WHAT a
 * callback means lives here so it can be tested without Deno, Twilio or a real
 * database. `call-start`, `call-voice` and `call-status` are thin wrappers.
 *
 * Invariants enforced here (and, authoritatively, by docs/pending-migrations/
 * calling.sql — this module refuses to run without those RPCs):
 *  - FAIL CLOSED: no `calls` row is inserted and no Twilio call is created
 *    unless a reservation RPC granted a fencing token;
 *  - the recipient is derived from the stored initiator + the trip's CURRENT
 *    participants, never from a query parameter;
 *  - callbacks are rejected before any DB use unless the Twilio signature over
 *    the canonical URL is valid, the AccountSid matches and every identifier
 *    passes strict format validation;
 *  - a SID is bound only after Twilio confirms account + parent ownership, and
 *    binding/transitions happen inside service-role-only atomic RPCs;
 *  - a completed PARENT leg never implies the recipient answered.
 */

import {
  escapeXml,
  isValidUsE164,
  maskPhone,
  resolveParticipantPhone,
  type ResolvedPhone,
} from "./phone.ts";

export type Json = Record<string, any>;

export interface TwilioCallRef {
  sid: string;
  accountSid?: string | null;
  parentCallSid?: string | null;
  status?: string | null;
  to?: string | null;
  from?: string | null;
  uri?: string | null;
}

export interface TwilioPort {
  createCall(params: {
    to: string;
    from: string;
    url: string;
    statusCallback: string;
    statusCallbackMethod: string;
    statusCallbackEvent: string[];
    method: string;
  }): Promise<TwilioCallRef>;
  fetchCall(sid: string): Promise<TwilioCallRef>;
  /** Best-effort hangup of a call we created but could not safely own. */
  cancelCall?(sid: string): Promise<void>;
}

export interface CallingEnv {
  supabaseUrl?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
}

export interface CallingDeps {
  /** Service-role Supabase client (or a compatible mock). */
  supabase: any;
  twilio: TwilioPort;
  env: CallingEnv;
  now?: () => Date;
}

/** Transient problem — the caller should retry (503). */
export class RetryableCallError extends Error {}

/**
 * The pending calling migration is not applied. This is NEVER downgraded into
 * a degraded path: without the RPCs, calling is off.
 */
export class MissingDependencyError extends Error {}

export interface StartResult {
  status: number;
  body: Json;
}

const CALL_LEASE_SECONDS = 90;

export const SID_RE = /^CA[0-9a-f]{32}$/;
export const ACCOUNT_SID_RE = /^AC[0-9a-f]{32}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSid(v: unknown): v is string {
  return typeof v === "string" && SID_RE.test(v);
}
export function isValidAccountSid(v: unknown): v is string {
  return typeof v === "string" && ACCOUNT_SID_RE.test(v);
}
export function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
/** Twilio durations are whole non-negative seconds, bounded to 24h. */
export function parseDurationSeconds(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  if (!/^\d{1,6}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 86400) return null;
  return n;
}

function nowIso(deps: CallingDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function err(code: string, message: string, status = 400): StartResult {
  return { status, body: { success: false, code, error: message } };
}

function isMissingRpc(error: any): boolean {
  const code = error?.code ?? "";
  const message = String(error?.message ?? "");
  return code === "PGRST202" || code === "42883" || /could not find the function/i.test(message);
}

// ---------------------------------------------------------------------------
// Phone resolution (shared by start and voice)
// ---------------------------------------------------------------------------

/** Admin phone override lookup. Tolerates the column/table not existing yet. */
async function loadAdminOverride(deps: CallingDeps, userId: string): Promise<string | null> {
  try {
    const { data, error } = await deps.supabase
      .from("admin_user_notes")
      .select("phone_override")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return (data as any)?.phone_override ?? null;
  } catch {
    return null;
  }
}

export interface ParticipantPhones {
  rider: ResolvedPhone;
  driver: ResolvedPhone;
}

/**
 * Canonical resolution used by BOTH call-start and the voice bridge, so the
 * number validated at start is the number dialed at bridge time.
 */
export async function resolveTripPhones(
  deps: CallingDeps,
  trip: { rider_id: string; assigned_driver_id: string; rider_note?: string | null },
): Promise<ParticipantPhones> {
  const { data: profiles, error } = await deps.supabase
    .from("profiles")
    .select("id, phone_number")
    .in("id", [trip.rider_id, trip.assigned_driver_id]);

  if (error) throw new RetryableCallError(`Profile lookup failed: ${error.message}`);
  const list: any[] = profiles ?? [];

  const riderProfile = list.find((p) => p.id === trip.rider_id);
  const driverProfile = list.find((p) => p.id === trip.assigned_driver_id);

  const [riderOverride, driverOverride] = await Promise.all([
    loadAdminOverride(deps, trip.rider_id),
    loadAdminOverride(deps, trip.assigned_driver_id),
  ]);

  return {
    rider: resolveParticipantPhone({
      profilePhone: riderProfile?.phone_number,
      adminOverride: riderOverride,
      riderNote: trip.rider_note ?? null,
    }),
    driver: resolveParticipantPhone({
      profilePhone: driverProfile?.phone_number,
      adminOverride: driverOverride,
      // The rider note contact belongs to the RIDER only.
      riderNote: null,
    }),
  };
}

// ---------------------------------------------------------------------------
// Reservations — mandatory, no degraded path
// ---------------------------------------------------------------------------

export type ReservationOutcome = "granted" | "busy" | "rate_limited";

export async function reserveCallSlot(
  deps: CallingDeps,
  args: { actorId: string; tripId: string; leaseSeconds?: number },
): Promise<{ outcome: ReservationOutcome; token?: string }> {
  const { data, error } = await deps.supabase.rpc("reserve_call_slot", {
    p_actor_id: args.actorId,
    p_trip_id: args.tripId,
    p_lease_seconds: args.leaseSeconds ?? CALL_LEASE_SECONDS,
  });
  if (error) {
    if (isMissingRpc(error)) {
      throw new MissingDependencyError("reserve_call_slot is missing — apply the calling migration");
    }
    throw new RetryableCallError(`Call reservation failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const outcome = (row?.outcome ?? row) as ReservationOutcome;
  if (outcome === "granted") {
    const token = row?.token;
    if (!isValidUuid(token)) {
      throw new RetryableCallError("Reservation returned no usable token");
    }
    return { outcome, token };
  }
  if (outcome === "busy" || outcome === "rate_limited") return { outcome };
  throw new RetryableCallError(`Unexpected reservation outcome: ${String(outcome)}`);
}

/** Token-specific release. Never releases a lease we do not own. */
export async function releaseCallSlot(deps: CallingDeps, token?: string | null): Promise<void> {
  if (!token) return;
  try {
    const { error } = await deps.supabase.rpc("release_call_slot", { p_token: token });
    if (error && !isMissingRpc(error)) {
      console.error("[calling] release_call_slot failed:", error.message);
    }
  } catch (e: any) {
    console.error("[calling] release_call_slot threw:", e?.message ?? e);
  }
}

/** Marks a reservation as actually dialed (rate guard counts these only). */
async function confirmCallAttempt(deps: CallingDeps, token: string): Promise<void> {
  try {
    await deps.supabase.rpc("confirm_call_attempt", { p_token: token });
  } catch (e: any) {
    console.error("[calling] confirm_call_attempt failed:", e?.message ?? e);
  }
}

/**
 * Stamp the call failed and release the lease. Best effort by design: it is
 * only ever called while a PRIMARY failure is being reported, and must never
 * mask it.
 */
export async function stampFailedAndRelease(
  deps: CallingDeps,
  callId: string,
  token: string | null | undefined,
): Promise<void> {
  try {
    const { error } = await deps.supabase.rpc("fail_call", {
      p_call_id: callId,
      p_token: token ?? null,
      p_reason: "start_failed",
    });
    if (error) console.error("[calling] fail_call failed:", error.message);
  } catch (e: any) {
    console.error("[calling] fail_call threw:", e?.message ?? e);
  }
  // fail_call already releases, but a missing/failed RPC must not leak a lease.
  await releaseCallSlot(deps, token);
}

async function bestEffortCancel(deps: CallingDeps, sid: string): Promise<void> {
  try {
    await deps.twilio.cancelCall?.(sid);
  } catch (e: any) {
    console.error("[calling] Twilio cancel failed:", e?.message ?? e);
  }
}

// ---------------------------------------------------------------------------
// Atomic leg binding / transitions (RPC only — no direct SELECT/UPDATE)
// ---------------------------------------------------------------------------

export type BindResult =
  | "bound"
  | "already_bound"
  | "leg_conflict"
  | "sid_taken"
  | "parent_mismatch"
  | "not_a_parent_leg"
  | "token_mismatch"
  | "trip_mismatch"
  | "unknown_call";

export async function bindCallLegSid(
  deps: CallingDeps,
  args: {
    callId: string;
    leg: "parent" | "child";
    sid: string;
    accountSid: string;
    parentSid?: string | null;
    tripId?: string | null;
    token?: string | null;
  },
): Promise<BindResult> {
  const { data, error } = await deps.supabase.rpc("bind_call_leg_sid", {
    p_call_id: args.callId,
    p_leg: args.leg,
    p_sid: args.sid,
    p_account_sid: args.accountSid,
    p_parent_sid: args.parentSid ?? null,
    p_trip_id: args.tripId ?? null,
    p_token: args.token ?? null,
  });
  if (error) {
    if (isMissingRpc(error)) {
      throw new MissingDependencyError("bind_call_leg_sid is missing — apply the calling migration");
    }
    throw new RetryableCallError(`SID binding failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const result = (row?.bind_call_leg_sid ?? row) as BindResult;
  if (typeof result !== "string") throw new RetryableCallError("SID binding returned no result");
  return result;
}

export interface LegStatusApplication {
  result: "applied" | "duplicate" | "out_of_order" | "ignored_source" | "sid_mismatch" | "unknown_call";
  aggregate_status?: string | null;
  parent_status?: string | null;
  child_status?: string | null;
  bridged?: boolean | null;
}

export async function applyLegStatus(
  deps: CallingDeps,
  args: {
    callId: string;
    leg: "parent" | "child";
    sid: string;
    accountSid: string;
    status: string;
    source: "parent_status" | "child_status" | "dial_action";
    duration?: number | null;
  },
): Promise<LegStatusApplication> {
  const { data, error } = await deps.supabase.rpc("apply_call_leg_status", {
    p_call_id: args.callId,
    p_leg: args.leg,
    p_sid: args.sid,
    p_account_sid: args.accountSid,
    p_status: args.status,
    p_source: args.source,
    p_duration: args.duration ?? null,
  });
  if (error) {
    if (isMissingRpc(error)) {
      throw new MissingDependencyError("apply_call_leg_status is missing — apply the calling migration");
    }
    throw new RetryableCallError(`Call status update failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as LegStatusApplication | null;
  if (!row?.result) throw new RetryableCallError("Call status update returned no result");
  return row;
}

// ---------------------------------------------------------------------------
// call-start
// ---------------------------------------------------------------------------

export async function startMaskedCall(
  deps: CallingDeps,
  args: { userId: string; tripId: string },
): Promise<StartResult> {
  const { supabaseUrl, twilioAccountSid, twilioAuthToken, twilioPhoneNumber } = deps.env;

  // 1. Configuration is checked BEFORE any reservation or record is created.
  if (!supabaseUrl || !twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    return err("SERVER_CONFIG_ERROR", "Server configuration error. Please contact support.", 500);
  }
  if (!isValidAccountSid(twilioAccountSid)) {
    return err("SERVER_CONFIG_ERROR", "Server configuration error. Please contact support.", 500);
  }
  if (!args.tripId || !isValidUuid(args.tripId)) {
    return err("INVALID_REQUEST", "Trip ID is required.", 400);
  }

  const { data: trip, error: tripError } = await deps.supabase
    .from("ride_requests")
    .select("id, status, rider_id, assigned_driver_id, rider_note")
    .eq("id", args.tripId)
    .maybeSingle();

  if (tripError) throw new RetryableCallError(`Trip lookup failed: ${tripError.message}`);
  if (!trip) return err("TRIP_NOT_FOUND", "Trip not found. It may have been cancelled.", 404);
  if (trip.status !== "assigned") {
    return err("TRIP_NOT_ASSIGNED", "This trip must be assigned before you can make a call.", 400);
  }
  if (args.userId !== trip.rider_id && args.userId !== trip.assigned_driver_id) {
    return err("NOT_PARTICIPANT", "You are not a participant in this trip.", 403);
  }

  // 2. Both numbers must resolve BEFORE a reservation is taken.
  const phones = await resolveTripPhones(deps, trip);
  const isRider = args.userId === trip.rider_id;
  const initiator = isRider ? phones.rider : phones.driver;
  const recipient = isRider ? phones.driver : phones.rider;

  if (!initiator.phone) {
    return err(
      "NO_USER_PHONE",
      "Please add your carrier phone number to your profile to use in-app calling.",
      400,
    );
  }
  if (!recipient.phone) {
    return isRider
      ? err("NO_DRIVER_PHONE", "The driver hasn't added a phone number to their profile yet.", 400)
      : err(
        "NO_RIDER_PHONE",
        "The rider hasn't provided a valid phone number. Please ask them to update their contact info.",
        400,
      );
  }
  if (!isValidUsE164(initiator.phone) || !isValidUsE164(recipient.phone)) {
    return err("INVALID_PHONE_FORMAT", "The phone number format is invalid.", 400);
  }

  // 3. Reservation. A missing RPC throws MissingDependencyError: calling is OFF
  //    until the migration is applied — we never insert or dial without a token.
  const reservation = await reserveCallSlot(deps, { actorId: args.userId, tripId: trip.id });
  if (reservation.outcome === "busy") {
    return err("CALL_IN_PROGRESS", "A call for this trip is already being connected.", 409);
  }
  if (reservation.outcome === "rate_limited") {
    return err("RATE_LIMITED", "Too many calls. Please wait a few minutes before trying again.", 429);
  }
  const token = reservation.token!;

  // 4. Record. The fencing token is persisted so every later mutation can prove
  //    it belongs to THIS attempt.
  const { data: callRecord, error: callError } = await deps.supabase
    .from("calls")
    .insert({
      trip_id: trip.id,
      rider_id: trip.rider_id,
      driver_id: trip.assigned_driver_id,
      initiated_by_user_id: args.userId,
      status: "initiated",
      reservation_token: token,
    })
    .select()
    .single();

  if (callError || !callRecord) {
    await releaseCallSlot(deps, token);
    throw new RetryableCallError(`Call record insert failed: ${callError?.message ?? "no row"}`);
  }

  const base = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;

  let created: TwilioCallRef;
  try {
    created = await deps.twilio.createCall({
      to: initiator.phone,
      from: twilioPhoneNumber,
      url: `${base}/call-voice?callId=${encodeURIComponent(callRecord.id)}`,
      statusCallback: `${base}/call-status?callId=${encodeURIComponent(callRecord.id)}&cb=parent`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      method: "POST",
    });
  } catch (twilioError: any) {
    await stampFailedAndRelease(deps, callRecord.id, token);
    return mapTwilioStartError(twilioError);
  }

  await confirmCallAttempt(deps, token);

  // 5. Verify + bind. Any failure here stamps the record failed, releases the
  //    lease and best-effort cancels the call we just created.
  try {
    if (!isValidSid(created.sid)) throw new RetryableCallError("Twilio returned an invalid call SID");

    let ref: TwilioCallRef;
    try {
      ref = await deps.twilio.fetchCall(created.sid);
    } catch (e: any) {
      throw new RetryableCallError(`Could not verify call SID with Twilio: ${e?.message ?? e}`);
    }
    if (ref.sid !== created.sid) throw new RetryableCallError("Twilio returned a different call SID");
    if (ref.accountSid && ref.accountSid !== twilioAccountSid) {
      throw new RetryableCallError("Call SID belongs to a different Twilio account");
    }
    if (ref.parentCallSid) throw new RetryableCallError("Refusing to bind a child leg as the parent leg");

    const bound = await bindCallLegSid(deps, {
      callId: callRecord.id,
      leg: "parent",
      sid: created.sid,
      accountSid: twilioAccountSid,
      parentSid: null,
      tripId: trip.id,
      token,
    });
    if (bound !== "bound" && bound !== "already_bound") {
      throw new RetryableCallError(`Parent leg could not be bound: ${bound}`);
    }
  } catch (e) {
    await bestEffortCancel(deps, created.sid);
    await stampFailedAndRelease(deps, callRecord.id, token);
    if (e instanceof MissingDependencyError) throw e;
    if (e instanceof RetryableCallError) throw e;
    throw new RetryableCallError(String((e as any)?.message ?? e));
  }

  return {
    status: 200,
    body: {
      success: true,
      call_id: callRecord.id,
      message: "Call initiated. Answer the incoming call from our CashRidez number.",
    },
  };
}

function mapTwilioStartError(twilioError: any): StartResult {
  const code = twilioError?.code;
  const message = String(twilioError?.message ?? "");
  if (code === 21211 || /invalid phone/i.test(message)) {
    return err("INVALID_PHONE_FORMAT", "The phone number format is invalid.", 400);
  }
  if (code === 21214 || /not a valid/i.test(message)) {
    return err("INVALID_DESTINATION_NUMBER", "The phone number is not valid.", 400);
  }
  if (code === 21215) {
    return err("TWILIO_UNAVAILABLE", "Cannot reach this phone number. Please verify it's correct.", 400);
  }
  if (code === 20429 || /rate/i.test(message)) {
    return err("RATE_LIMITED", "Too many calls. Please wait a few minutes before trying again.", 429);
  }
  return err("TWILIO_ERROR", "Unable to start the call right now. Please try again later.", 500);
}

// ---------------------------------------------------------------------------
// call-voice
// ---------------------------------------------------------------------------

export const TWIML_CONTENT_TYPE = "text/xml; charset=utf-8";

export function voicemailRedirectTwiml(supabaseUrl: string): string {
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/call-inbound-voicemail`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(url)}</Redirect>
</Response>`;
}

export function hangupTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
}

/**
 * The <Dial> ACTION url reports DialCallStatus for the dial as a whole; the
 * <Number> statusCallback reports the CHILD leg's own CallStatus. They are
 * different events with different parameter names and are therefore routed to
 * distinct, separately signed URLs.
 */
export function dialTwiml(opts: {
  callerId: string;
  recipient: string;
  actionUrl: string;
  childStatusUrl: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(opts.callerId)}" action="${
    escapeXml(opts.actionUrl)
  }" method="POST" answerOnBridge="true">
    <Number statusCallback="${
    escapeXml(opts.childStatusUrl)
  }" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${
    escapeXml(opts.recipient)
  }</Number>
  </Dial>
</Response>`;
}

export interface WebhookRequest {
  method: string;
  contentType: string;
  params: Record<string, string>;
  query: URLSearchParams;
  signatureValid: boolean;
}

export interface TwimlResult {
  status: number;
  twiml: string;
}

export async function handleVoiceWebhook(deps: CallingDeps, req: WebhookRequest): Promise<TwimlResult> {
  const supabaseUrl = deps.env.supabaseUrl ?? "";

  // Signature + transport checks happen BEFORE any database use.
  if (req.method !== "POST" || !req.contentType.includes("application/x-www-form-urlencoded")) {
    return { status: 405, twiml: hangupTwiml() };
  }
  if (!req.signatureValid) return { status: 403, twiml: hangupTwiml() };
  const accountSid = deps.env.twilioAccountSid;
  if (!isValidAccountSid(accountSid) || req.params.AccountSid !== accountSid) {
    return { status: 403, twiml: hangupTwiml() };
  }

  const callId = req.query.get("callId");

  // TRUE inbound / call-center fallback: no callId at all, authenticated above.
  if (!callId) return { status: 200, twiml: voicemailRedirectTwiml(supabaseUrl) };

  // From here on this is a masked call. Any problem hangs up — we never send a
  // masked-call participant into the call-center voicemail recorder.
  if (!isValidUuid(callId)) return { status: 400, twiml: hangupTwiml() };

  const incomingSid = req.params.CallSid ?? "";
  if (!isValidSid(incomingSid)) return { status: 400, twiml: hangupTwiml() };

  const { data: call, error } = await deps.supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle();
  // DB trouble is retryable: 503 lets Twilio retry instead of silently
  // swallowing the request with a 200 hangup.
  if (error) throw new RetryableCallError(`Call lookup failed: ${error.message}`);
  if (!call) return { status: 404, twiml: hangupTwiml() };

  const initiatorRole: "rider" | "driver" = call.initiated_by_user_id === call.rider_id ? "rider" : "driver";
  const parentField = initiatorRole === "rider" ? "twilio_call_sid_rider" : "twilio_call_sid_driver";
  const storedParent: string | null = call[parentField] ?? null;

  // The caller MUST be the parent leg of this record, confirmed against Twilio.
  if (storedParent) {
    if (storedParent !== incomingSid) return { status: 403, twiml: hangupTwiml() };
  }

  let ref: TwilioCallRef;
  try {
    ref = await deps.twilio.fetchCall(incomingSid);
  } catch (e: any) {
    throw new RetryableCallError(`Could not verify inbound leg with Twilio: ${e?.message ?? e}`);
  }
  if (ref.sid !== incomingSid || (ref.accountSid && ref.accountSid !== accountSid) || ref.parentCallSid) {
    return { status: 403, twiml: hangupTwiml() };
  }
  if (ref.from && deps.env.twilioPhoneNumber && ref.from !== deps.env.twilioPhoneNumber) {
    return { status: 403, twiml: hangupTwiml() };
  }
  if (req.params.To && ref.to && req.params.To !== ref.to) {
    return { status: 403, twiml: hangupTwiml() };
  }

  if (!storedParent) {
    // Callback beat the REST response: bind atomically before bridging.
    const bound = await bindCallLegSid(deps, {
      callId: call.id,
      leg: "parent",
      sid: incomingSid,
      accountSid,
      parentSid: null,
      tripId: call.trip_id,
      token: call.reservation_token ?? null,
    });
    if (bound !== "bound" && bound !== "already_bound") {
      await stampFailedAndRelease(deps, call.id, call.reservation_token);
      return { status: 403, twiml: hangupTwiml() };
    }
  }

  // Re-check the trip: it may have been reassigned or cancelled since start.
  const { data: trip, error: tripError } = await deps.supabase
    .from("ride_requests")
    .select("id, status, rider_id, assigned_driver_id, rider_note")
    .eq("id", call.trip_id)
    .maybeSingle();
  if (tripError) throw new RetryableCallError(`Trip lookup failed: ${tripError.message}`);

  const abort = async (reason: string): Promise<TwimlResult> => {
    console.warn(`[call-voice] Aborting masked call ${call.id}: ${reason}`);
    await stampFailedAndRelease(deps, call.id, call.reservation_token);
    return { status: 200, twiml: hangupTwiml() };
  };

  if (!trip || trip.status !== "assigned") return await abort("trip not assigned");
  if (trip.rider_id !== call.rider_id || trip.assigned_driver_id !== call.driver_id) {
    return await abort("participants changed");
  }

  // Recipient is derived from the stored initiator, NOT from any query param.
  const phones = await resolveTripPhones(deps, trip);
  const recipient = call.initiated_by_user_id === trip.rider_id ? phones.driver : phones.rider;
  const callerId = deps.env.twilioPhoneNumber;

  if (!recipient.phone || !isValidUsE164(recipient.phone) || !callerId) {
    console.warn(`[call-voice] No dialable recipient for call ${call.id} (${maskPhone(recipient.phone)})`);
    return await abort("no dialable recipient");
  }

  const fnBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/call-status?callId=${
    encodeURIComponent(call.id)
  }`;

  return {
    status: 200,
    twiml: dialTwiml({
      callerId,
      recipient: recipient.phone,
      actionUrl: `${fnBase}&cb=dial`,
      childStatusUrl: `${fnBase}&cb=child`,
    }),
  };
}

// ---------------------------------------------------------------------------
// call-status
// ---------------------------------------------------------------------------

const NORMALIZED: Record<string, string> = {
  queued: "initiated",
  initiated: "initiated",
  ringing: "ringing",
  answered: "in_progress",
  "in-progress": "in_progress",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  "no-answer": "no_answer",
  canceled: "canceled",
};

export function normalizeCallStatus(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return NORMALIZED[raw] ?? null;
}

const RANK: Record<string, number> = {
  initiated: 1,
  ringing: 2,
  in_progress: 3,
  completed: 4,
  busy: 4,
  failed: 4,
  no_answer: 4,
  canceled: 4,
};

export function statusRank(normalized: string | undefined | null): number {
  if (!normalized) return 0;
  return RANK[normalized] ?? 0;
}

const CHILD_FAILURE = new Set(["busy", "no_answer", "failed", "canceled"]);

/**
 * The overall call outcome. Mirrors public.derive_call_status — the DATABASE is
 * authoritative; this exists for tests and for reasoning about the contract.
 *
 * Honesty rules:
 *  - a completed PARENT leg with no child evidence is `unknown`, never
 *    `no_answer` and never `completed`;
 *  - a child that completed without ever reporting in-progress is
 *    `carrier_answered`: the carrier picked up, which may have been voicemail.
 *    Twilio cannot prove a human answered.
 */
export function deriveOverallStatus(state: {
  parent?: string | null;
  child?: string | null;
  bridged?: boolean;
}): string {
  const child = state.child ?? null;
  const parent = state.parent ?? null;
  const bridged = state.bridged === true;
  if (child && CHILD_FAILURE.has(child)) return child;
  if (child === "in_progress") return "in_progress";
  if (child === "completed") return bridged ? "completed" : "carrier_answered";
  if (child === "ringing") return "ringing";
  if (bridged && parent === "completed") return "completed";
  if (parent === "completed") return "unknown";
  if (parent) return parent;
  return "initiated";
}

export interface StatusResult {
  status: number;
  body: Json;
}

export async function handleStatusCallback(deps: CallingDeps, req: WebhookRequest): Promise<StatusResult> {
  if (req.method !== "POST" || !req.contentType.includes("application/x-www-form-urlencoded")) {
    return { status: 405, body: { error: "method_not_allowed" } };
  }
  if (!req.signatureValid) return { status: 403, body: { error: "invalid_signature" } };
  const accountSid = deps.env.twilioAccountSid;
  if (!isValidAccountSid(accountSid) || req.params.AccountSid !== accountSid) {
    return { status: 403, body: { error: "account_mismatch" } };
  }
  if (!isValidAccountSid(req.params.AccountSid)) {
    return { status: 400, body: { error: "invalid_account_sid" } };
  }

  const callId = req.query.get("callId");
  if (!callId) return { status: 400, body: { error: "missing_call_id" } };
  if (!isValidUuid(callId)) return { status: 400, body: { error: "invalid_call_id" } };

  const cb = req.query.get("cb");
  if (cb !== "parent" && cb !== "child" && cb !== "dial") {
    return { status: 400, body: { error: "invalid_callback_kind" } };
  }

  const incomingSid = req.params.CallSid ?? "";
  if (!isValidSid(incomingSid)) return { status: 400, body: { error: "invalid_call_sid" } };
  const parentSidParam = req.params.ParentCallSid || null;
  if (parentSidParam && !isValidSid(parentSidParam)) {
    return { status: 400, body: { error: "invalid_parent_call_sid" } };
  }

  const { data: call, error } = await deps.supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw new RetryableCallError(`Call lookup failed: ${error.message}`);
  if (!call) return { status: 404, body: { error: "unknown_call" } };

  const initiatorRole: "rider" | "driver" = call.initiated_by_user_id === call.rider_id ? "rider" : "driver";
  const parentField = initiatorRole === "rider" ? "twilio_call_sid_rider" : "twilio_call_sid_driver";
  const childField = initiatorRole === "rider" ? "twilio_call_sid_driver" : "twilio_call_sid_rider";
  const storedParent: string | null = call[parentField] ?? null;
  const storedChild: string | null = call[childField] ?? null;

  let leg: "parent" | "child";
  let source: "parent_status" | "child_status" | "dial_action";
  let rawStatus: string | undefined;
  let duration: number | null = null;

  if (cb === "dial") {
    // <Dial> action: CallSid is the PARENT; the outcome describes the child.
    if (!storedParent || storedParent !== incomingSid) {
      return { status: 403, body: { error: "sid_mismatch" } };
    }
    leg = "child";
    source = "dial_action";
    rawStatus = req.params.DialCallStatus;
    duration = parseDurationSeconds(req.params.DialCallDuration);

    // The dial action tells us the child SID; bind it (verified) if unknown.
    const dialChild = req.params.DialCallSid || null;
    if (dialChild && !isValidSid(dialChild)) {
      return { status: 400, body: { error: "invalid_dial_call_sid" } };
    }
    if (!storedChild) {
      if (!dialChild) return { status: 200, body: { ignored: "no_child_sid" } };
      const outcome = await bindVerifiedChild(deps, call, dialChild, storedParent, accountSid);
      if (outcome !== "ok") return outcome.response;
    } else if (dialChild && dialChild !== storedChild) {
      return { status: 403, body: { error: "child_sid_mismatch" } };
    }
  } else if (cb === "child") {
    // <Number> statusCallback: CallSid is the CHILD, ParentCallSid is ours.
    leg = "child";
    source = "child_status";
    rawStatus = req.params.CallStatus;
    duration = parseDurationSeconds(req.params.CallDuration);
    if (storedChild) {
      if (storedChild !== incomingSid) return { status: 403, body: { error: "sid_mismatch" } };
    } else {
      if (!storedParent) return { status: 409, body: { error: "parent_not_bound", retry: true } };
      const outcome = await bindVerifiedChild(deps, call, incomingSid, storedParent, accountSid);
      if (outcome !== "ok") return outcome.response;
    }
  } else {
    // Parent status callback.
    leg = "parent";
    source = "parent_status";
    rawStatus = req.params.CallStatus;
    duration = parseDurationSeconds(req.params.CallDuration);
    if (storedParent) {
      if (storedParent !== incomingSid) return { status: 403, body: { error: "sid_mismatch" } };
    } else {
      // Callback before the create response landed: verify with Twilio first.
      let ref: TwilioCallRef;
      try {
        ref = await deps.twilio.fetchCall(incomingSid);
      } catch {
        return { status: 503, body: { error: "sid_unverified", retry: true } };
      }
      if (ref.sid !== incomingSid) return { status: 403, body: { error: "sid_mismatch" } };
      if (ref.accountSid && ref.accountSid !== accountSid) {
        return { status: 403, body: { error: "account_mismatch" } };
      }
      if (ref.parentCallSid) return { status: 409, body: { error: "unbound_child_leg", retry: true } };
      const bound = await bindCallLegSid(deps, {
        callId: call.id,
        leg: "parent",
        sid: incomingSid,
        accountSid,
        parentSid: null,
        tripId: call.trip_id,
        token: call.reservation_token ?? null,
      });
      if (bound !== "bound" && bound !== "already_bound") {
        return { status: 403, body: { error: `bind_${bound}` } };
      }
    }
  }

  const normalized = normalizeCallStatus(rawStatus);
  if (!normalized) return { status: 200, body: { ignored: true } };

  // The DATABASE decides ordering, stickiness and the aggregate status.
  const applied = await applyLegStatus(deps, {
    callId: call.id,
    leg,
    sid: leg === "parent" ? incomingSid : (storedChild ?? req.params.DialCallSid ?? incomingSid),
    accountSid,
    status: normalized,
    source,
    duration,
  });

  if (applied.result === "unknown_call") return { status: 404, body: { error: "unknown_call" } };
  if (applied.result === "sid_mismatch") return { status: 403, body: { error: "sid_mismatch" } };

  return {
    status: 200,
    body: { success: true, leg, result: applied.result, status: applied.aggregate_status ?? null },
  };
}

/**
 * Bind a child leg only after Twilio itself confirms the SID belongs to our
 * account AND has our stored parent as its parent. The POSTed ParentCallSid is
 * never trusted on its own.
 */
async function bindVerifiedChild(
  deps: CallingDeps,
  call: any,
  childSid: string,
  storedParent: string,
  accountSid: string,
): Promise<"ok" | { response: StatusResult }> {
  let ref: TwilioCallRef;
  try {
    ref = await deps.twilio.fetchCall(childSid);
  } catch {
    return { response: { status: 503, body: { error: "child_sid_unverified", retry: true } } };
  }
  if (ref.sid !== childSid) {
    return { response: { status: 403, body: { error: "sid_mismatch" } } };
  }
  if (ref.accountSid && ref.accountSid !== accountSid) {
    return { response: { status: 403, body: { error: "account_mismatch" } } };
  }
  if (ref.parentCallSid !== storedParent) {
    return { response: { status: 403, body: { error: "parent_mismatch" } } };
  }
  const bound = await bindCallLegSid(deps, {
    callId: call.id,
    leg: "child",
    sid: childSid,
    accountSid,
    parentSid: storedParent,
    tripId: call.trip_id,
    token: call.reservation_token ?? null,
  });
  if (bound !== "bound" && bound !== "already_bound") {
    return { response: { status: 403, body: { error: `bind_${bound}` } } };
  }
  return "ok";
}
