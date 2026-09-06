/**
 * Dependency-injected core for CashRidez masked calling.
 *
 * Everything that decides WHO gets dialed, WHICH record is written and WHAT a
 * callback means lives here so it can be tested without Deno, Twilio or a real
 * database. `call-start`, `call-voice` and `call-status` are thin wrappers.
 *
 * Invariants enforced here:
 *  - the recipient is derived from the stored initiator + the trip's CURRENT
 *    participants, never from a query parameter;
 *  - callbacks are rejected before any DB use unless the Twilio signature over
 *    the canonical URL is valid and the AccountSid matches;
 *  - a SID is only bound to a call record after Twilio confirms it belongs to
 *    our account and to the expected parent;
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

export class RetryableCallError extends Error {}

export interface StartResult {
  status: number;
  body: Json;
}

const CALL_LEASE_SECONDS = 90;

function nowIso(deps: CallingDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function err(code: string, message: string, status = 400): StartResult {
  return { status, body: { success: false, code, error: message } };
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
 * Sources are internal; never return `source` to a client.
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
// Reservation (pending SQL; safe degraded path until applied)
// ---------------------------------------------------------------------------

export type ReservationOutcome = "granted" | "busy" | "rate_limited" | "unavailable";

export async function reserveCallSlot(
  deps: CallingDeps,
  args: { actorId: string; tripId: string; leaseSeconds?: number },
): Promise<{ outcome: ReservationOutcome; token?: string }> {
  try {
    const { data, error } = await deps.supabase.rpc("reserve_call_slot", {
      p_actor_id: args.actorId,
      p_trip_id: args.tripId,
      p_lease_seconds: args.leaseSeconds ?? CALL_LEASE_SECONDS,
    });
    if (error) {
      if (isMissingRpc(error)) {
        console.warn("[call-start] reserve_call_slot RPC missing — pending migration not applied");
        return { outcome: "unavailable" };
      }
      throw new RetryableCallError(`Call reservation failed: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const outcome = (row?.outcome ?? row) as ReservationOutcome;
    if (outcome === "granted") return { outcome, token: row?.token ?? undefined };
    if (outcome === "busy" || outcome === "rate_limited") return { outcome };
    return { outcome: "unavailable" };
  } catch (e) {
    if (e instanceof RetryableCallError) throw e;
    return { outcome: "unavailable" };
  }
}

export async function releaseCallSlot(deps: CallingDeps, token?: string): Promise<void> {
  if (!token) return;
  try {
    await deps.supabase.rpc("release_call_slot", { p_token: token });
  } catch {
    /* lease expires on its own */
  }
}

function isMissingRpc(error: any): boolean {
  const code = error?.code ?? "";
  const message = String(error?.message ?? "");
  return code === "PGRST202" || code === "42883" || /could not find the function/i.test(message);
}

function isMissingColumn(error: any): boolean {
  const code = error?.code ?? "";
  const message = String(error?.message ?? "");
  return code === "PGRST204" || code === "42703" || /column .* does not exist/i.test(message);
}

/**
 * Update a call row, retrying without the columns that only exist once the
 * pending calling migration is applied. Real errors are still surfaced.
 */
export async function updateCallRow(
  deps: CallingDeps,
  callId: string,
  base: Json,
  pendingOnly: Json = {},
): Promise<void> {
  const attempt = async (payload: Json) =>
    await deps.supabase.from("calls").update(payload).eq("id", callId);

  let { error } = await attempt({ ...base, ...pendingOnly, updated_at: nowIso(deps) });
  if (error && Object.keys(pendingOnly).length && isMissingColumn(error)) {
    ({ error } = await attempt({ ...base, updated_at: nowIso(deps) }));
  }
  if (error) throw new RetryableCallError(`Call update failed: ${error.message}`);
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
  if (!args.tripId) return err("INVALID_REQUEST", "Trip ID is required.", 400);

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

  // 3. Reservation: blocks a double click / concurrent second call.
  const reservation = await reserveCallSlot(deps, { actorId: args.userId, tripId: trip.id });
  if (reservation.outcome === "busy") {
    return err("CALL_IN_PROGRESS", "A call for this trip is already being connected.", 409);
  }
  if (reservation.outcome === "rate_limited") {
    return err("RATE_LIMITED", "Too many calls. Please wait a few minutes before trying again.", 429);
  }

  const initiatorRole: "rider" | "driver" = isRider ? "rider" : "driver";
  const { data: callRecord, error: callError } = await deps.supabase
    .from("calls")
    .insert({
      trip_id: trip.id,
      rider_id: trip.rider_id,
      driver_id: trip.assigned_driver_id,
      initiated_by_user_id: args.userId,
      status: "initiated",
    })
    .select()
    .single();

  if (callError || !callRecord) {
    await releaseCallSlot(deps, reservation.token);
    throw new RetryableCallError(`Call record insert failed: ${callError?.message ?? "no row"}`);
  }

  const base = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
  const parentSidField = initiatorRole === "rider" ? "twilio_call_sid_rider" : "twilio_call_sid_driver";

  let created: TwilioCallRef;
  try {
    created = await deps.twilio.createCall({
      to: initiator.phone,
      from: twilioPhoneNumber,
      url: `${base}/call-voice?callId=${encodeURIComponent(callRecord.id)}`,
      statusCallback: `${base}/call-status?callId=${encodeURIComponent(callRecord.id)}`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      method: "POST",
    });
  } catch (twilioError: any) {
    // Every network/API failure stamps the record failed and frees the slot.
    await updateCallRow(deps, callRecord.id, { status: "failed", ended_at: nowIso(deps) });
    await releaseCallSlot(deps, reservation.token);
    return mapTwilioStartError(twilioError);
  }

  // 4. Bind the SID only after Twilio confirms it is ours and is a parent leg.
  try {
    await bindParentSid(deps, callRecord.id, parentSidField, created.sid, twilioAccountSid);
  } catch (e) {
    if (e instanceof RetryableCallError) throw e;
    throw e;
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

/**
 * Verify a SID against Twilio before storing it, so a callback that arrived
 * before the REST response can never cause an arbitrary/unbound SID to be
 * trusted. A verification failure is retryable, never a silent bind.
 */
export async function bindParentSid(
  deps: CallingDeps,
  callId: string,
  sidField: string,
  sid: string,
  expectedAccountSid: string,
): Promise<void> {
  let ref: TwilioCallRef;
  try {
    ref = await deps.twilio.fetchCall(sid);
  } catch (e: any) {
    throw new RetryableCallError(`Could not verify call SID with Twilio: ${e?.message ?? e}`);
  }
  if (ref.sid !== sid) throw new RetryableCallError("Twilio returned a different call SID");
  if (ref.accountSid && ref.accountSid !== expectedAccountSid) {
    throw new RetryableCallError("Call SID belongs to a different Twilio account");
  }
  if (ref.parentCallSid) throw new RetryableCallError("Refusing to bind a child leg as the parent leg");

  const { data, error } = await deps.supabase
    .from("calls")
    .update({ [sidField]: sid, updated_at: nowIso(deps) })
    .eq("id", callId)
    .is(sidField, null)
    .select("id");

  if (error) throw new RetryableCallError(`SID binding failed: ${error.message}`);

  if (!data || data.length === 0) {
    // Something already bound this leg (e.g. a callback that raced us).
    const { data: existing, error: readError } = await deps.supabase
      .from("calls")
      .select(`id, ${sidField}`)
      .eq("id", callId)
      .maybeSingle();
    if (readError) throw new RetryableCallError(`SID binding check failed: ${readError.message}`);
    if ((existing as any)?.[sidField] !== sid) {
      throw new RetryableCallError("Call leg is already bound to a different SID");
    }
  }
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

export function dialTwiml(opts: { callerId: string; recipient: string; actionUrl: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(opts.callerId)}" action="${escapeXml(opts.actionUrl)}" method="POST" answerOnBridge="true">
    <Number statusCallback="${escapeXml(opts.actionUrl)}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${escapeXml(opts.recipient)}</Number>
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
  if (!deps.env.twilioAccountSid || req.params.AccountSid !== deps.env.twilioAccountSid) {
    return { status: 403, twiml: hangupTwiml() };
  }

  const callId = req.query.get("callId");

  // Legitimate inbound / call-center fallback: no callId, but only AFTER the
  // request has been authenticated above.
  if (!callId) {
    return { status: 200, twiml: voicemailRedirectTwiml(supabaseUrl) };
  }

  const { data: call, error } = await deps.supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw new RetryableCallError(`Call lookup failed: ${error.message}`);
  if (!call) return { status: 200, twiml: voicemailRedirectTwiml(supabaseUrl) };

  // The caller must be the parent leg we created for this record.
  const initiatorRole: "rider" | "driver" = call.initiated_by_user_id === call.rider_id ? "rider" : "driver";
  const parentField = initiatorRole === "rider" ? "twilio_call_sid_rider" : "twilio_call_sid_driver";
  const storedParent = call[parentField];
  const incomingSid = req.params.CallSid ?? "";

  if (storedParent) {
    if (storedParent !== incomingSid) return { status: 403, twiml: hangupTwiml() };
  } else {
    // Callback beat the REST response: verify with Twilio before binding.
    try {
      await bindParentSid(deps, call.id, parentField, incomingSid, deps.env.twilioAccountSid);
    } catch {
      return { status: 200, twiml: voicemailRedirectTwiml(supabaseUrl) };
    }
  }

  // Re-check the trip: it may have been reassigned or cancelled since start.
  const { data: trip, error: tripError } = await deps.supabase
    .from("ride_requests")
    .select("id, status, rider_id, assigned_driver_id, rider_note")
    .eq("id", call.trip_id)
    .maybeSingle();
  if (tripError) throw new RetryableCallError(`Trip lookup failed: ${tripError.message}`);
  if (!trip || trip.status !== "assigned") {
    return { status: 200, twiml: voicemailRedirectTwiml(supabaseUrl) };
  }
  if (trip.rider_id !== call.rider_id || trip.assigned_driver_id !== call.driver_id) {
    // Participants changed — never bridge to whoever holds the seat now.
    return { status: 200, twiml: voicemailRedirectTwiml(supabaseUrl) };
  }

  // Recipient is derived from the stored initiator, NOT from any query param.
  const phones = await resolveTripPhones(deps, trip);
  const recipient = call.initiated_by_user_id === trip.rider_id ? phones.driver : phones.rider;
  const callerId = deps.env.twilioPhoneNumber;

  if (!recipient.phone || !callerId) {
    console.warn(`[call-voice] No dialable recipient for call ${call.id} (${maskPhone(recipient.phone)})`);
    return { status: 200, twiml: voicemailRedirectTwiml(supabaseUrl) };
  }

  const actionUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/call-status?callId=${
    encodeURIComponent(call.id)
  }&leg=child`;

  return { status: 200, twiml: dialTwiml({ callerId, recipient: recipient.phone, actionUrl }) };
}

// ---------------------------------------------------------------------------
// call-status
// ---------------------------------------------------------------------------

/** Ordered lifecycle ranks; a lower rank never overwrites a higher one. */
const STATUS_RANK: Record<string, number> = {
  initiated: 1,
  queued: 1,
  ringing: 2,
  "in-progress": 3,
  in_progress: 3,
  answered: 3,
  completed: 4,
  busy: 4,
  failed: 4,
  "no-answer": 4,
  no_answer: 4,
  canceled: 4,
};

const NORMALIZED: Record<string, string> = {
  queued: "ringing",
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

export function statusRank(raw: string | undefined | null): number {
  if (!raw) return 0;
  return STATUS_RANK[raw] ?? 0;
}

/** Outcomes that mean the recipient never actually connected. */
const CHILD_FAILURE = new Set(["busy", "no_answer", "failed", "canceled"]);

/**
 * The overall call outcome. A completed PARENT leg alone is never reported as
 * a connected conversation — only the child (recipient) leg can prove that.
 */
export function deriveOverallStatus(state: {
  parent?: string | null;
  child?: string | null;
  bridged?: boolean;
}): string {
  const child = state.child ?? null;
  if (child && CHILD_FAILURE.has(child)) return child;
  if (child === "completed") return state.bridged ? "completed" : "no_answer";
  if (child === "in_progress") return "in_progress";
  const parent = state.parent ?? null;
  if (parent === "completed") return state.bridged ? "completed" : "no_answer";
  if (parent && parent !== "completed") return parent;
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
  if (!deps.env.twilioAccountSid || req.params.AccountSid !== deps.env.twilioAccountSid) {
    return { status: 403, body: { error: "account_mismatch" } };
  }

  const callId = req.query.get("callId");
  if (!callId) return { status: 400, body: { error: "missing_call_id" } };

  const { data: call, error } = await deps.supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw new RetryableCallError(`Call lookup failed: ${error.message}`);
  if (!call) return { status: 404, body: { error: "unknown_call" } };

  const incomingSid = req.params.CallSid ?? "";
  const parentSidParam = req.params.ParentCallSid || null;
  const initiatorRole: "rider" | "driver" = call.initiated_by_user_id === call.rider_id ? "rider" : "driver";
  const parentField = initiatorRole === "rider" ? "twilio_call_sid_rider" : "twilio_call_sid_driver";
  const childField = initiatorRole === "rider" ? "twilio_call_sid_driver" : "twilio_call_sid_rider";
  const storedParent: string | null = call[parentField] ?? null;
  const storedChild: string | null = call[childField] ?? null;

  // Which leg is this? Decided by SID ownership, never by the `leg` query param.
  let leg: "parent" | "child";
  if (storedParent && incomingSid === storedParent) {
    leg = "parent";
  } else if (storedChild && incomingSid === storedChild) {
    leg = "child";
  } else if (parentSidParam && storedParent && parentSidParam === storedParent) {
    leg = "child";
  } else if (!storedParent) {
    // Callback before the create response was stored: confirm with Twilio.
    try {
      const ref = await deps.twilio.fetchCall(incomingSid);
      if (ref.accountSid && ref.accountSid !== deps.env.twilioAccountSid) {
        return { status: 403, body: { error: "account_mismatch" } };
      }
      if (ref.parentCallSid) return { status: 409, body: { error: "unbound_child_leg", retry: true } };
      await bindParentSid(deps, call.id, parentField, incomingSid, deps.env.twilioAccountSid!);
      leg = "parent";
    } catch {
      return { status: 503, body: { error: "sid_unverified", retry: true } };
    }
  } else {
    return { status: 403, body: { error: "sid_mismatch" } };
  }

  const rawStatus = req.params.CallStatus ?? req.params.DialCallStatus;
  const normalized = normalizeCallStatus(rawStatus);
  if (!normalized) return { status: 200, body: { ignored: true } };

  const prev = leg === "parent" ? call.parent_status ?? null : call.child_status ?? null;
  // Out-of-order / duplicate delivery: never move a leg backwards, and never
  // repeat side effects for an already-recorded status.
  if (prev && statusRank(prev) >= statusRank(normalized)) {
    if (prev === normalized) return { status: 200, body: { duplicate: true } };
    return { status: 200, body: { out_of_order: true } };
  }

  const bridged = call.bridged === true || (leg === "child" && normalized === "in_progress") ||
    (leg === "child" && call.child_status === "in_progress");

  const overall = deriveOverallStatus({
    parent: leg === "parent" ? normalized : call.parent_status ?? null,
    child: leg === "child" ? normalized : call.child_status ?? null,
    bridged,
  });

  const base: Json = { status: overall };
  const pending: Json = leg === "parent" ? { parent_status: normalized } : { child_status: normalized, bridged };

  // Times are written once; duration is always a safe non-negative integer.
  if (leg === "child" && normalized === "in_progress" && !call.started_at) {
    base.started_at = nowIso(deps);
  }
  const terminal = ["completed", "busy", "failed", "no_answer", "canceled"].includes(normalized);
  if (terminal && leg === "parent" && !call.ended_at) {
    base.ended_at = nowIso(deps);
    const seconds = Number.parseInt(req.params.CallDuration ?? "", 10);
    if (Number.isFinite(seconds) && seconds >= 0) base.duration_seconds = seconds;
  }

  await updateCallRow(deps, call.id, base, pending);
  if (terminal && leg === "parent") await releaseCallSlot(deps, call.reservation_token);

  return { status: 200, body: { success: true, leg, status: overall } };
}
