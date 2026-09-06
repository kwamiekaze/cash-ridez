import { describe, it, expect, vi } from "vitest";
import {
  deriveOverallStatus,
  handleStatusCallback,
  handleVoiceWebhook,
  RetryableCallError,
  startMaskedCall,
  type CallingDeps,
} from "../calling-core";
import { canonicalFunctionUrl } from "../twilio-signature";

const ACCOUNT = "ACtestaccount";
const RIDER = "rider-1";
const DRIVER = "driver-1";
const TRIP = "trip-1";
const CALL = "call-1";
const PARENT_SID = "CAparent";
const CHILD_SID = "CAchild";

const env = {
  supabaseUrl: "https://proj.supabase.co",
  twilioAccountSid: ACCOUNT,
  twilioAuthToken: "token",
  twilioPhoneNumber: "+16789288816",
};

const trip = (over: any = {}) => ({
  id: TRIP,
  status: "assigned",
  rider_id: RIDER,
  assigned_driver_id: DRIVER,
  rider_note: null,
  ...over,
});

const call = (over: any = {}) => ({
  id: CALL,
  trip_id: TRIP,
  rider_id: RIDER,
  driver_id: DRIVER,
  initiated_by_user_id: RIDER,
  status: "initiated",
  twilio_call_sid_rider: PARENT_SID,
  twilio_call_sid_driver: null,
  parent_status: null,
  child_status: null,
  started_at: null,
  ended_at: null,
  ...over,
});

/** Minimal chainable Supabase mock driven by per-table handlers. */
function makeDb(tables: Record<string, any>, rpc: Record<string, any> = {}) {
  const updates: any[] = [];
  const inserts: any[] = [];
  const rpcCalls: any[] = [];

  const client: any = {
    updates,
    inserts,
    rpcCalls,
    rpc: (name: string, args: any) => {
      rpcCalls.push({ name, args });
      const fn = rpc[name];
      if (!fn) return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
      return Promise.resolve(fn(args));
    },
    from(table: string) {
      const handlers = tables[table] ?? {};
      const q: any = {
        _payload: undefined as any,
        select: () => q,
        insert: (payload: any) => {
          inserts.push({ table, payload });
          q._payload = payload;
          q._mode = "insert";
          return q;
        },
        update: (payload: any) => {
          updates.push({ table, payload });
          q._payload = payload;
          q._mode = "update";
          return q;
        },
        eq: () => q,
        in: () => q,
        is: () => q,
        maybeSingle: () => Promise.resolve(resolve()),
        single: () => Promise.resolve(resolve()),
        then: (res: any, rej: any) => Promise.resolve(resolve()).then(res, rej),
      };
      const resolve = () => {
        if (q._mode === "insert") return handlers.insert ? handlers.insert(q._payload) : { data: null, error: null };
        if (q._mode === "update") return handlers.update ? handlers.update(q._payload) : { data: [{ id: CALL }], error: null };
        return handlers.select ? handlers.select() : { data: null, error: null };
      };
      return q;
    },
  };
  return client;
}

const twilioOk = (over: any = {}) => ({
  createCall: vi.fn(async () => ({ sid: PARENT_SID, accountSid: ACCOUNT, parentCallSid: null })),
  fetchCall: vi.fn(async (sid: string) => ({ sid, accountSid: ACCOUNT, parentCallSid: null })),
  ...over,
});

const deps = (supabase: any, twilio: any = twilioOk()): CallingDeps => ({ supabase, twilio, env });

const baseTables = (over: any = {}) => ({
  ride_requests: { select: () => ({ data: trip(), error: null }) },
  profiles: {
    select: () => ({
      data: [
        { id: RIDER, phone_number: "678-928-8816" },
        { id: DRIVER, phone_number: "(404) 555-0134" },
      ],
      error: null,
    }),
  },
  admin_user_notes: { select: () => ({ data: null, error: null }) },
  calls: { insert: () => ({ data: call(), error: null }) },
  ...over,
});

// ---------------------------------------------------------------------------

describe("call-start", () => {
  it("refuses before reserving when configuration is missing", async () => {
    const db = makeDb(baseTables());
    const d = { ...deps(db), env: { ...env, twilioPhoneNumber: undefined } };
    const res = await startMaskedCall(d, { userId: RIDER, tripId: TRIP });
    expect(res.body.code).toBe("SERVER_CONFIG_ERROR");
    expect(db.rpcCalls).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects a non-participant and a trip that is no longer assigned", async () => {
    const notAssigned = makeDb(baseTables({ ride_requests: { select: () => ({ data: trip({ status: "cancelled" }), error: null }) } }));
    expect((await startMaskedCall(deps(notAssigned), { userId: RIDER, tripId: TRIP })).body.code)
      .toBe("TRIP_NOT_ASSIGNED");

    const db = makeDb(baseTables());
    expect((await startMaskedCall(deps(db), { userId: "someone-else", tripId: TRIP })).body.code)
      .toBe("NOT_PARTICIPANT");
    expect(db.inserts).toHaveLength(0);
  });

  it("falls back to the rider-note contact when the rider profile has no phone", async () => {
    const db = makeDb(baseTables({
      ride_requests: {
        select: () => ({ data: trip({ rider_note: "Trip Details: x | Contact: 470-555-0199" }), error: null }),
      },
      profiles: {
        select: () => ({
          data: [
            { id: RIDER, phone_number: null },
            { id: DRIVER, phone_number: "404-555-0134" },
          ],
          error: null,
        }),
      },
    }));
    const twilio = twilioOk();
    const res = await startMaskedCall(deps(db, twilio), { userId: RIDER, tripId: TRIP });
    expect(res.body.success).toBe(true);
    expect(twilio.createCall.mock.calls[0][0].to).toBe("+14705550199");
  });

  it("reports a missing recipient phone without leaking whose fallback was used", async () => {
    const db = makeDb(baseTables({
      profiles: {
        select: () => ({
          data: [
            { id: RIDER, phone_number: "678-928-8816" },
            { id: DRIVER, phone_number: "678<928>8816" },
          ],
          error: null,
        }),
      },
    }));
    const res = await startMaskedCall(deps(db), { userId: RIDER, tripId: TRIP });
    expect(res.body.code).toBe("NO_DRIVER_PHONE");
    expect(JSON.stringify(res.body)).not.toMatch(/source|admin_override|8816/);
  });

  it("blocks a concurrent second attempt through the reservation", async () => {
    let taken = false;
    const db = makeDb(baseTables(), {
      reserve_call_slot: () => {
        if (taken) return { data: { outcome: "busy" }, error: null };
        taken = true;
        return { data: { outcome: "granted", token: "tok" }, error: null };
      },
    });
    const twilio = twilioOk();
    const [a, b] = await Promise.all([
      startMaskedCall(deps(db, twilio), { userId: RIDER, tripId: TRIP }),
      startMaskedCall(deps(db, twilio), { userId: RIDER, tripId: TRIP }),
    ]);
    const codes = [a.body.code, b.body.code];
    expect(codes).toContain("CALL_IN_PROGRESS");
    expect(twilio.createCall).toHaveBeenCalledTimes(1);
  });

  it("stamps the record failed and releases the slot when Twilio errors", async () => {
    const db = makeDb(baseTables(), {
      reserve_call_slot: () => ({ data: { outcome: "granted", token: "tok" }, error: null }),
      release_call_slot: () => ({ data: null, error: null }),
    });
    const twilio = twilioOk({
      createCall: vi.fn(async () => {
        throw Object.assign(new Error("rate limit"), { code: 20429 });
      }),
    });
    const res = await startMaskedCall(deps(db, twilio), { userId: RIDER, tripId: TRIP });
    expect(res.body.code).toBe("RATE_LIMITED");
    expect(db.updates.some((u: any) => u.payload.status === "failed")).toBe(true);
    expect(db.rpcCalls.some((c: any) => c.name === "release_call_slot")).toBe(true);
  });

  it("surfaces a database failure instead of hiding it", async () => {
    const db = makeDb(baseTables({ calls: { insert: () => ({ data: null, error: { message: "insert denied" } }) } }));
    await expect(startMaskedCall(deps(db), { userId: RIDER, tripId: TRIP })).rejects.toThrow(RetryableCallError);
  });

  it("never binds a SID that Twilio says belongs to another account", async () => {
    const db = makeDb(baseTables());
    const twilio = twilioOk({
      fetchCall: vi.fn(async (sid: string) => ({ sid, accountSid: "ACsomeoneelse", parentCallSid: null })),
    });
    await expect(startMaskedCall(deps(db, twilio), { userId: RIDER, tripId: TRIP })).rejects.toThrow(/different Twilio account/);
  });
});

// ---------------------------------------------------------------------------

const webhook = (over: any = {}) => ({
  method: "POST",
  contentType: "application/x-www-form-urlencoded",
  params: { AccountSid: ACCOUNT, CallSid: PARENT_SID },
  query: new URLSearchParams(`callId=${CALL}`),
  signatureValid: true,
  ...over,
});

describe("call-voice", () => {
  it("rejects a tampered/unsigned request before touching the database", async () => {
    const db = makeDb(baseTables({ calls: { select: () => { throw new Error("db must not be used"); } } }));
    const res = await handleVoiceWebhook(deps(db), webhook({ signatureValid: false }));
    expect(res.status).toBe(403);
    expect(res.twiml).toContain("<Hangup/>");
  });

  it("rejects a foreign AccountSid and a non-POST request", async () => {
    const db = makeDb(baseTables());
    expect((await handleVoiceWebhook(deps(db), webhook({ params: { AccountSid: "ACother", CallSid: PARENT_SID } }))).status).toBe(403);
    expect((await handleVoiceWebhook(deps(db), webhook({ method: "GET" }))).status).toBe(405);
  });

  it("rejects a CallSid that is not the stored parent leg", async () => {
    const db = makeDb(baseTables({ calls: { select: () => ({ data: call(), error: null }) } }));
    const res = await handleVoiceWebhook(deps(db), webhook({ params: { AccountSid: ACCOUNT, CallSid: "CAforged" } }));
    expect(res.status).toBe(403);
  });

  it("dials the recipient derived from the initiator, ignoring a spoofed role param", async () => {
    const db = makeDb(baseTables({ calls: { select: () => ({ data: call(), error: null }) } }));
    const res = await handleVoiceWebhook(
      deps(db),
      webhook({ query: new URLSearchParams(`callId=${CALL}&role=driver`) }),
    );
    // Initiator is the rider, so the DRIVER's number must be dialed.
    expect(res.twiml).toContain("+14045550134");
    expect(res.twiml).not.toContain("+16789288816<");
  });

  it("falls back to voicemail when the trip was reassigned or cancelled", async () => {
    const reassigned = makeDb(baseTables({
      calls: { select: () => ({ data: call(), error: null }) },
      ride_requests: { select: () => ({ data: trip({ assigned_driver_id: "driver-2" }), error: null }) },
    }));
    expect((await handleVoiceWebhook(deps(reassigned), webhook())).twiml).toContain("call-inbound-voicemail");

    const cancelled = makeDb(baseTables({
      calls: { select: () => ({ data: call(), error: null }) },
      ride_requests: { select: () => ({ data: trip({ status: "cancelled" }), error: null }) },
    }));
    expect((await handleVoiceWebhook(deps(cancelled), webhook())).twiml).toContain("call-inbound-voicemail");
  });

  it("keeps the inbound voicemail redirect when there is no callId (after auth)", async () => {
    const db = makeDb(baseTables());
    const res = await handleVoiceWebhook(deps(db), webhook({ query: new URLSearchParams() }));
    expect(res.status).toBe(200);
    expect(res.twiml).toContain("call-inbound-voicemail");
    expect(res.twiml).not.toContain("<Say");
  });

  it("escapes XML in every attribute and text node", async () => {
    const db = makeDb(baseTables({ calls: { select: () => ({ data: call(), error: null }) } }));
    const res = await handleVoiceWebhook(deps(db), webhook());
    expect(res.twiml).toContain("&amp;leg=child");
    expect(res.twiml).not.toMatch(/action="[^"]*&(?!amp;)/);
  });
});

// ---------------------------------------------------------------------------

describe("call-status", () => {
  const statusReq = (params: any, query = `callId=${CALL}`) =>
    webhook({ params: { AccountSid: ACCOUNT, ...params }, query: new URLSearchParams(query) });

  it("rejects an invalid signature before any database use", async () => {
    const db = makeDb({ calls: { select: () => { throw new Error("db must not be used"); } } });
    const res = await handleStatusCallback(deps(db), { ...statusReq({ CallSid: PARENT_SID }), signatureValid: false });
    expect(res.status).toBe(403);
  });

  it("rejects a CallSid that belongs to no leg of this record", async () => {
    const db = makeDb({ calls: { select: () => ({ data: call(), error: null }) } });
    const res = await handleStatusCallback(deps(db), statusReq({ CallSid: "CAstranger", CallStatus: "completed" }));
    expect(res.status).toBe(403);
  });

  it("keeps the child no-answer outcome even after the parent completes", async () => {
    const withChild = call({ twilio_call_sid_driver: CHILD_SID, parent_status: "in_progress", child_status: null });
    const db = makeDb({ calls: { select: () => ({ data: withChild, error: null }) } });
    const childRes = await handleStatusCallback(deps(db), statusReq({ CallSid: CHILD_SID, CallStatus: "no-answer" }));
    expect(childRes.body.status).toBe("no_answer");

    const after = call({
      twilio_call_sid_driver: CHILD_SID,
      parent_status: "in_progress",
      child_status: "no_answer",
    });
    const db2 = makeDb({ calls: { select: () => ({ data: after, error: null }) } });
    const parentRes = await handleStatusCallback(
      deps(db2),
      statusReq({ CallSid: PARENT_SID, CallStatus: "completed", CallDuration: "18" }),
    );
    expect(parentRes.body.status).toBe("no_answer");
  });

  it("does not treat a completed parent alone as a connected conversation", () => {
    expect(deriveOverallStatus({ parent: "completed", child: null, bridged: false })).toBe("no_answer");
    expect(deriveOverallStatus({ parent: "completed", child: "completed", bridged: true })).toBe("completed");
  });

  it("ignores duplicate and out-of-order callbacks without repeating side effects", async () => {
    const done = call({ parent_status: "completed", ended_at: "2026-01-01T00:00:00.000Z" });
    const db = makeDb({ calls: { select: () => ({ data: done, error: null }) } });

    const dup = await handleStatusCallback(deps(db), statusReq({ CallSid: PARENT_SID, CallStatus: "completed" }));
    expect(dup.body.duplicate).toBe(true);

    const late = await handleStatusCallback(deps(db), statusReq({ CallSid: PARENT_SID, CallStatus: "ringing" }));
    expect(late.body.out_of_order).toBe(true);
    expect(db.updates).toHaveLength(0);
  });

  it("records a non-negative duration and stamps end time once", async () => {
    const db = makeDb({ calls: { select: () => ({ data: call({ parent_status: "in_progress" }), error: null }) } });
    await handleStatusCallback(deps(db), statusReq({ CallSid: PARENT_SID, CallStatus: "completed", CallDuration: "-5" }));
    const payload = db.updates[0].payload;
    expect(payload.duration_seconds).toBeUndefined();
    expect(payload.ended_at).toBeTruthy();
  });

  it("asks for a retry rather than trusting an unbound SID it cannot verify", async () => {
    const db = makeDb({ calls: { select: () => ({ data: call({ twilio_call_sid_rider: null }), error: null }) } });
    const twilio = twilioOk({ fetchCall: vi.fn(async () => { throw new Error("twilio down"); }) });
    const res = await handleStatusCallback(deps(db, twilio), statusReq({ CallSid: "CAunknown", CallStatus: "ringing" }));
    expect(res.status).toBe(503);
    expect(res.body.retry).toBe(true);
  });

  it("surfaces a database write failure as retryable", async () => {
    const db = makeDb({
      calls: {
        select: () => ({ data: call({ parent_status: "ringing" }), error: null }),
        update: () => ({ data: null, error: { message: "update denied" } }),
      },
    });
    await expect(
      handleStatusCallback(deps(db), statusReq({ CallSid: PARENT_SID, CallStatus: "completed" })),
    ).rejects.toThrow(RetryableCallError);
  });
});

describe("canonical callback URL", () => {
  it("is built from trusted config, ignoring forged proxy hosts", () => {
    expect(
      canonicalFunctionUrl("https://proj.supabase.co", "/functions/v1/call-status", "http://attacker:9000/x?callId=abc"),
    ).toBe("https://proj.supabase.co/functions/v1/call-status?callId=abc");
  });
});
