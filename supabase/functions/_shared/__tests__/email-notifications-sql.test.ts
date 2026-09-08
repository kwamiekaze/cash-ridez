/**
 * Executes docs/pending-migrations/email-notifications.sql against a real
 * Postgres engine (PGlite), so the DATABASE proves the outbox invariants:
 * triggers, stable event keys / idempotence, subscription transition rules,
 * claim + retry behaviour, the test-event allowlist, and the ACLs that keep
 * every client role out.
 *
 * LIMITATION: PGlite has no pg_cron or pg_net, so the schedule itself is not
 * exercised (schedule_email_worker skips when cron.job is absent).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SQL_PATH = resolve(__dirname, "../../../../docs/pending-migrations/email-notifications.sql");

const RIDER = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
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

const events = async (type?: string) => {
  await asOwner();
  const r = type
    ? await sql(`SELECT * FROM public.email_events WHERE event_type=$1 ORDER BY created_at`, [type])
    : await sql(`SELECT * FROM public.email_events ORDER BY created_at`);
  return r.rows;
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
    CREATE TYPE public.ride_status AS ENUM ('open','assigned','completed','cancelled','expired');

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      email text,
      full_name text,
      id_image_url text,
      verification_submitted_at timestamptz,
      is_verified boolean DEFAULT false,
      is_driver boolean DEFAULT false,
      subscription_active boolean DEFAULT false,
      subscription_status text,
      stripe_subscription_id text,
      notification_preferences jsonb DEFAULT '{}'::jsonb
    );

    CREATE TABLE public.ride_requests (
      id uuid PRIMARY KEY,
      rider_id uuid NOT NULL REFERENCES public.profiles(id),
      assigned_driver_id uuid REFERENCES public.profiles(id),
      status public.ride_status NOT NULL DEFAULT 'open',
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.kyc_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.profiles(id),
      role text,
      status text NOT NULL DEFAULT 'pending',
      submitted_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.support_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES public.profiles(id),
      subject text,
      body text,
      status text DEFAULT 'open',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.ride_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ride_request_id uuid NOT NULL REFERENCES public.ride_requests(id),
      sender_id uuid NOT NULL REFERENCES public.profiles(id),
      created_at timestamptz NOT NULL DEFAULT now()
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
    GRANT SELECT, INSERT, UPDATE ON public.profiles, public.ride_requests, public.kyc_submissions,
      public.support_tickets, public.ride_messages TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

    INSERT INTO public.profiles (id, email, full_name) VALUES
      ('${RIDER}', 'rider@example.com', 'Rider One'),
      ('${DRIVER}', 'driver@example.com', 'Driver Two'),
      ('${ADMIN}', 'admin@example.com', 'Admin');
    INSERT INTO public.user_roles (user_id, role) VALUES ('${ADMIN}', 'admin');
  `);

  await db.exec(readFileSync(SQL_PATH, "utf8"));
});

beforeEach(async () => {
  await asOwner();
  await sql(`DELETE FROM public.email_deliveries`);
  await sql(`DELETE FROM public.email_events`);
  await sql(`DELETE FROM public.ride_messages`);
  await sql(`DELETE FROM public.ride_requests`);
  await sql(`DELETE FROM public.kyc_submissions`);
  await sql(`DELETE FROM public.support_tickets`);
  await sql(
    `UPDATE public.profiles SET subscription_active=false, subscription_status=NULL,
       stripe_subscription_id=NULL, id_image_url=NULL, verification_submitted_at=NULL`,
  );
});

describe("migration does not capture existing rows", () => {
  it("starts with an empty outbox after applying the migration", async () => {
    expect(await events()).toHaveLength(0);
  });
});

describe("triggers", () => {
  it("queues on kyc submission and on resubmission only", async () => {
    await asOwner();
    const r = await sql(
      `INSERT INTO public.kyc_submissions (user_id, role) VALUES ($1,'driver') RETURNING id`,
      [RIDER],
    );
    expect(await events("id_verification_submitted")).toHaveLength(1);

    // Unrelated update: no new event.
    await sql(`UPDATE public.kyc_submissions SET role='rider' WHERE id=$1`, [r.rows[0].id]);
    expect(await events("id_verification_submitted")).toHaveLength(1);

    // Resubmission (new submitted_at): a second event.
    await sql(`UPDATE public.kyc_submissions SET submitted_at = now() + interval '1 minute' WHERE id=$1`, [
      r.rows[0].id,
    ]);
    expect(await events("id_verification_submitted")).toHaveLength(2);
  });

  it("queues exactly one event when onboarding writes the profile and a kyc row", async () => {
    await asOwner();
    await sql(
      `UPDATE public.profiles
         SET id_image_url='https://x/id.jpg', verification_submitted_at = now()
       WHERE id=$1`,
      [RIDER],
    );
    await sql(`INSERT INTO public.kyc_submissions (user_id, role) VALUES ($1,'driver')`, [RIDER]);
    expect(await events("id_verification_submitted")).toHaveLength(1);
  });

  it("queues when a profile ID image is uploaded and replaced, and never stores the URL", async () => {
    await asOwner();
    await sql(`UPDATE public.profiles SET id_image_url='https://x/id1.jpg?token=s' WHERE id=$1`, [RIDER]);
    let rows = await events("id_verification_submitted");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0].payload)).not.toContain("id1.jpg");
    expect(rows[0].payload.user_id).toBe(RIDER);

    // Same URL again: no duplicate.
    await sql(`UPDATE public.profiles SET id_image_url='https://x/id1.jpg?token=s' WHERE id=$1`, [RIDER]);
    expect(await events("id_verification_submitted")).toHaveLength(1);

    // Replacement image: a resubmission event.
    await sql(`UPDATE public.profiles SET id_image_url='https://x/id2.jpg' WHERE id=$1`, [RIDER]);
    expect(await events("id_verification_submitted")).toHaveLength(2);
  });

  it("queues trip_posted on insert and trip_assigned only on open -> assigned", async () => {
    await asOwner();
    const rideId = "aaaaaaaa-0000-4000-8000-000000000001";
    await sql(`INSERT INTO public.ride_requests (id, rider_id) VALUES ($1,$2)`, [rideId, RIDER]);
    expect(await events("trip_posted")).toHaveLength(1);

    await sql(`UPDATE public.ride_requests SET status='assigned', assigned_driver_id=$2 WHERE id=$1`, [
      rideId,
      DRIVER,
    ]);
    const assigned = await events("trip_assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].payload.driver_id).toBe(DRIVER);

    // completed -> no further event, and re-entering assigned from another
    // status is not an open -> assigned transition.
    await sql(`UPDATE public.ride_requests SET status='completed' WHERE id=$1`, [rideId]);
    await sql(`UPDATE public.ride_requests SET status='assigned' WHERE id=$1`, [rideId]);
    expect(await events("trip_assigned")).toHaveLength(1);
  });

  it("queues support_message and ride_message events", async () => {
    await asOwner();
    await sql(`INSERT INTO public.support_tickets (user_id, subject, body) VALUES ($1,'S','B')`, [RIDER]);
    expect(await events("support_message")).toHaveLength(1);

    const rideId = "aaaaaaaa-0000-4000-8000-000000000002";
    await sql(`INSERT INTO public.ride_requests (id, rider_id) VALUES ($1,$2)`, [rideId, RIDER]);
    await sql(`INSERT INTO public.ride_messages (ride_request_id, sender_id) VALUES ($1,$2)`, [
      rideId,
      RIDER,
    ]);
    const msgs = await events("ride_message");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].payload.sender_id).toBe(RIDER);
  });
});

describe("subscription transition rule", () => {
  const activate = async (status: string, subId: string | null) => {
    await asOwner();
    await sql(
      `UPDATE public.profiles SET subscription_active=true, subscription_status=$2,
         stripe_subscription_id=$3 WHERE id=$1`,
      [DRIVER, status, subId],
    );
  };

  it("fires once for a Stripe-backed activation", async () => {
    await activate("active", "sub_a");
    expect(await events("subscription_activated")).toHaveLength(1);
    // Repeated writes while already live do not re-queue.
    await activate("active", "sub_a");
    expect(await events("subscription_activated")).toHaveLength(1);
  });

  it("ignores trusted admin grants with no Stripe subscription", async () => {
    await activate("premium", null);
    expect(await events("subscription_activated")).toHaveLength(0);
  });

  it("ignores non-active statuses", async () => {
    await activate("past_due", "sub_b");
    expect(await events("subscription_activated")).toHaveLength(0);
  });
});

describe("idempotence", () => {
  it("collapses duplicate event keys", async () => {
    await asOwner();
    await sql(`SELECT public.queue_email_event('trip_posted','k1','{}'::jsonb)`);
    await sql(`SELECT public.queue_email_event('trip_posted','k1','{}'::jsonb)`);
    expect(await events("trip_posted")).toHaveLength(1);
  });

  it("records a recipient delivery only once", async () => {
    await asOwner();
    const e = await sql(`SELECT public.queue_email_event('trip_posted','k2','{}'::jsonb) AS id`);
    const id = e.rows[0].id;
    await asRole("service_role", null);
    await sql(`SELECT public.record_email_delivery($1,'a@b.com','admin','sent')`, [id]);
    await sql(`SELECT public.record_email_delivery($1,'A@B.com ','admin','sent')`, [id]);
    await asOwner();
    const r = await sql(`SELECT count(*) c FROM public.email_deliveries WHERE event_id=$1`, [id]);
    expect(Number(r.rows[0].c)).toBe(1);
    const sent = await sql(`SELECT public.email_delivery_already_sent($1,'a@b.com') AS s`, [id]);
    expect(sent.rows[0].s).toBe(true);
  });

  it("reserves a recipient once, skips concurrent runs, and reclaims stale claims", async () => {
    await asOwner();
    const e = await sql(`SELECT public.queue_email_event('trip_posted','k3','{}'::jsonb) AS id`);
    const id = e.rows[0].id;
    await asRole("service_role", null);

    const claim = async () => {
      const r = await sql(`SELECT public.claim_email_delivery($1,'A@B.com ','admin',NULL) AS ok`, [id]);
      return r.rows[0].ok;
    };

    expect(await claim()).toBe(true);
    // Another concurrent run must not send the same recipient.
    expect(await claim()).toBe(false);

    // A crashed run's reservation is reclaimed after 10 minutes.
    await asOwner();
    await sql(
      `UPDATE public.email_deliveries
         SET claimed_at = now() - interval '11 minutes', updated_at = now() - interval '11 minutes'
       WHERE event_id=$1`,
      [id],
    );
    await asRole("service_role", null);
    expect(await claim()).toBe(true);

    // Once sent, it is never claimable again.
    await sql(`SELECT public.record_email_delivery($1,'a@b.com','admin','sent')`, [id]);
    expect(await claim()).toBe(false);

    await asOwner();
    const rows = await sql(`SELECT status FROM public.email_deliveries WHERE event_id=$1`, [id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe("sent");
  });
});

describe("claim / complete / retry", () => {
  const queue = async (key: string) => {
    await asOwner();
    const r = await sql(`SELECT public.queue_email_event('trip_posted',$1,'{}'::jsonb) AS id`, [key]);
    return r.rows[0].id;
  };

  it("claims bounded batches and does not re-claim processing rows", async () => {
    await queue("c1");
    await queue("c2");
    await queue("c3");
    await asRole("service_role", null);
    const first = await sql(`SELECT * FROM public.claim_email_events(2)`);
    expect(first.rows).toHaveLength(2);
    const second = await sql(`SELECT * FROM public.claim_email_events(10)`);
    expect(second.rows).toHaveLength(1);
    const third = await sql(`SELECT * FROM public.claim_email_events(10)`);
    expect(third.rows).toHaveLength(0);
  });

  it("retries with backoff and gives up as failed", async () => {
    const id = await queue("c4");
    await asRole("service_role", null);
    for (let i = 0; i < 5; i++) {
      await sql(`SELECT * FROM public.claim_email_events(1)`);
      const r = await sql(`SELECT public.fail_email_event($1,'boom',true) AS s`, [id]);
      expect(r.rows[0].s).toBe(i < 4 ? "pending" : "failed");
      await asOwner();
      await sql(`UPDATE public.email_events SET next_attempt_at = now() WHERE id=$1`, [id]);
      await asRole("service_role", null);
    }
  });

  it("reclaims events left processing for more than 10 minutes", async () => {
    const id = await queue("c6");
    await asRole("service_role", null);
    expect((await sql(`SELECT * FROM public.claim_email_events(10)`)).rows).toHaveLength(1);
    expect((await sql(`SELECT * FROM public.claim_email_events(10)`)).rows).toHaveLength(0);
    await asOwner();
    await sql(
      `UPDATE public.email_events
         SET claimed_at = now() - interval '11 minutes', updated_at = now() - interval '11 minutes'
       WHERE id=$1`,
      [id],
    );
    await asRole("service_role", null);
    expect((await sql(`SELECT * FROM public.claim_email_events(10)`)).rows).toHaveLength(1);
  });

  it("marks an event done", async () => {
    const id = await queue("c5");
    await asRole("service_role", null);
    await sql(`SELECT public.complete_email_event($1)`, [id]);
    await asOwner();
    const r = await sql(`SELECT status FROM public.email_events WHERE id=$1`, [id]);
    expect(r.rows[0].status).toBe("done");
  });
});

describe("test event allowlist", () => {
  it("accepts the five test types for the two test addresses", async () => {
    await asRole("service_role", null);
    for (const t of ["id_uploaded", "trip_posted", "trip_accepted", "new_subscription", "support_message"]) {
      await sql(`SELECT public.queue_test_email_event($1,'kwamiekaze@gmail.com')`, [t]);
    }
    expect(await events("test_alert")).toHaveLength(5);
  });

  it("rejects unknown types and non-test recipients", async () => {
    await asRole("service_role", null);
    await expect(sql(`SELECT public.queue_test_email_event('bogus')`)).rejects.toThrow(/unknown test type/);
    await expect(
      sql(`SELECT public.queue_test_email_event('trip_posted','attacker@evil.test')`),
    ).rejects.toThrow(/operational test addresses/);
    await expect(
      sql(`SELECT public.queue_test_email_event('trip_posted','cashridezconnect@gmail.com')`),
    ).rejects.toThrow(/operational test addresses/);
  });

  it("creates no business records", async () => {
    await asRole("service_role", null);
    await sql(`SELECT public.queue_test_email_event('new_subscription')`);
    await asOwner();
    const r = await sql(
      `SELECT (SELECT count(*) FROM public.ride_requests) rides,
              (SELECT count(*) FROM public.support_tickets) tickets,
              (SELECT count(*) FROM public.kyc_submissions) kyc`,
    );
    expect(Number(r.rows[0].rides)).toBe(0);
    expect(Number(r.rows[0].tickets)).toBe(0);
    expect(Number(r.rows[0].kyc)).toBe(0);
  });
});

describe("ACLs — no client injection", () => {
  const SERVICE_ONLY = [
    ["public.claim_email_events(integer)", "claim_email_events"],
    ["public.record_email_delivery(uuid, text, text, text, uuid, text, text)", "record_email_delivery"],
    ["public.complete_email_event(uuid)", "complete_email_event"],
    ["public.fail_email_event(uuid, text, boolean)", "fail_email_event"],
    ["public.queue_email_event(text, text, jsonb)", "queue_email_event"],
    ["public.queue_test_email_event(text, text)", "queue_test_email_event"],
    ["public.claim_email_delivery(uuid, text, text, uuid)", "claim_email_delivery"],
  ] as const;

  it("no longer exposes a secret-bearing scheduler", async () => {
    await asOwner();
    const r = await sql(
      `SELECT count(*) c FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='schedule_email_worker'`,
    );
    expect(Number(r.rows[0].c)).toBe(0);
  });

  it("grants EXECUTE to service_role only", async () => {
    await asOwner();
    for (const [signature] of SERVICE_ONLY) {
      const r = await sql(
        `SELECT has_function_privilege('anon', $1, 'EXECUTE') a,
                has_function_privilege('authenticated', $1, 'EXECUTE') u,
                has_function_privilege('service_role', $1, 'EXECUTE') s`,
        [signature],
      );
      expect({ signature, ...r.rows[0] }).toEqual({ signature, a: false, u: false, s: true });
    }
  });

  it("denies the outbox tables to anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await asRole(role, RIDER);
      await expect(sql(`SELECT * FROM public.email_events`)).rejects.toThrow(/permission denied/i);
      await expect(
        sql(`INSERT INTO public.email_deliveries (event_id, recipient_email, recipient_kind)
             VALUES (gen_random_uuid(),'attacker@evil.test','admin')`),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("stops a signed-in user from queueing or claiming events", async () => {
    await asRole("authenticated", RIDER);
    await expect(sql(`SELECT public.queue_email_event('trip_posted','x','{}'::jsonb)`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(sql(`SELECT * FROM public.claim_email_events(1)`)).rejects.toThrow(/permission denied/i);
    await expect(
      sql(`SELECT public.queue_test_email_event('trip_posted','connect@cashridez.com')`),
    ).rejects.toThrow(/permission denied/i);
  });
});
