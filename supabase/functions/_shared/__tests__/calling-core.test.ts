import { describe, it, expect, vi } from "vitest";
import {
  deriveOverallStatus,
  handleStatusCallback,
  handleVoiceWebhook,
  MissingDependencyError,
  parseDurationSeconds,
  RetryableCallError,
  startMaskedCall,
  type CallingDeps,
} from "../calling-core";

const ACCOUNT = "AC" + "a".repeat(32);
const OTHER_ACCOUNT = "AC" + "b".repeat(32);
const PARENT_SID = "CA" + "1".repeat(32);
const CHILD_SID = "CA" + "2".repeat(32);
const FOREIGN_SID = "CA" + "3".repeat(32);
const RIDER = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const TRIP = "33333333-3333-4333-8333-333333333333";
const CALL = "44444444-4444-4444-8444-444444444444";
const TOKEN = "55555555-5555-4555-8555-555555555555";

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
  reservation_token: TOKEN,
  twilio_call_sid_rider: PARENT_SID,
  twilio_call_sid_driver: null,
  parent_status: null,
  child_status: null,
  bridged: false,
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
      if (!fn) {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "Could not find the function" },
        });
      }
      return Promise.resolve(fn(args));
    },
    from(table: string) {
      const handlers = tables[table] ?? {};
      const q: any = {
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
  fetchCall: vi.fn(async (sid: string) => ({
    sid,
    accountSid: ACCOUNT,
    parentCallSid: sid === CHILD_SID ? PARENT_SID : null,
    from: sid === CHILD_SID ? undefined : env.twilioPhoneNumber,
  })),
  cancelCall: vi.fn(async () => {}),
  ...over,
});

const deps = (supabase: any, twilio: any = twilioOk()): CallingDeps => ({ supabase, twilio, env });

const okRpcs = {
  reserve_call_slot: () => ({ data: [{ outcome: "granted", token: TOKEN }], error: null }),
  release_call_slot: () => ({ data: true, error: null }),
  confirm_call_attempt: () => ({ data: null, error: null }),
  fail_call: () => ({ data: "failed", error: null }),
  bind_call_leg_sid: () => ({ data: "bound", error: null }),
  apply_call_leg_status: () => ({
    data: [{ result: "applied", aggregate_status: "ringing", parent_status: "ringing", child_status: null, bridged: false }],
    error: null,
  }),
};

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
  calls: {
    select: () => ({ data: call(), error: null }),
    insert: () => ({ data: { ...call(), twilio_call_sid_rider: null }, error: null }),
  },
  ...over,
});

const form = (params: Record<string, string>, query: string) => ({
  method: "POST",
  contentType: "application/x-www-form-urlencoded",
  params: { AccountSid: ACCOUNT, ...params },
  query: new URLSearchParams(query),
  signatureValid: true,
});

// ---------------------------------------------------------------------------
// 1. Fail closed without the pending migration
// ---------------------------------------------------------------------------
describe("call-start fails closed", () => {
  it("does not insert a call row or dial when reserve_call_slot is missing", async () => {
    const db = makeDb(baseTables(), {}); // no RPCs at all
    const tw = twilioOk();
    await expect(startMaskedCall(deps(db, tw), { userId: RIDER, tripId: TRIP }))
      .rejects.toBeInstanceOf(MissingDependencyError);
    expect(db.inserts).toHaveLength(0);
    expect(tw.createCall).not.toHaveBeenCalled();
  });

  it("does not dial when the reservation is busy", async () => {
    const tw = twilioOk();
    const db = makeDb(baseTables(), {
      ...okRpcs,
      reserve_call_slot: () => ({ data: [{ outcome: "busy", token: null }], error: null }),
    });
    const res = await startMaskedCall(deps(db, tw), { userId: RIDER, tripId: TRIP });
    expect(res.status).toBe(409);
    expect(db.inserts).toHaveLength(0);
    expect(tw.createCall).not.toHaveBeenCalled();
  });

  it("persists the reservation token on the call row", async () => {
    const db = makeDb(baseTables(), okRpcs);
    const res = await startMaskedCall(deps(db), { userId: RIDER, tripId: TRIP });
    expect(res.status).toBe(200);
    expect(db.inserts[0].payload.reservation_token).toBe(TOKEN);
  });

  it("rejects a non-uuid trip id before touching the database", async () => {
    const db = makeDb(baseTables(), okRpcs);
    const res = await startMaskedCall(deps(db), { userId: RIDER, tripId: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(db.rpcCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Binding failure after the Twilio call exists
// ---------------------------------------------------------------------------
describe("call-start binding failure", () => {
  it("stamps failed, releases the token and cancels the created call", async () => {
    const tw = twilioOk({ fetchCall: vi.fn(async () => { throw new Error("twilio down"); }) });
    const db = makeDb(baseTables(), okRpcs);
    await expect(startMaskedCall(deps(db, tw), { userId: RIDER, tripId: TRIP }))
      .rejects.toBeInstanceOf(RetryableCallError);
    expect(tw.cancelCall).toHaveBeenCalledWith(PARENT_SID);
    const names = db.rpcCalls.map((c: any) => c.name);
    expect(names).toContain("fail_call");
    expect(names).toContain("release_call_slot");
    const fail = db.rpcCalls.find((c: any) => c.name === "fail_call");
    expect(fail.args.p_token).toBe(TOKEN);
  });

  it("refuses to bind a SID that Twilio reports as a child leg", async () => {
    const tw = twilioOk({
      fetchCall: vi.fn(async (sid: string) => ({ sid, accountSid: ACCOUNT, parentCallSid: FOREIGN_SID })),
    });
    const db = makeDb(baseTables(), okRpcs);
    await expect(startMaskedCall(deps(db, tw), { userId: RIDER, tripId: TRIP })).rejects.toThrow();
    expect(db.rpcCalls.some((c: any) => c.name === "bind_call_leg_sid")).toBe(false);
  });

  it("aborts when the SID belongs to another Twilio account", async () => {
    const tw = twilioOk({
      fetchCall: vi.fn(async (sid: string) => ({ sid, accountSid: OTHER_ACCOUNT, parentCallSid: null })),
    });
    const db = makeDb(baseTables(), okRpcs);
    await expect(startMaskedCall(deps(db, tw), { userId: RIDER, tripId: TRIP })).rejects.toThrow();
    expect(tw.cancelCall).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. call-voice
// ---------------------------------------------------------------------------
describe("call-voice", () => {
  it("hangs up (never voicemail) when the trip was reassigned", async () => {
    const db = makeDb(
      baseTables({
        ride_requests: { select: () => ({ data: trip({ assigned_driver_id: "99999999-9999-4999-8999-999999999999" }), error: null }) },
      }),
      okRpcs,
    );
    const res = await handleVoiceWebhook(deps(db), form({ CallSid: PARENT_SID }, `callId=${CALL}`));
    expect(res.twiml).toContain("<Hangup/>");
    expect(res.twiml).not.toContain("Redirect");
    expect(db.rpcCalls.some((c: any) => c.name === "fail_call")).toBe(true);
  });

  it("hangs up when the recipient has no valid phone", async () => {
    const db = makeDb(
      baseTables({
        profiles: { select: () => ({ data: [{ id: RIDER, phone_number: "678-928-8816" }, { id: DRIVER, phone_number: null }], error: null }) },
      }),
      okRpcs,
    );
    const res = await handleVoiceWebhook(deps(db), form({ CallSid: PARENT_SID }, `callId=${CALL}`));
    expect(res.twiml).toContain("<Hangup/>");
  });

  it("only redirects to voicemail for a true inbound call with no callId", async () => {
    const db = makeDb(baseTables(), okRpcs);
    const res = await handleVoiceWebhook(deps(db), form({ CallSid: PARENT_SID }, ""));
    expect(res.twiml).toContain("call-inbound-voicemail");
  });

  it("emits distinct Dial action and Number status callbacks", async () => {
    const db = makeDb(baseTables(), okRpcs);
    const res = await handleVoiceWebhook(deps(db), form({ CallSid: PARENT_SID }, `callId=${CALL}`));
    expect(res.twiml).toContain(`cb=dial`);
    expect(res.twiml).toContain(`cb=child`);
    expect(res.twiml).toContain("answerOnBridge");
  });

  it("surfaces a database failure as retryable instead of a silent hangup", async () => {
    const db = makeDb(baseTables({ calls: { select: () => ({ data: null, error: { message: "boom" } }) } }), okRpcs);
    await expect(handleVoiceWebhook(deps(db), form({ CallSid: PARENT_SID }, `callId=${CALL}`)))
      .rejects.toBeInstanceOf(RetryableCallError);
  });

  it("rejects a mismatched CallSid", async () => {
    const db = makeDb(baseTables(), okRpcs);
    const res = await handleVoiceWebhook(deps(db), form({ CallSid: FOREIGN_SID }, `callId=${CALL}`));
    expect(res.status).toBe(403);
    expect(res.twiml).toContain("<Hangup/>");
  });
});

// ---------------------------------------------------------------------------
// 4. call-status
// ---------------------------------------------------------------------------
describe("call-status validation", () => {
  const db = () => makeDb(baseTables(), okRpcs);

  it("rejects an invalid SID format", async () => {
    const res = await handleStatusCallback(deps(db()), form({ CallSid: "CAnothex", CallStatus: "completed" }, `callId=${CALL}&cb=parent`));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid callId", async () => {
    const res = await handleStatusCallback(deps(db()), form({ CallSid: PARENT_SID, CallStatus: "completed" }, "callId=abc&cb=parent"));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown callback kind", async () => {
    const res = await handleStatusCallback(deps(db()), form({ CallSid: PARENT_SID, CallStatus: "completed" }, `callId=${CALL}`));
    expect(res.status).toBe(400);
  });

  it("rejects a foreign AccountSid", async () => {
    const req = form({ CallSid: PARENT_SID, CallStatus: "completed" }, `callId=${CALL}&cb=parent`);
    req.params.AccountSid = OTHER_ACCOUNT;
    const res = await handleStatusCallback(deps(db()), req);
    expect(res.status).toBe(403);
  });

  it("ignores arbitrary durations", () => {
    expect(parseDurationSeconds("12")).toBe(12);
    expect(parseDurationSeconds("-3")).toBeNull();
    expect(parseDurationSeconds("2026-01-01T00:00:00Z")).toBeNull();
    expect(parseDurationSeconds("999999")).toBeNull();
  });
});

describe("call-status leg handling", () => {
  it("never binds a child from ParentCallSid alone — Twilio must confirm", async () => {
    const tw = twilioOk({
      fetchCall: vi.fn(async (sid: string) => ({ sid, accountSid: ACCOUNT, parentCallSid: FOREIGN_SID })),
    });
    const db = makeDb(baseTables(), okRpcs);
    const res = await handleStatusCallback(
      deps(db, tw),
      form({ CallSid: CHILD_SID, ParentCallSid: PARENT_SID, CallStatus: "completed" }, `callId=${CALL}&cb=child`),
    );
    expect(res.status).toBe(403);
    expect(db.rpcCalls.some((c: any) => c.name === "bind_call_leg_sid")).toBe(false);
  });

  it("binds the child leg after Twilio confirms the parent", async () => {
    const db = makeDb(baseTables(), okRpcs);
    const res = await handleStatusCallback(
      deps(db),
      form({ CallSid: CHILD_SID, ParentCallSid: PARENT_SID, CallStatus: "answered" }, `callId=${CALL}&cb=child`),
    );
    expect(res.status).toBe(200);
    const bind = db.rpcCalls.find((c: any) => c.name === "bind_call_leg_sid");
    expect(bind.args).toMatchObject({ p_leg: "child", p_sid: CHILD_SID, p_parent_sid: PARENT_SID });
  });

  it("routes the Dial action as a child outcome using DialCallStatus", async () => {
    const db = makeDb(baseTables(), okRpcs);
    const res = await handleStatusCallback(
      deps(db),
      form(
        { CallSid: PARENT_SID, DialCallStatus: "no-answer", DialCallSid: CHILD_SID, CallStatus: "in-progress" },
        `callId=${CALL}&cb=dial`,
      ),
    );
    expect(res.status).toBe(200);
    const apply = db.rpcCalls.find((c: any) => c.name === "apply_call_leg_status");
    expect(apply.args).toMatchObject({ p_leg: "child", p_status: "no_answer", p_source: "dial_action" });
  });

  it("lets the database decide ordering (no client-side rank shortcut)", async () => {
    const db = makeDb(baseTables({ calls: { select: () => ({ data: call({ parent_status: "completed" }), error: null }) } }), {
      ...okRpcs,
      apply_call_leg_status: () => ({ data: [{ result: "out_of_order", aggregate_status: "unknown" }], error: null }),
    });
    const res = await handleStatusCallback(deps(db), form({ CallSid: PARENT_SID, CallStatus: "ringing" }, `callId=${CALL}&cb=parent`));
    expect(res.status).toBe(200);
    expect(res.body.result).toBe("out_of_order");
    expect(db.rpcCalls.some((c: any) => c.name === "apply_call_leg_status")).toBe(true);
  });

  it("fails closed when the status RPC is missing", async () => {
    const db = makeDb(baseTables(), { reserve_call_slot: okRpcs.reserve_call_slot });
    await expect(
      handleStatusCallback(deps(db), form({ CallSid: PARENT_SID, CallStatus: "completed" }, `callId=${CALL}&cb=parent`)),
    ).rejects.toBeInstanceOf(MissingDependencyError);
  });
});

// ---------------------------------------------------------------------------
// 5. Honest outcomes
// ---------------------------------------------------------------------------
describe("deriveOverallStatus honesty", () => {
  it("reports unknown for a completed parent with no child evidence", () => {
    expect(deriveOverallStatus({ parent: "completed" })).toBe("unknown");
  });

  it("reports carrier_answered for a child completed without in-progress", () => {
    expect(deriveOverallStatus({ parent: "completed", child: "completed" })).toBe("carrier_answered");
  });

  it("reports completed only when the child bridged", () => {
    expect(deriveOverallStatus({ parent: "completed", child: "completed", bridged: true })).toBe("completed");
  });

  it("keeps child failure over parent completion", () => {
    expect(deriveOverallStatus({ parent: "completed", child: "no_answer" })).toBe("no_answer");
  });
});
