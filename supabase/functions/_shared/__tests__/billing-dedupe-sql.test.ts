/**
 * Real PGlite regression for the billing_logs duplicate archive + dedupe step
 * of docs/pending-migrations/billing.sql.
 *
 * The hosted dry-run rolled back at billing_logs_event_type_unique because a
 * historical (stripe_event_id, event_type) group had 3 copies. This test seeds
 * exactly that shape BEFORE running the migration.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const SQL_PATH = resolve(__dirname, "../../../../docs/pending-migrations/billing.sql");
const USER = "11111111-1111-4111-8111-111111111111";

let db: PGlite;
const sql = (q: string, p: any[] = []) => db.query(q, p) as Promise<any>;

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
      user_id uuid, type text, title text, message text, link text
    );

    CREATE OR REPLACE FUNCTION public.create_notification(
      p_user_id uuid, p_type text, p_title text, p_message text,
      p_link text DEFAULT NULL, p_related_ride_id uuid DEFAULT NULL,
      p_related_user_id uuid DEFAULT NULL
    ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE v_id uuid;
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, link)
      VALUES (p_user_id, p_type, p_title, p_message, p_link) RETURNING id INTO v_id;
      RETURN v_id;
    END; $$;
  `);

  // The exact hosted failure shape: one group with THREE copies, plus a
  // two-copy group and nullable historical rows that must all survive.
  await db.exec(`
    INSERT INTO auth.users (id) VALUES ('${USER}');
    INSERT INTO public.profiles (id) VALUES ('${USER}');
    INSERT INTO public.billing_logs (user_id, event_type, stripe_event_id, created_at) VALUES
      ('${USER}', 'checkout', 'evt_triple', '2025-01-01T00:00:00Z'),
      ('${USER}', 'checkout', 'evt_triple', '2025-01-02T00:00:00Z'),
      ('${USER}', 'checkout', 'evt_triple', '2025-01-03T00:00:00Z'),
      ('${USER}', 'sync',     'evt_pair',   '2025-02-01T00:00:00Z'),
      ('${USER}', 'sync',     'evt_pair',   '2025-02-02T00:00:00Z'),
      ('${USER}', 'legacy',   NULL,         '2025-03-01T00:00:00Z'),
      ('${USER}', 'legacy',   NULL,         '2025-03-02T00:00:00Z');
  `);

  await db.exec(readFileSync(SQL_PATH, "utf8"));
});

describe("billing_logs duplicate archive + dedupe", () => {
  it("keeps exactly one canonical row per (stripe_event_id, event_type)", async () => {
    const r = await sql(
      `SELECT stripe_event_id, count(*)::int c FROM public.billing_logs
        WHERE stripe_event_id IS NOT NULL GROUP BY 1 ORDER BY 1`,
    );
    expect(r.rows).toEqual([
      { stripe_event_id: "evt_pair", c: 1 },
      { stripe_event_id: "evt_triple", c: 1 },
    ]);
  });

  it("keeps the earliest created_at row as canonical", async () => {
    const r = await sql(
      `SELECT created_at FROM public.billing_logs WHERE stripe_event_id='evt_triple'`,
    );
    expect(new Date(r.rows[0].created_at).toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("archives the two extra copies of the triple group with a reason", async () => {
    const r = await sql(
      `SELECT count(*)::int c, min(archive_reason) reason
         FROM public.billing_logs_duplicate_archive WHERE stripe_event_id='evt_triple'`,
    );
    expect(r.rows[0].c).toBe(2);
    expect(r.rows[0].reason).toContain("billing_logs_event_type_unique");
    const at = await sql(
      `SELECT count(*)::int c FROM public.billing_logs_duplicate_archive WHERE archived_at IS NULL`,
    );
    expect(at.rows[0].c).toBe(0);
  });

  it("archives every removed row across all groups (3 total)", async () => {
    const r = await sql(`SELECT count(*)::int c FROM public.billing_logs_duplicate_archive`);
    expect(r.rows[0].c).toBe(3);
  });

  it("creates the partial unique index", async () => {
    const r = await sql(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname='public' AND indexname='billing_logs_event_type_unique'`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].indexdef).toContain("stripe_event_id IS NOT NULL");
  });

  it("still allows multiple nullable historical event ids", async () => {
    const before = await sql(
      `SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id IS NULL`,
    );
    expect(before.rows[0].c).toBe(2);
    await sql(`INSERT INTO public.billing_logs (user_id, event_type) VALUES ($1,'legacy')`, [USER]);
    const after = await sql(
      `SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id IS NULL`,
    );
    expect(after.rows[0].c).toBe(3);
  });

  it("rejects a new duplicate now that the index exists", async () => {
    await expect(
      sql(`INSERT INTO public.billing_logs (user_id, event_type, stripe_event_id)
             VALUES ($1,'checkout','evt_triple')`, [USER]),
    ).rejects.toThrow();
  });

  it("is idempotent: a second migration run changes nothing", async () => {
    await db.exec(readFileSync(SQL_PATH, "utf8"));
    const logs = await sql(
      `SELECT count(*)::int c FROM public.billing_logs WHERE stripe_event_id IS NOT NULL`,
    );
    expect(logs.rows[0].c).toBe(2);
    const arch = await sql(`SELECT count(*)::int c FROM public.billing_logs_duplicate_archive`);
    expect(arch.rows[0].c).toBe(3);
  });

  it("keeps the archive away from anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      await sql(`RESET ROLE`);
      await sql(`SET ROLE ${role}`);
      await expect(
        sql(`SELECT count(*) FROM public.billing_logs_duplicate_archive`),
      ).rejects.toThrow();
    }
    await sql(`RESET ROLE`);
  });
});
