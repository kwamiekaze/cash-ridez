/**
 * Executes docs/pending-migrations/billing.sql against a real Postgres engine
 * (PGlite) on a Supabase-shaped schema, so the DATABASE — not a mock — proves
 * the billing receipt / entitlement invariants.
 *
 * LIMITATION: PGlite is single-connection; "concurrent" redelivery is exercised
 * as strictly serialised transactions.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SQL_PATH = resolve(__dirname, "../../../../docs/pending-migrations/billing.sql");

const USER = "11111111-1111-4111-8111-111111111111";

let db: PGlite;
const sql = (q: string, p: any[] = []) => db.query(q, p) as Promise<any>;

const asRole = async (role: "anon" | "authenticated" | "service_role") => {
  await sql(`RESET ROLE`);
  await sql(`SET ROLE ${role}`);
};
const asOwner = () => sql(`RESET ROLE`);

const claim = async (eventId: string, type = "customer.subscription.updated") => {
  const r = await sql(`SELECT public.claim_billing_event($1,$2,120) AS out`, [eventId, type]);
  return r.rows[0].out;
};

beforeAll(async () => {
  db = new PGlite();

  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.sub', true), '')::uuid $$;

    CREATE TYPE public.app_role AS ENUM ('admin','driver','rider');
    CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
      RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      subscription_active boolean NOT NULL DEFAULT false,
      subscription_status text,
      subscription_current_period_end bigint,
      is_member boolean NOT NULL DEFAULT false,
      stripe_customer_id text,
      stripe_subscription_id text
    );

    -- Historical shape: stripe_event_id is NULLABLE and old rows have NULLs.
    CREATE TABLE public.billing_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      event_type text,
      stripe_event_id text,
      request_body jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      type text,
      title text,
      message text,
      link text
    );

    CREATE OR REPLACE FUNCTION public.create_notification(
      p_user_id uuid, p_type text, p_title text, p_message text,
      p_link text DEFAULT NULL, p_related_ride_id uuid DEFAULT NULL,
      p_related_user_id uuid DEFAULT NULL
    ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE v_id uuid;
    BEGIN
      IF current_setting('test.notify_fail', true) = 'on' THEN
        RAISE EXCEPTION 'notification delivery exploded';
      END IF;
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (p_user_id, p_type, p_title, p_message, p_link) RETURNING id INTO v_id;
      RETURN v_id;
    END; $$;
  `);

  // Pre-existing nullable historical rows must survive the migration.
  await db.exec(`
    INSERT INTO auth.users (id) VALUES ('${USER}');
    INSERT INTO public.profiles (id) VALUES ('${USER}');
    INSERT INTO public.billing_logs (user_id, event_type, stripe_event_id)
    VALUES ('${USER}', 'legacy', NULL), ('${USER}', 'legacy', NULL);
  `);

  await db.exec(readFileSync(SQL_PATH, "utf8"));
});

beforeEach(async () => {
  await asOwner();
  await sql(`SELECT set_config('test.notify_fail','off',false)`);
  await sql(`DELETE FROM public.billing_events`);
  await sql(`DELETE FROM public.billing_logs WHERE stripe_event_id IS NOT NULL`);
  await sql(`DELETE FROM public.notifications`);
  await sql(
    `UPDATE public.profiles SET subscription_active=false, subscription_status=NULL,
       is_member=false, stripe_subscription_id=NULL, stripe_customer_id='cus_1',
       billing_sync_generation=0, billing_sync_applied=0 WHERE id=$1`,
    [USER],
  );
});

describe("billing.sql — historical rows", () => {
  it("keeps the pre-existing NULL stripe_event_id log rows", async () => {
    const r = await sql(`SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id IS NULL`);
    expect(r.rows[0].c).toBe(2);
  });

  it("still allows new NULL-event log rows (partial index only)", async () => {
    await sql(`INSERT INTO public.billing_logs (user_id, event_type) VALUES ($1,'manual')`, [USER]);
    await sql(`INSERT INTO public.billing_logs (user_id, event_type) VALUES ($1,'manual')`, [USER]);
    const r = await sql(`SELECT count(*)::int c FROM public.billing_logs WHERE event_type='manual'`);
    expect(r.rows[0].c).toBe(2);
  });
});

describe("complete_billing_event", () => {
  it("claim -> complete (skip path) succeeds and writes exactly one log", async () => {
    const claimed = await claim("evt_skip");
    expect(claimed.outcome).toBe("claimed");

    const r = await sql(
      `SELECT public.complete_billing_event($1,$2,$3,$4,$5) AS out`,
      ["evt_skip", claimed.token, "customer.subscription.updated", USER, JSON.stringify({ skipped: true })],
    );
    expect(r.rows[0].out.completed).toBe(true);

    const receipt = await sql(`SELECT status FROM public.billing_events WHERE stripe_event_id='evt_skip'`);
    expect(receipt.rows[0].status).toBe("succeeded");

    const logs = await sql(`SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id='evt_skip'`);
    expect(logs.rows[0].c).toBe(1);
  });

  it("a redelivered event is not reclaimable and writes no second log", async () => {
    const first = await claim("evt_dupe");
    await sql(`SELECT public.complete_billing_event($1,$2,$3,$4,'{}'::jsonb)`, [
      "evt_dupe", first.token, "customer.subscription.updated", USER,
    ]);

    const second = await claim("evt_dupe");
    expect(second.outcome).toBe("succeeded");
    expect(second.token).toBeNull();

    const logs = await sql(`SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id='evt_dupe'`);
    expect(logs.rows[0].c).toBe(1);
  });

  it("refuses to complete with the wrong claim token", async () => {
    await claim("evt_token");
    const r = await sql(
      `SELECT public.complete_billing_event($1,$2,$3,$4,'{}'::jsonb) AS out`,
      ["evt_token", "22222222-2222-4222-8222-222222222222", "customer.subscription.updated", USER],
    );
    expect(r.rows[0].out.completed).toBe(false);
    expect(r.rows[0].out.reason).toBe("claim_lost");
  });
});

describe("apply_billing_entitlement", () => {
  const applyOnce = async (eventId: string, token: string, gen: number) =>
    sql(
      `SELECT public.apply_billing_entitlement($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,'{}'::jsonb) AS out`,
      [
        eventId, token, "customer.subscription.updated", USER,
        JSON.stringify({ subscription_active: true, subscription_status: "active", is_member: true, stripe_subscription_id: "sub_1" }),
        gen, "cus_1",
        JSON.stringify({ p_type: "billing", p_title: "Membership active", p_message: "You are in", p_link: "/membership" }),
      ],
    );

  it("applies entitlement, logs once, notifies once and closes the receipt", async () => {
    const c = await claim("evt_apply");
    const gen = (await sql(`SELECT public.reserve_billing_sync_generation($1) g`, [USER])).rows[0].g;
    const r = await applyOnce("evt_apply", c.token, Number(gen));
    expect(r.rows[0].out.applied).toBe(true);

    const p = await sql(`SELECT subscription_active, subscription_status, is_member FROM public.profiles WHERE id=$1`, [USER]);
    expect(p.rows[0]).toMatchObject({ subscription_active: true, subscription_status: "active", is_member: true });

    const logs = await sql(`SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id='evt_apply'`);
    expect(logs.rows[0].c).toBe(1);
    const notes = await sql(`SELECT count(*)::int c FROM public.notifications`);
    expect(notes.rows[0].c).toBe(1);
    const receipt = await sql(`SELECT status FROM public.billing_events WHERE stripe_event_id='evt_apply'`);
    expect(receipt.rows[0].status).toBe("succeeded");
  });

  it("a repeated delivery cannot double-log or double-notify", async () => {
    const c = await claim("evt_repeat");
    const gen = Number((await sql(`SELECT public.reserve_billing_sync_generation($1) g`, [USER])).rows[0].g);
    await applyOnce("evt_repeat", c.token, gen);

    // Force the receipt back to reclaimable (simulating a crashed lease) and
    // let Stripe redeliver: the log unique index must suppress the duplicate.
    await sql(`UPDATE public.billing_events SET status='failed', lease_expires_at=NULL WHERE stripe_event_id='evt_repeat'`);
    const again = await claim("evt_repeat");
    expect(again.outcome).toBe("reclaimed");
    const gen2 = Number((await sql(`SELECT public.reserve_billing_sync_generation($1) g`, [USER])).rows[0].g);
    await applyOnce("evt_repeat", again.token, gen2);

    const logs = await sql(`SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id='evt_repeat'`);
    expect(logs.rows[0].c).toBe(1);
    const notes = await sql(`SELECT count(*)::int c FROM public.notifications`);
    expect(notes.rows[0].c).toBe(1);
  });

  it("rolls the whole transaction back when create_notification fails", async () => {
    const c = await claim("evt_rollback");
    const gen = Number((await sql(`SELECT public.reserve_billing_sync_generation($1) g`, [USER])).rows[0].g);
    await sql(`SELECT set_config('test.notify_fail','on',false)`);

    await expect(applyOnce("evt_rollback", c.token, gen)).rejects.toThrow(/notification delivery exploded/);

    await sql(`SELECT set_config('test.notify_fail','off',false)`);
    const p = await sql(`SELECT subscription_active FROM public.profiles WHERE id=$1`, [USER]);
    expect(p.rows[0].subscription_active).toBe(false);
    const logs = await sql(`SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id='evt_rollback'`);
    expect(logs.rows[0].c).toBe(0);
    const receipt = await sql(`SELECT status FROM public.billing_events WHERE stripe_event_id='evt_rollback'`);
    expect(receipt.rows[0].status).toBe("processing");
  });
});

describe("public access", () => {
  it("denies anon and authenticated execution of the billing functions", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await asRole(role);
      await expect(sql(`SELECT public.claim_billing_event('evt_x','t',120)`)).rejects.toThrow(/permission denied/i);
      await expect(
        sql(`SELECT public.complete_billing_event('evt_x','t','t',$1,'{}'::jsonb)`, [USER]),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        sql(`SELECT public.apply_billing_entitlement('e','t','t',$1,'{}'::jsonb,1,NULL,NULL,'{}'::jsonb)`, [USER]),
      ).rejects.toThrow(/permission denied/i);
      await asOwner();
    }
  });

  it("allows service_role to run the receipt lifecycle", async () => {
    await asRole("service_role");
    const c = await sql(`SELECT public.claim_billing_event('evt_svc','t',120) AS out`);
    expect(c.rows[0].out.outcome).toBe("claimed");
    await asOwner();
  });
});
