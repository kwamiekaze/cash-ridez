/**
 * Executes docs/pending-migrations/calling.sql against a real Postgres engine
 * (PGlite) on top of a minimal Supabase-shaped schema, so the DATABASE — not a
 * mock — is what proves the calling invariants.
 *
 * LIMITATION: PGlite is a single-connection engine, so genuinely simultaneous
 * sessions cannot be spawned. Concurrency is exercised as strictly serialised
 * transactions (the outcome an advisory lock forces anyway); true multi-session
 * contention still has to be verified against the hosted database after the
 * migration is applied.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SQL_PATH = resolve(__dirname, "../../../../docs/pending-migrations/calling.sql");

const ACCOUNT = "AC" + "a".repeat(32);
const PARENT_SID = "CA" + "1".repeat(32);
const CHILD_SID = "CA" + "2".repeat(32);
const OTHER_SID = "CA" + "3".repeat(32);

const RIDER = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const TRIP = "33333333-3333-4333-8333-333333333333";

let db: PGlite;

const asService = async (sql: string, params: any[] = []) => {
  await db.query(`SELECT set_config('request.jwt.role', 'service_role', false)`);
  return await db.query(sql, params);
};
const asAuthenticated = async (sql: string, params: any[] = []) => {
  await db.query(`SELECT set_config('request.jwt.role', 'authenticated', false)`);
  return await db.query(sql, params);
};

async function newCall(id: string, token: string | null, initiator = RIDER) {
  await asService(
    `INSERT INTO public.calls (id, trip_id, rider_id, driver_id, initiated_by_user_id, status, reservation_token)
     VALUES ($1, $2, $3, $4, $5, 'initiated', $6)`,
    [id, TRIP, RIDER, DRIVER, initiator, token],
  );
}

beforeAll(async () => {
  db = new PGlite();

  // --- Supabase-shaped shims -------------------------------------------------
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.role', true) $$;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
    CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT false $$;

    CREATE TABLE public.ride_requests (id uuid PRIMARY KEY);
    CREATE TABLE public.calls (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id uuid NOT NULL,
      rider_id uuid NOT NULL,
      driver_id uuid NOT NULL,
      initiated_by_user_id uuid NOT NULL,
      status text,
      twilio_call_sid_rider text,
      twilio_call_sid_driver text,
      started_at timestamptz,
      ended_at timestamptz,
      duration_seconds integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
  `);
  await db.exec(`INSERT INTO public.ride_requests (id) VALUES ('${TRIP}');`);

  // The pending migration, verbatim.
  await db.exec(readFileSync(SQL_PATH, "utf8"));
});

describe("reservations", () => {
  it("grants one winner and reports busy for a second attempt", async () => {
    const a: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [RIDER, TRIP]);
    const b: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [DRIVER, TRIP]);
    expect(a.rows[0].outcome).toBe("granted");
    expect(a.rows[0].token).toBeTruthy();
    expect(b.rows[0].outcome).toBe("busy");
    await asService(`SELECT public.release_call_slot($1)`, [a.rows[0].token]);
  });

  it("reclaims an expired lease atomically", async () => {
    const a: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 15)`, [RIDER, TRIP]);
    await asService(`UPDATE public.call_reservations SET expires_at = now() - interval '1 minute' WHERE token = $1`, [a.rows[0].token]);
    const b: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 15)`, [DRIVER, TRIP]);
    expect(b.rows[0].outcome).toBe("granted");
    await asService(`SELECT public.release_call_slot($1)`, [b.rows[0].token]);
  });

  it("clamps out-of-range lease bounds", async () => {
    const a: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 99999)`, [RIDER, TRIP]);
    const row: any = await asService(
      `SELECT extract(epoch from (expires_at - created_at))::int AS secs FROM public.call_reservations WHERE token = $1`,
      [a.rows[0].token],
    );
    expect(row.rows[0].secs).toBeLessThanOrEqual(300);
    await asService(`SELECT public.release_call_slot($1)`, [a.rows[0].token]);
  });

  it("ignores a wrong token on release", async () => {
    const a: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [RIDER, TRIP]);
    const wrong: any = await asService(`SELECT public.release_call_slot($1) AS ok`, ["99999999-9999-4999-8999-999999999999"]);
    expect(wrong.rows[0].ok).toBe(false);
    const busy: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [DRIVER, TRIP]);
    expect(busy.rows[0].outcome).toBe("busy");
    const ok: any = await asService(`SELECT public.release_call_slot($1) AS ok`, [a.rows[0].token]);
    expect(ok.rows[0].ok).toBe(true);
  });

  it("counts confirmed attempts only in the rate guard", async () => {
    await asService(`DELETE FROM public.call_reservations`);
    for (let i = 0; i < 6; i++) {
      const r: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [RIDER, TRIP]);
      expect(r.rows[0].outcome).toBe("granted"); // unconfirmed attempts do not count
      await asService(`SELECT public.release_call_slot($1)`, [r.rows[0].token]);
    }
    for (let i = 0; i < 5; i++) {
      const r: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [RIDER, TRIP]);
      await asService(`SELECT public.confirm_call_attempt($1)`, [r.rows[0].token]);
      await asService(`SELECT public.release_call_slot($1)`, [r.rows[0].token]);
    }
    const limited: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [RIDER, TRIP]);
    expect(limited.rows[0].outcome).toBe("rate_limited");
    await asService(`DELETE FROM public.call_reservations`);
  });

  it("denies non-service callers", async () => {
    await expect(asAuthenticated(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [RIDER, TRIP])).rejects.toThrow(/service-role only/);
    await expect(asAuthenticated(`SELECT public.release_call_slot(gen_random_uuid())`)).rejects.toThrow(/service-role only/);
    await expect(
      asAuthenticated(`SELECT public.bind_call_leg_sid(gen_random_uuid(), 'parent', $1, $2, NULL, NULL, NULL)`, [PARENT_SID, ACCOUNT]),
    ).rejects.toThrow(/service-role only/);
  });
});

describe("SID binding", () => {
  const CALL_A = "aaaaaaaa-0000-4000-8000-000000000001";
  const CALL_B = "aaaaaaaa-0000-4000-8000-000000000002";

  beforeAll(async () => {
    await newCall(CALL_A, null);
    await newCall(CALL_B, null);
  });

  it("binds the parent leg once and is idempotent for the same SID", async () => {
    const first: any = await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,NULL) AS r`, [CALL_A, PARENT_SID, ACCOUNT, TRIP]);
    expect(first.rows[0].r).toBe("bound");
    const again: any = await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,NULL) AS r`, [CALL_A, PARENT_SID, ACCOUNT, TRIP]);
    expect(again.rows[0].r).toBe("already_bound");
    const row: any = await asService(`SELECT twilio_call_sid_rider FROM public.calls WHERE id = $1`, [CALL_A]);
    expect(row.rows[0].twilio_call_sid_rider).toBe(PARENT_SID);
  });

  it("rejects the same SID on the other leg of the same call (cross-column duplicate)", async () => {
    const r: any = await asService(`SELECT public.bind_call_leg_sid($1,'child',$2,$3,$2,$4,NULL) AS r`, [CALL_A, PARENT_SID, ACCOUNT, TRIP]);
    expect(r.rows[0].r).toBe("sid_taken");
  });

  it("rejects the same SID on a different call", async () => {
    const r: any = await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,NULL) AS r`, [CALL_B, PARENT_SID, ACCOUNT, TRIP]);
    expect(r.rows[0].r).toBe("sid_taken");
  });

  it("rejects a child whose parent SID does not match the bound parent", async () => {
    const r: any = await asService(`SELECT public.bind_call_leg_sid($1,'child',$2,$3,$4,$5,NULL) AS r`, [CALL_A, CHILD_SID, ACCOUNT, OTHER_SID, TRIP]);
    expect(r.rows[0].r).toBe("parent_mismatch");
  });

  it("rejects a fencing-token or trip mismatch", async () => {
    const CALL_T = "aaaaaaaa-0000-4000-8000-000000000003";
    const token = "66666666-6666-4666-8666-666666666666";
    await newCall(CALL_T, token);
    const bad: any = await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,$5) AS r`, [
      CALL_T, OTHER_SID, ACCOUNT, TRIP, "77777777-7777-4777-8777-777777777777",
    ]);
    expect(bad.rows[0].r).toBe("token_mismatch");
    const badTrip: any = await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,$5) AS r`, [
      CALL_T, OTHER_SID, ACCOUNT, "88888888-8888-4888-8888-888888888888", token,
    ]);
    expect(badTrip.rows[0].r).toBe("trip_mismatch");
  });

  it("rejects malformed SIDs outright", async () => {
    await expect(asService(`SELECT public.bind_call_leg_sid($1,'parent','CAnope',$2,NULL,NULL,NULL)`, [CALL_B, ACCOUNT])).rejects.toThrow(/invalid sid/);
  });

  it("binds the real child leg", async () => {
    const r: any = await asService(`SELECT public.bind_call_leg_sid($1,'child',$2,$3,$4,$5,NULL) AS r`, [CALL_A, CHILD_SID, ACCOUNT, PARENT_SID, TRIP]);
    expect(r.rows[0].r).toBe("bound");
  });
});

describe("leg status transitions", () => {
  const CALL_S = "bbbbbbbb-0000-4000-8000-000000000001";
  const P = "CA" + "4".repeat(32);
  const C = "CA" + "5".repeat(32);
  const token = "99999999-1111-4111-8111-111111111111";

  beforeAll(async () => {
    await newCall(CALL_S, token);
    await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,$5)`, [CALL_S, P, ACCOUNT, TRIP, token]);
    await asService(`SELECT public.bind_call_leg_sid($1,'child',$2,$3,$4,$5,$6)`, [CALL_S, C, ACCOUNT, P, TRIP, token]);
  });

  it("applies a forward transition and ignores duplicates and out-of-order events", async () => {
    const a: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'parent',$2,$3,'ringing','parent_status',NULL)`, [CALL_S, P, ACCOUNT]);
    expect(a.rows[0].result).toBe("applied");
    const dup: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'parent',$2,$3,'ringing','parent_status',NULL)`, [CALL_S, P, ACCOUNT]);
    expect(dup.rows[0].result).toBe("duplicate");
    const back: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'parent',$2,$3,'initiated','parent_status',NULL)`, [CALL_S, P, ACCOUNT]);
    expect(back.rows[0].result).toBe("out_of_order");
  });

  it("rejects a status carrying the wrong SID", async () => {
    const r: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'parent',$2,$3,'completed','parent_status',NULL)`, [CALL_S, OTHER_SID, ACCOUNT]);
    expect(r.rows[0].result).toBe("sid_mismatch");
  });

  it("marks bridged and completed only after the child was in progress", async () => {
    await asService(`SELECT * FROM public.apply_call_leg_status($1,'child',$2,$3,'in_progress','child_status',NULL)`, [CALL_S, C, ACCOUNT]);
    const done: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'child',$2,$3,'completed','child_status',30)`, [CALL_S, C, ACCOUNT]);
    expect(done.rows[0].aggregate_status).toBe("completed");
    expect(done.rows[0].bridged).toBe(true);
  });

  it("releases the reservation when the parent reaches a terminal state", async () => {
    const res: any = await asService(`SELECT * FROM public.reserve_call_slot($1, $2, 90)`, [RIDER, TRIP]);
    await asService(`UPDATE public.calls SET reservation_token = $1 WHERE id = $2`, [res.rows[0].token, CALL_S]);
    await asService(`SELECT * FROM public.apply_call_leg_status($1,'parent',$2,$3,'completed','parent_status',42)`, [CALL_S, P, ACCOUNT]);
    const row: any = await asService(`SELECT released_at FROM public.call_reservations WHERE token = $1`, [res.rows[0].token]);
    expect(row.rows[0].released_at).toBeTruthy();
    const call: any = await asService(`SELECT duration_seconds, ended_at FROM public.calls WHERE id = $1`, [CALL_S]);
    expect(call.rows[0].duration_seconds).toBe(42);
    expect(call.rows[0].ended_at).toBeTruthy();
  });

  it("keeps a completed parent with no child data as unknown, not no_answer", async () => {
    const CALL_U = "bbbbbbbb-0000-4000-8000-000000000002";
    const PU = "CA" + "6".repeat(32);
    await newCall(CALL_U, null);
    await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,NULL)`, [CALL_U, PU, ACCOUNT, TRIP]);
    const r: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'parent',$2,$3,'completed','parent_status',10)`, [CALL_U, PU, ACCOUNT]);
    expect(r.rows[0].aggregate_status).toBe("unknown");
  });

  it("labels a child that completed without answering as carrier_answered", async () => {
    const CALL_V = "bbbbbbbb-0000-4000-8000-000000000003";
    const PV = "CA" + "7".repeat(32);
    const CV = "CA" + "8".repeat(32);
    await newCall(CALL_V, null);
    await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,NULL)`, [CALL_V, PV, ACCOUNT, TRIP]);
    await asService(`SELECT public.bind_call_leg_sid($1,'child',$2,$3,$4,$5,NULL)`, [CALL_V, CV, ACCOUNT, PV, TRIP]);
    const r: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'child',$2,$3,'completed','child_status',12)`, [CALL_V, CV, ACCOUNT]);
    expect(r.rows[0].aggregate_status).toBe("carrier_answered");
  });

  it("keeps child failure sticky against a later dial action", async () => {
    const CALL_W = "bbbbbbbb-0000-4000-8000-000000000004";
    const PW = "CA" + "9".repeat(32);
    const CW = "CA" + "b".repeat(32);
    await newCall(CALL_W, null);
    await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,NULL)`, [CALL_W, PW, ACCOUNT, TRIP]);
    await asService(`SELECT public.bind_call_leg_sid($1,'child',$2,$3,$4,$5,NULL)`, [CALL_W, CW, ACCOUNT, PW, TRIP]);
    await asService(`SELECT * FROM public.apply_call_leg_status($1,'child',$2,$3,'no_answer','child_status',NULL)`, [CALL_W, CW, ACCOUNT]);
    const late: any = await asService(`SELECT * FROM public.apply_call_leg_status($1,'child',$2,$3,'completed','dial_action',NULL)`, [CALL_W, CW, ACCOUNT]);
    expect(late.rows[0].result).toBe("ignored_source");
    const call: any = await asService(`SELECT status FROM public.calls WHERE id = $1`, [CALL_W]);
    expect(call.rows[0].status).toBe("no_answer");
  });

  it("rolls back the whole transition when the transaction aborts", async () => {
    const CALL_R = "cccccccc-0000-4000-8000-000000000001";
    const PR = "CA" + "c".repeat(32);
    await newCall(CALL_R, null);
    await asService(`SELECT public.bind_call_leg_sid($1,'parent',$2,$3,NULL,$4,NULL)`, [CALL_R, PR, ACCOUNT, TRIP]);
    await db.query(`SELECT set_config('request.jwt.role', 'service_role', false)`);
    await db.exec("BEGIN");
    await db.query(`SELECT * FROM public.apply_call_leg_status($1,'parent',$2,$3,'ringing','parent_status',NULL)`, [CALL_R, PR, ACCOUNT]);
    await db.exec("ROLLBACK");
    const row: any = await asService(`SELECT parent_status FROM public.calls WHERE id = $1`, [CALL_R]);
    expect(row.rows[0].parent_status).toBeNull();
  });
});
