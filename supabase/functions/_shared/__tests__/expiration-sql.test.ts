/**
 * Executes docs/pending-migrations/connections.sql followed by
 * docs/pending-migrations/expiration.sql against a real Postgres engine
 * (PGlite), so the DATABASE proves the 48-hour expiration invariants.
 *
 * LIMITATION: PGlite has no pg_cron, so the schedule itself is not exercised
 * (the migration guards on pg_available_extensions and skips it). The function
 * the schedule calls IS exercised, including the initial backfill path.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const CONNECTIONS_SQL = resolve(__dirname, "../../../../docs/pending-migrations/connections.sql");
const EXPIRATION_SQL = resolve(__dirname, "../../../../docs/pending-migrations/expiration.sql");

const RIDER = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ADMIN = "44444444-4444-4444-8444-444444444444";

let db: PGlite;

const sql = (q: string, p: any[] = []) => db.query(q, p) as Promise<any>;

const asRole = async (role: "anon" | "authenticated" | "service_role", uid: string | null) => {
  await sql(`RESET ROLE`);
  await sql(`SELECT set_config('request.jwt.sub', $1, false)`, [uid ?? ""]);
  await sql(`SELECT set_config('request.jwt.claim.role', $1, false)`, [role]);
  await sql(`SET ROLE ${role}`);
};
const asOwner = async () => {
  await sql(`RESET ROLE`);
  await sql(`SELECT set_config('request.jwt.claim.role', '', false)`);
};

/** hours in the past, as a timestamptz literal parameter */
const hoursAgo = (h: number) => `now() - interval '${h} hours'`;

const makeRide = async (
  id: string,
  status: "open" | "assigned" | "completed" | "cancelled",
  pickupHoursAgo: number,
  driverId: string | null = null,
) => {
  await asOwner();
  await sql(
    `INSERT INTO public.ride_requests (id, rider_id, assigned_driver_id, status, pickup_time)
     VALUES ($1,$2,$3,$4::ride_status, ${hoursAgo(pickupHoursAgo)})
     ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           assigned_driver_id = EXCLUDED.assigned_driver_id,
           pickup_time = EXCLUDED.pickup_time`,
    [id, RIDER, driverId, status],
  );
};

/** Writes the ledger + counters the way a real acceptance would have. */
const connect = async (rideId: string, driverId = DRIVER, riderId = RIDER) => {
  await asOwner();
  await sql(
    `INSERT INTO public.trip_connections (ride_request_id, user_id, role)
     VALUES ($1,$2,'rider'), ($1,$3,'driver') ON CONFLICT DO NOTHING`,
    [rideId, riderId, driverId],
  );
  await sql(
    `UPDATE public.profiles SET connected_trips_count =
       (SELECT count(*) FROM public.trip_connections tc WHERE tc.user_id = profiles.id)
     WHERE id IN ($1,$2)`,
    [riderId, driverId],
  );
};

const expire = async () => {
  await asOwner();
  const r = await sql(`SELECT public.expire_stale_rides() AS out`);
  return r.rows[0].out;
};

const rideStatus = async (id: string) => {
  await asOwner();
  const r = await sql(`SELECT status FROM public.ride_requests WHERE id=$1`, [id]);
  return r.rows[0].status;
};

const counted = async (id: string) => {
  await asOwner();
  const r = await sql(`SELECT connected_trips_count c FROM public.profiles WHERE id=$1`, [id]);
  return r.rows[0].c;
};

beforeAll(async () => {
  db = new PGlite();

  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
      LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role')
      $$;

    CREATE TYPE public.app_role AS ENUM ('admin','driver','rider');
    CREATE TYPE public.ride_status AS ENUM ('open','assigned','completed','cancelled');
    CREATE TYPE public.verification_status AS ENUM ('pending','approved','rejected');

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      stripe_customer_id text,
      stripe_subscription_id text,
      subscription_active boolean DEFAULT false,
      subscription_status text,
      subscription_started_at timestamptz,
      subscription_expires_at timestamptz,
      subscription_current_period_end bigint,
      connected_trips_count integer NOT NULL DEFAULT 0,
      completed_trips_count integer NOT NULL DEFAULT 0,
      free_uses_remaining integer DEFAULT 3,
      cancel_count integer DEFAULT 0,
      warning_count integer DEFAULT 0,
      chat_message_count integer DEFAULT 0,
      chat_blocked boolean DEFAULT false,
      driver_rating_avg numeric,
      driver_rating_count integer DEFAULT 0,
      rider_rating_avg numeric,
      rider_rating_count integer DEFAULT 0,
      is_verified boolean DEFAULT false,
      verification_status public.verification_status DEFAULT 'pending',
      verification_reviewed_at timestamptz,
      verification_reviewer_id uuid,
      verification_notes text,
      blocked boolean DEFAULT false,
      blocked_at timestamptz,
      blocked_by uuid,
      blocked_reason text,
      blocked_until timestamptz,
      paused boolean DEFAULT false,
      admin_locked_fields text[],
      is_member boolean DEFAULT false,
      billing_sync_generation bigint DEFAULT 0,
      billing_sync_applied bigint DEFAULT 0,
      active_assigned_ride_id uuid
    );

    CREATE TABLE public.ride_requests (
      id uuid PRIMARY KEY,
      rider_id uuid NOT NULL REFERENCES public.profiles(id),
      assigned_driver_id uuid REFERENCES public.profiles(id),
      status public.ride_status NOT NULL DEFAULT 'open',
      pickup_time timestamptz,
      eta_minutes integer,
      driver_completed boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.counter_offers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ride_request_id uuid NOT NULL REFERENCES public.ride_requests(id),
      by_user_id uuid NOT NULL,
      amount numeric NOT NULL,
      role text,
      status text NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE public.user_roles (
      user_id uuid NOT NULL,
      role public.app_role NOT NULL,
      UNIQUE (user_id, role)
    );

    CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
    $$;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE ON public.profiles, public.ride_requests, public.counter_offers
      TO authenticated, service_role;
    GRANT SELECT ON public.user_roles TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
  `);

  await db.exec(readFileSync(CONNECTIONS_SQL, "utf8"));
  await db.exec(readFileSync(EXPIRATION_SQL, "utf8"));

  await db.exec(`
    INSERT INTO public.profiles (id, is_verified, verification_status) VALUES
      ('${RIDER}', true, 'approved'),
      ('${DRIVER}', true, 'approved'),
      ('${OTHER}', true, 'approved'),
      ('${ADMIN}', true, 'approved');
    INSERT INTO public.user_roles (user_id, role) VALUES ('${ADMIN}', 'admin');
  `);
});

beforeEach(async () => {
  await asOwner();
  await sql(`DELETE FROM public.trip_connections`);
  await sql(`DELETE FROM public.counter_offers`);
  await sql(`UPDATE public.profiles SET active_assigned_ride_id = NULL`);
  await sql(`DELETE FROM public.ride_requests`);
  await sql(`UPDATE public.profiles SET connected_trips_count = 0`);
});

describe("expire_stale_rides", () => {
  it("expires an open trip whose pickup time is over 48 hours old", async () => {
    const ride = "bbbbbbbb-0000-4000-8000-000000000001";
    await makeRide(ride, "open", 49);
    const out = await expire();
    expect(out.expired_open).toBe(1);
    expect(await rideStatus(ride)).toBe("expired");
  });

  it("expires an assigned trip, refunds both counters and clears the driver pointer", async () => {
    const ride = "bbbbbbbb-0000-4000-8000-000000000002";
    await makeRide(ride, "assigned", 72, DRIVER);
    await connect(ride);
    await sql(`UPDATE public.profiles SET active_assigned_ride_id=$1 WHERE id=$2`, [ride, DRIVER]);
    expect(await counted(RIDER)).toBe(1);
    expect(await counted(DRIVER)).toBe(1);

    const out = await expire();
    expect(out.expired_assigned).toBe(1);
    expect(await rideStatus(ride)).toBe("expired");
    expect(await counted(RIDER)).toBe(0);
    expect(await counted(DRIVER)).toBe(0);

    const p = await sql(`SELECT active_assigned_ride_id a FROM public.profiles WHERE id=$1`, [DRIVER]);
    expect(p.rows[0].a).toBeNull();

    const led = await sql(`SELECT count(*)::int n FROM public.trip_connections WHERE ride_request_id=$1`, [ride]);
    expect(led.rows[0].n).toBe(0);
  });

  it("closes pending counter offers so the trip cannot be accepted later", async () => {
    const ride = "bbbbbbbb-0000-4000-8000-000000000003";
    await makeRide(ride, "open", 60);
    const o = await sql(
      `INSERT INTO public.counter_offers (ride_request_id, by_user_id, amount, role)
       VALUES ($1,$2,40,'driver') RETURNING id`,
      [ride, DRIVER],
    );
    const out = await expire();
    expect(out.offers_closed).toBe(1);
    const s = await sql(`SELECT status FROM public.counter_offers WHERE id=$1`, [o.rows[0].id]);
    expect(s.rows[0].status).toBe("rejected");
  });

  it("leaves completed and cancelled history untouched", async () => {
    const done = "bbbbbbbb-0000-4000-8000-000000000004";
    const cancelled = "bbbbbbbb-0000-4000-8000-000000000005";
    await makeRide(done, "completed", 500, DRIVER);
    await makeRide(cancelled, "cancelled", 500, DRIVER);
    await connect(done);
    await expire();
    expect(await rideStatus(done)).toBe("completed");
    expect(await rideStatus(cancelled)).toBe("cancelled");
    expect(await counted(RIDER)).toBe(1);
    expect(await counted(DRIVER)).toBe(1);
  });

  it("respects the exact 48-hour boundary", async () => {
    const fresh = "bbbbbbbb-0000-4000-8000-000000000006";
    const stale = "bbbbbbbb-0000-4000-8000-000000000007";
    await asOwner();
    await sql(
      `INSERT INTO public.ride_requests (id, rider_id, status, pickup_time)
       VALUES ($1,$2,'open', now() - interval '48 hours' + interval '1 minute')`,
      [fresh, RIDER],
    );
    await sql(
      `INSERT INTO public.ride_requests (id, rider_id, status, pickup_time)
       VALUES ($1,$2,'open', now() - interval '48 hours' - interval '1 minute')`,
      [stale, RIDER],
    );
    const out = await expire();
    expect(out.expired_open).toBe(1);
    expect(await rideStatus(fresh)).toBe("open");
    expect(await rideStatus(stale)).toBe("expired");
  });

  it("is idempotent across repeated runs", async () => {
    const ride = "bbbbbbbb-0000-4000-8000-000000000008";
    await makeRide(ride, "assigned", 96, DRIVER);
    await connect(ride);
    const first = await expire();
    expect(first.expired_assigned).toBe(1);

    const second = await expire();
    expect(second.expired_open).toBe(0);
    expect(second.expired_assigned).toBe(0);
    expect(second.offers_closed).toBe(0);
    expect(second.profiles_recounted).toBe(0);
    expect(await counted(RIDER)).toBe(0);
    expect(await counted(DRIVER)).toBe(0);
  });

  it("never drives a counter negative and never touches other trips' counters", async () => {
    const stale = "bbbbbbbb-0000-4000-8000-000000000009";
    const live = "bbbbbbbb-0000-4000-8000-00000000000a";
    await makeRide(stale, "assigned", 200, DRIVER);
    await makeRide(live, "assigned", 1, DRIVER);
    await connect(stale);
    await connect(live);
    expect(await counted(DRIVER)).toBe(2);

    // A pre-existing bad counter must not go below zero either.
    await sql(`UPDATE public.profiles SET connected_trips_count = 0 WHERE id=$1`, [RIDER]);

    await expire();
    expect(await rideStatus(live)).toBe("assigned");
    expect(await counted(DRIVER)).toBe(1);
    expect(await counted(RIDER)).toBe(1);

    const remaining = await sql(`SELECT count(*)::int n FROM public.trip_connections WHERE ride_request_id=$1`, [live]);
    expect(remaining.rows[0].n).toBe(2);
  });

  it("denies EXECUTE to clients", async () => {
    const r = await sql(
      `SELECT has_function_privilege('anon','public.expire_stale_rides()','EXECUTE') a,
              has_function_privilege('authenticated','public.expire_stale_rides()','EXECUTE') b,
              has_function_privilege('service_role','public.expire_stale_rides()','EXECUTE') c`,
    );
    expect(r.rows[0].a).toBe(false);
    expect(r.rows[0].b).toBe(false);
    // Operational service RPC: the scheduler / service role must keep EXECUTE.
    expect(r.rows[0].c).toBe(true);

    await asRole("authenticated", DRIVER);
    await expect(sql(`SELECT public.expire_stale_rides()`)).rejects.toThrow();
    await asOwner();
  });
});

describe("acceptance race guard", () => {
  it("refuses a stale open trip that the scheduler has not expired yet", async () => {
    const ride = "bbbbbbbb-0000-4000-8000-00000000000b";
    await makeRide(ride, "open", 49);
    await asRole("authenticated", DRIVER);
    const r = await sql(`SELECT public.accept_ride_atomic($1,$2,0,true,NULL) AS out`, [ride, DRIVER]);
    const out = r.rows[0].out;
    expect(out.success).toBe(false);
    expect(out.code).toBe("ride_expired");

    await asOwner();
    // The stale trip is persisted as expired so it cannot be retried.
    expect(await rideStatus(ride)).toBe("expired");
    expect(await counted(RIDER)).toBe(0);
    expect(await counted(DRIVER)).toBe(0);
    const led = await sql(`SELECT count(*)::int n FROM public.trip_connections WHERE ride_request_id=$1`, [ride]);
    expect(led.rows[0].n).toBe(0);
  });

  it("still accepts a trip inside the window", async () => {
    const ride = "bbbbbbbb-0000-4000-8000-00000000000c";
    await makeRide(ride, "open", 2);
    await asRole("authenticated", DRIVER);
    const r = await sql(`SELECT public.accept_ride_atomic($1,$2,10,true,NULL) AS out`, [ride, DRIVER]);
    expect(r.rows[0].out.success).toBe(true);
    await asOwner();
    expect(await rideStatus(ride)).toBe("assigned");
    expect(await counted(DRIVER)).toBe(1);
  });
});
