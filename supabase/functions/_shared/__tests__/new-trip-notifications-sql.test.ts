/**
 * Runs docs/pending-migrations/new-trip-notifications.sql against a real
 * Postgres engine (PGlite) so the DATABASE proves:
 *   * the ON CONFLICT clause matches the PARTIAL unique index (no 42P10),
 *   * the first insert lands and a retry inserts zero rows without error,
 *   * only the service role may call the routine,
 *   * other notification types are untouched by the uniqueness rule.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SQL_PATH = resolve(__dirname, "../../../../docs/pending-migrations/new-trip-notifications.sql");

const RIDER = "11111111-1111-4111-8111-111111111111";
const DRIVER_A = "22222222-2222-4222-8222-222222222222";
const DRIVER_B = "33333333-3333-4333-8333-333333333333";
const RIDE = "55555555-5555-4555-8555-555555555555";
const OTHER_RIDE = "66666666-6666-4666-8666-666666666666";

let db: PGlite;
const sql = (q: string, p: any[] = []) => db.query(q, p) as Promise<any>;

const asRole = async (role: "anon" | "authenticated" | "service_role") => {
  await sql(`RESET ROLE`);
  await sql(`SELECT set_config('request.jwt.claim.role', $1, false)`, [role]);
  await sql(`SET ROLE ${role}`);
};
const asOwner = async () => {
  await sql(`RESET ROLE`);
  await sql(`SELECT set_config('request.jwt.claim.role', 'service_role', false)`);
};

const row = (userId: string, rideId = RIDE) => ({
  user_id: userId,
  related_user_id: RIDER,
  related_ride_id: rideId,
  type: "new_trip",
  title: "New Trip Request Near You",
  message: "Jane posted a trip request near you.",
  link: `/trip/${rideId}`,
});

const insert = async (rows: unknown[]) => {
  const r = await sql(`SELECT public.insert_new_trip_notifications($1::jsonb) AS n`, [
    JSON.stringify(rows),
  ]);
  return Number(r.rows[0].n);
};

const countNewTrip = async () => {
  await asOwner();
  const r = await sql(`SELECT count(*)::int AS c FROM public.notifications WHERE type='new_trip'`);
  return r.rows[0].c;
};

beforeAll(async () => {
  db = new PGlite();

  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role')
      $$;

    CREATE OR REPLACE FUNCTION public.assert_service_role() RETURNS void
      LANGUAGE plpgsql SET search_path TO 'public' AS $$
      BEGIN
        IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
          RAISE EXCEPTION 'service-role only';
        END IF;
      END;
      $$;

    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      type text NOT NULL,
      title text NOT NULL,
      message text NOT NULL,
      link text,
      read boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      related_ride_id uuid,
      related_user_id uuid,
      chat_id uuid
    );
    GRANT SELECT, INSERT ON public.notifications TO service_role;
  `);

  await db.exec(readFileSync(SQL_PATH, "utf8"));
});

beforeEach(async () => {
  await asOwner();
  await sql(`DELETE FROM public.notifications`);
});

describe("partial unique index inference", () => {
  it("accepts the routine's ON CONFLICT clause (no 42P10)", async () => {
    await asOwner();
    const plan = await sql(`
      EXPLAIN INSERT INTO public.notifications (user_id, related_ride_id, type, title, message)
      VALUES ($1::uuid, $2::uuid, 'new_trip', 't', 'm')
      ON CONFLICT (user_id, related_ride_id, type)
        WHERE type = 'new_trip' AND related_ride_id IS NOT NULL
        DO NOTHING
    `, [DRIVER_A, RIDE]);
    expect(plan.rows.length).toBeGreaterThan(0);
    expect(await countNewTrip()).toBe(0); // EXPLAIN alone inserts nothing
  });

  it("rejects the same clause without the predicate, proving the index is partial", async () => {
    await asOwner();
    await expect(
      sql(`
        EXPLAIN INSERT INTO public.notifications (user_id, related_ride_id, type, title, message)
        VALUES ($1::uuid, $2::uuid, 'new_trip', 't', 'm')
        ON CONFLICT (user_id, related_ride_id, type) DO NOTHING
      `, [DRIVER_A, RIDE]),
    ).rejects.toThrow(/no unique or exclusion constraint/i);
  });
});

describe("insert_new_trip_notifications", () => {
  it("inserts once and reports the real inserted count", async () => {
    await asRole("service_role");
    expect(await insert([row(DRIVER_A), row(DRIVER_B)])).toBe(2);
    expect(await countNewTrip()).toBe(2);
  });

  it("is idempotent: a retry inserts zero rows without error", async () => {
    await asRole("service_role");
    expect(await insert([row(DRIVER_A), row(DRIVER_B)])).toBe(2);
    await asRole("service_role");
    expect(await insert([row(DRIVER_A), row(DRIVER_B)])).toBe(0);
    expect(await countNewTrip()).toBe(2);
  });

  it("inserts only the new recipients on a partially overlapping retry", async () => {
    await asRole("service_role");
    expect(await insert([row(DRIVER_A)])).toBe(1);
    await asRole("service_role");
    expect(await insert([row(DRIVER_A), row(DRIVER_B)])).toBe(1);
    expect(await countNewTrip()).toBe(2);
  });

  it("keeps alerts for different rides separate", async () => {
    await asRole("service_role");
    expect(await insert([row(DRIVER_A), row(DRIVER_A, OTHER_RIDE)])).toBe(2);
    expect(await countNewTrip()).toBe(2);
  });

  it("tolerates an empty array and a null payload", async () => {
    await asRole("service_role");
    expect(await insert([])).toBe(0);
    await asRole("service_role");
    const r = await sql(`SELECT public.insert_new_trip_notifications(NULL) AS n`);
    expect(Number(r.rows[0].n)).toBe(0);
  });

  it("skips malformed entries instead of failing the batch", async () => {
    await asRole("service_role");
    expect(await insert([{ related_ride_id: RIDE }, row(DRIVER_A)])).toBe(1);
    expect(await countNewTrip()).toBe(1);
  });

  it("forces the type to new_trip regardless of the payload", async () => {
    await asRole("service_role");
    await insert([{ ...row(DRIVER_A), type: "message" }]);
    await asOwner();
    const r = await sql(`SELECT type FROM public.notifications`);
    expect(r.rows.map((x: any) => x.type)).toEqual(["new_trip"]);
  });
});

describe("other notification types are unaffected", () => {
  it("still allows duplicate non-new_trip rows for the same user and ride", async () => {
    await asOwner();
    for (let i = 0; i < 2; i++) {
      await sql(
        `INSERT INTO public.notifications (user_id, related_ride_id, type, title, message)
         VALUES ($1::uuid, $2::uuid, 'message', 't', 'm')`,
        [DRIVER_A, RIDE],
      );
    }
    const r = await sql(`SELECT count(*)::int AS c FROM public.notifications WHERE type='message'`);
    expect(r.rows[0].c).toBe(2);
  });
});

describe("access control", () => {
  it("refuses signed-in and anonymous callers", async () => {
    for (const role of ["authenticated", "anon"] as const) {
      await asRole(role);
      await expect(insert([row(DRIVER_A)])).rejects.toThrow();
    }
    expect(await countNewTrip()).toBe(0);
  });

  it("grants EXECUTE to service_role only", async () => {
    await asOwner();
    for (const role of ["anon", "authenticated"]) {
      const r = await sql(
        `SELECT has_function_privilege($1, 'public.insert_new_trip_notifications(jsonb)', 'EXECUTE') AS ok`,
        [role],
      );
      expect(r.rows[0].ok).toBe(false);
    }
    const svc = await sql(
      `SELECT has_function_privilege('service_role', 'public.insert_new_trip_notifications(jsonb)', 'EXECUTE') AS ok`,
    );
    expect(svc.rows[0].ok).toBe(true);
  });
});
