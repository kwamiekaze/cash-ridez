/**
 * Executes docs/pending-migrations/connections.sql against a real Postgres
 * engine (PGlite) on a Supabase-shaped schema, so the DATABASE — not a mock —
 * proves the acceptance and quota invariants.
 *
 * LIMITATION: PGlite is single-connection, so genuinely simultaneous sessions
 * cannot be spawned. "Concurrent" accepts are exercised as strictly serialised
 * transactions (the outcome the row locks force anyway); true multi-session
 * contention still needs verifying against the hosted database once applied.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SQL_PATH = resolve(__dirname, "../../../../docs/pending-migrations/connections.sql");

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

const accept = async (rideId: string, driverId: string, offerId: string | null = null, skipActive = true) => {
  const r = await sql(`SELECT public.accept_ride_atomic($1,$2,0,$3,$4) AS out`, [
    rideId, driverId, skipActive, offerId,
  ]);
  return r.rows[0].out;
};

const newRide = async (id: string, riderId = RIDER) => {
  await asOwner();
  await sql(
    `INSERT INTO public.ride_requests (id, rider_id, status) VALUES ($1,$2,'open')
     ON CONFLICT (id) DO UPDATE SET status='open', assigned_driver_id=NULL, rider_id=EXCLUDED.rider_id`,
    [id, riderId],
  );
};

const counted = async (id: string) => {
  await asOwner();
  const r = await sql(`SELECT connected_trips_count c FROM public.profiles WHERE id=$1`, [id]);
  return r.rows[0].c;
};

const setCount = async (id: string, n: number) => {
  await asOwner();
  await sql(`UPDATE public.profiles SET connected_trips_count=$2 WHERE id=$1`, [id, n]);
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
      display_name text,
      bio text,
      phone_number text,
      photo_url text,
      is_map_visible boolean DEFAULT true,
      verification_submitted_at timestamptz,
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
      billing_sync_applied boolean DEFAULT false,
      active_assigned_ride_id uuid
    );

    CREATE TABLE public.ride_requests (
      id uuid PRIMARY KEY,
      rider_id uuid NOT NULL REFERENCES public.profiles(id),
      assigned_driver_id uuid REFERENCES public.profiles(id),
      status public.ride_status NOT NULL DEFAULT 'open',
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

  await db.exec(readFileSync(SQL_PATH, "utf8"));

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
  await sql(`UPDATE public.ride_requests SET status='cancelled'`);
  await sql(
    `UPDATE public.profiles SET connected_trips_count=0, subscription_active=false, subscription_status=NULL,
      blocked=false, paused=false, is_verified=true, verification_status='approved', active_assigned_ride_id=NULL`,
  );
});

describe("authorization", () => {
  it("denies anonymous execute at the grant level", async () => {
    const r = await sql(
      `SELECT has_function_privilege('anon','public.accept_ride_atomic(uuid,uuid,integer,boolean,uuid)','EXECUTE') a,
              has_function_privilege('authenticated','public.accept_ride_atomic(uuid,uuid,integer,boolean,uuid)','EXECUTE') b`,
    );
    expect(r.rows[0].a).toBe(false);
    expect(r.rows[0].b).toBe(true);
  });

  it("refuses a signed-out caller", async () => {
    const ride = "aaaaaaaa-0000-4000-8000-000000000001";
    await newRide(ride);
    await asRole("authenticated", null);
    expect((await accept(ride, DRIVER)).message).toMatch(/Not authorized/);
  });

  it("refuses a third party assigning someone else", async () => {
    const ride = "aaaaaaaa-0000-4000-8000-000000000002";
    await newRide(ride);
    await asRole("authenticated", OTHER);
    expect((await accept(ride, DRIVER)).success).toBe(false);
    await asOwner();
    const r = await sql(`SELECT status, assigned_driver_id FROM public.ride_requests WHERE id=$1`, [ride]);
    expect(r.rows[0].status).toBe("open");
  });

  it("lets a driver assign only themselves", async () => {
    const ride = "aaaaaaaa-0000-4000-8000-000000000003";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    expect((await accept(ride, DRIVER)).success).toBe(true);
  });

  it("refuses a rider accepting their own trip", async () => {
    const ride = "aaaaaaaa-0000-4000-8000-000000000004";
    await newRide(ride);
    await asRole("authenticated", RIDER);
    expect((await accept(ride, RIDER)).message).toMatch(/your own trip/);
  });

  it("lets a rider accept a valid pending offer from that driver", async () => {
    const ride = "aaaaaaaa-0000-4000-8000-000000000005";
    await newRide(ride);
    await asOwner();
    const o = await sql(
      `INSERT INTO public.counter_offers (ride_request_id, by_user_id, amount, role) VALUES ($1,$2,40,'driver') RETURNING id`,
      [ride, DRIVER],
    );
    const offerId = o.rows[0].id;
    await asRole("authenticated", RIDER);
    expect((await accept(ride, DRIVER, offerId)).success).toBe(true);
    await asOwner();
    const s = await sql(`SELECT status FROM public.counter_offers WHERE id=$1`, [offerId]);
    expect(s.rows[0].status).toBe("accepted");
  });

  it("refuses an offer from another trip or another driver", async () => {
    const rideA = "aaaaaaaa-0000-4000-8000-000000000006";
    const rideB = "aaaaaaaa-0000-4000-8000-000000000007";
    await newRide(rideA);
    await newRide(rideB);
    await asOwner();
    const o = await sql(
      `INSERT INTO public.counter_offers (ride_request_id, by_user_id, amount, role) VALUES ($1,$2,40,'driver') RETURNING id`,
      [rideB, DRIVER],
    );
    await asRole("authenticated", RIDER);
    expect((await accept(rideA, DRIVER, o.rows[0].id)).success).toBe(false);

    await asOwner();
    const o2 = await sql(
      `INSERT INTO public.counter_offers (ride_request_id, by_user_id, amount, role) VALUES ($1,$2,40,'driver') RETURNING id`,
      [rideA, OTHER],
    );
    await asRole("authenticated", RIDER);
    expect((await accept(rideA, DRIVER, o2.rows[0].id)).success).toBe(false);
  });

  it("refuses a rider accept without an offer", async () => {
    const ride = "aaaaaaaa-0000-4000-8000-000000000008";
    await newRide(ride);
    await asRole("authenticated", RIDER);
    expect((await accept(ride, DRIVER)).message).toMatch(/Select the offer/);
  });

  it("refuses blocked, paused and unverified drivers", async () => {
    const ride = "aaaaaaaa-0000-4000-8000-000000000009";
    for (const [col, val, msg] of [["blocked", true, /blocked/], ["paused", true, /paused/]] as const) {
      await newRide(ride);
      await asOwner();
      await sql(`UPDATE public.profiles SET ${col}=$2 WHERE id=$1`, [DRIVER, val]);
      await asRole("authenticated", DRIVER);
      expect((await accept(ride, DRIVER)).message).toMatch(msg);
      await asOwner();
      await sql(`UPDATE public.profiles SET ${col}=false WHERE id=$1`, [DRIVER]);
    }
    await newRide(ride);
    await asOwner();
    await sql(`UPDATE public.profiles SET is_verified=false, verification_status='pending' WHERE id=$1`, [DRIVER]);
    await asRole("authenticated", DRIVER);
    expect((await accept(ride, DRIVER)).message).toMatch(/verified/);
  });
});

describe("connection quota", () => {
  it("allows the third connection and blocks the fourth, per participant", async () => {
    for (let i = 0; i < 3; i++) {
      const ride = `bbbbbbbb-0000-4000-8000-00000000000${i}`;
      await newRide(ride);
      await asRole("authenticated", DRIVER);
      expect((await accept(ride, DRIVER)).success).toBe(true);
    }
    expect(await counted(RIDER)).toBe(3);
    expect(await counted(DRIVER)).toBe(3);

    const ride4 = "bbbbbbbb-0000-4000-8000-000000000009";
    await newRide(ride4);
    await asRole("authenticated", DRIVER);
    const out = await accept(ride4, DRIVER);
    expect(out.success).toBe(false);
    expect(out.code).toMatch(/limit_reached/);
  });

  it("counts rider and driver roles into one combined counter", async () => {
    await setCount(DRIVER, 0);
    // OTHER rides once as a rider and once as a driver.
    const r1 = "cccccccc-0000-4000-8000-000000000001";
    await newRide(r1, OTHER);
    await asRole("authenticated", DRIVER);
    await accept(r1, DRIVER);

    const r2 = "cccccccc-0000-4000-8000-000000000002";
    await newRide(r2, RIDER);
    await asRole("authenticated", OTHER);
    await accept(r2, OTHER);

    expect(await counted(OTHER)).toBe(2);
  });

  it("blocks when only the rider is out of free connections", async () => {
    await setCount(RIDER, 3);
    const ride = "cccccccc-0000-4000-8000-000000000003";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    const out = await accept(ride, DRIVER);
    expect(out.code).toBe("rider_limit_reached");
  });

  it("lets an active subscriber through", async () => {
    await setCount(RIDER, 9);
    await setCount(DRIVER, 9);
    await asOwner();
    await sql(
      `UPDATE public.profiles SET subscription_active=true, subscription_status='active' WHERE id IN ($1,$2)`,
      [RIDER, DRIVER],
    );
    const ride = "cccccccc-0000-4000-8000-000000000004";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    expect((await accept(ride, DRIVER)).success).toBe(true);
  });

  it("does not accept a flag without a live status", async () => {
    await setCount(RIDER, 3);
    await asOwner();
    await sql(`UPDATE public.profiles SET subscription_active=true, subscription_status='canceled' WHERE id=$1`, [RIDER]);
    const ride = "cccccccc-0000-4000-8000-000000000005";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    expect((await accept(ride, DRIVER)).success).toBe(false);
  });

  it("fails closed for a missing profile instead of reading zero", async () => {
    await asRole("service_role", null);
    await expect(
      sql(`SELECT public.connection_entitlement('99999999-9999-4999-8999-999999999999')`),
    ).rejects.toThrow(/not found/);
    await asOwner();
  });

  it("only lets a caller read their own entitlement", async () => {
    await asRole("anon", null);
    await expect(sql(`SELECT public.connection_entitlement($1)`, [RIDER])).rejects.toThrow(
      /not authorized|permission denied/,
    );

    await asRole("authenticated", OTHER);
    await expect(sql(`SELECT public.connection_entitlement($1)`, [RIDER])).rejects.toThrow(
      /not authorized/,
    );

    await asRole("authenticated", RIDER);
    expect((await sql(`SELECT public.connection_entitlement($1) AS out`, [RIDER])).rows[0].out)
      .toBeTruthy();

    await asRole("authenticated", ADMIN);
    expect((await sql(`SELECT public.connection_entitlement($1) AS out`, [RIDER])).rows[0].out)
      .toBeTruthy();

    await asRole("service_role", null);
    expect((await sql(`SELECT public.connection_entitlement($1) AS out`, [RIDER])).rows[0].out)
      .toBeTruthy();
    await asOwner();
  });


  it("exempts admins", async () => {
    await setCount(ADMIN, 50);
    await setCount(RIDER, 0);
    const ride = "cccccccc-0000-4000-8000-000000000006";
    await newRide(ride);
    await asRole("authenticated", ADMIN);
    expect((await accept(ride, ADMIN)).success).toBe(true);
  });

  it("serialises two accepts on the same last free connection", async () => {
    await setCount(DRIVER, 2);
    await setCount(OTHER, 0);
    await setCount(RIDER, 0);
    const rideA = "dddddddd-0000-4000-8000-000000000001";
    const rideB = "dddddddd-0000-4000-8000-000000000002";
    await newRide(rideA);
    await newRide(rideB);
    await asRole("authenticated", DRIVER);
    const first = await accept(rideA, DRIVER);
    const second = await accept(rideB, DRIVER);
    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(await counted(DRIVER)).toBe(3);
  });

  it("keeps the count after a cancellation and never re-counts a re-opened trip", async () => {
    const ride = "eeeeeeee-0000-4000-8000-000000000001";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    await accept(ride, DRIVER);
    expect(await counted(DRIVER)).toBe(1);

    await asOwner();
    await sql(`UPDATE public.ride_requests SET status='cancelled' WHERE id=$1`, [ride]);
    expect(await counted(DRIVER)).toBe(1);

    await sql(`UPDATE public.ride_requests SET status='open', assigned_driver_id=NULL WHERE id=$1`, [ride]);
    await asRole("authenticated", DRIVER);
    await accept(ride, DRIVER);
    expect(await counted(DRIVER)).toBe(1);
    expect(await counted(RIDER)).toBe(1);
  });
});

describe("direct writes", () => {
  it("blocks a direct ride UPDATE that assigns a driver", async () => {
    const ride = "ffffffff-0000-4000-8000-000000000001";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    await expect(
      sql(`UPDATE public.ride_requests SET status='assigned', assigned_driver_id=$2 WHERE id=$1`, [ride, DRIVER]),
    ).rejects.toThrow(/accept_ride_atomic/);
    expect(await counted(DRIVER)).toBe(0);
  });

  it("still allows an admin manual assignment", async () => {
    const ride = "ffffffff-0000-4000-8000-000000000002";
    await newRide(ride);
    await asRole("authenticated", ADMIN);
    await sql(`UPDATE public.ride_requests SET status='assigned', assigned_driver_id=$2 WHERE id=$1`, [ride, DRIVER]);
    expect(await counted(DRIVER)).toBe(1);
  });

  it("still allows ordinary trip updates after a connection", async () => {
    const ride = "ffffffff-0000-4000-8000-000000000003";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    await accept(ride, DRIVER);
    await sql(`UPDATE public.ride_requests SET eta_minutes=12 WHERE id=$1`, [ride]);
    await sql(`UPDATE public.ride_requests SET status='completed', driver_completed=true WHERE id=$1`, [ride]);
    await asOwner();
    const r = await sql(`SELECT status, eta_minutes FROM public.ride_requests WHERE id=$1`, [ride]);
    expect(r.rows[0].status).toBe("completed");
  });

  it("blocks self-granted entitlements and counter tampering", async () => {
    await asRole("authenticated", RIDER);
    await expect(
      sql(`UPDATE public.profiles SET subscription_active=true, subscription_status='active' WHERE id=$1`, [RIDER]),
    ).rejects.toThrow(/managed by CashRidez/);
    await expect(sql(`UPDATE public.profiles SET connected_trips_count=99 WHERE id=$1`, [RIDER])).rejects.toThrow();
    await expect(sql(`UPDATE public.profiles SET stripe_customer_id='cus_hack' WHERE id=$1`, [RIDER])).rejects.toThrow();
    await expect(sql(`UPDATE public.profiles SET blocked=true WHERE id=$1`, [OTHER])).rejects.toThrow();
  });

  it("still allows ordinary profile edits, verification submission and preferences", async () => {
    await asRole("authenticated", RIDER);
    await sql(
      `UPDATE public.profiles SET display_name='Kwamie', bio='hi', photo_url='x', phone_number='+1',
        is_map_visible=false, verification_submitted_at=now() WHERE id=$1`,
      [RIDER],
    );
    await asOwner();
    const r = await sql(`SELECT display_name FROM public.profiles WHERE id=$1`, [RIDER]);
    expect(r.rows[0].display_name).toBe("Kwamie");
  });

  it("still allows admin profile updates and internal counter triggers", async () => {
    await asRole("authenticated", ADMIN);
    await sql(`UPDATE public.profiles SET blocked=true, warning_count=2 WHERE id=$1`, [OTHER]);
    await asOwner();
    await sql(`UPDATE public.profiles SET blocked=false WHERE id=$1`, [OTHER]);
    // internal SECURITY DEFINER path (the connection counter) already proven above
    const ride = "ffffffff-0000-4000-8000-000000000004";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    await accept(ride, DRIVER);
    expect(await counted(DRIVER)).toBe(1);
  });

  it("honours a trusted admin grant past the free limit", async () => {
    await setCount(RIDER, 5);
    await setCount(DRIVER, 5);
    await asOwner();
    await sql(
      `UPDATE public.profiles SET subscription_active=true, subscription_status='premium',
         stripe_subscription_id=NULL WHERE id IN ($1,$2)`,
      [RIDER, DRIVER],
    );
    const ride = "cccccccc-0000-4000-8000-00000000000a";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    expect((await accept(ride, DRIVER)).success).toBe(true);
  });

  it("does not treat a Stripe-linked premium row as an admin grant", async () => {
    await setCount(RIDER, 5);
    await asOwner();
    await sql(
      `UPDATE public.profiles SET subscription_active=true, subscription_status='premium',
         stripe_subscription_id='sub_123' WHERE id=$1`,
      [RIDER],
    );
    const ride = "cccccccc-0000-4000-8000-00000000000b";
    await newRide(ride);
    await asRole("authenticated", DRIVER);
    const out = await accept(ride, DRIVER);
    expect(out.success).toBe(false);
    expect(out.code).toBe("rider_limit_reached");
  });

  it("keeps the private entitlement helper unreachable from clients", async () => {
    await asOwner();
    const r = await sql(
      `SELECT has_function_privilege('anon','public._connection_entitlement_unchecked(uuid)','EXECUTE') a,
              has_function_privilege('authenticated','public._connection_entitlement_unchecked(uuid)','EXECUTE') b,
              has_function_privilege('service_role','public._connection_entitlement_unchecked(uuid)','EXECUTE') c,
              has_function_privilege('anon','public.can_use_trip_features(uuid)','EXECUTE') d,
              has_function_privilege('anon','public.free_connection_limit()','EXECUTE') e,
              has_function_privilege('authenticated','public.can_use_trip_features(uuid)','EXECUTE') f`,
    );
    expect(r.rows[0]).toMatchObject({ a: false, b: false, c: true, d: false, e: false, f: true });
  });

  it("blocks self-service edits of membership and billing sync fields", async () => {
    await asRole("authenticated", RIDER);
    await expect(sql(`UPDATE public.profiles SET is_member=true WHERE id=$1`, [RIDER])).rejects.toThrow();
    await expect(
      sql(`UPDATE public.profiles SET billing_sync_generation=99 WHERE id=$1`, [RIDER]),
    ).rejects.toThrow();
    await expect(
      sql(`UPDATE public.profiles SET billing_sync_applied=true WHERE id=$1`, [RIDER]),
    ).rejects.toThrow();
    await asOwner();
  });
});
