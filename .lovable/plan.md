# Read-only database audit — CashRidez (Sep 9, 2026)

No code, SQL, data, billing, or deployment was changed. Everything below is measured, not estimated (except where labelled).

## 1. Health — disk I/O is no longer pinned

- Database: up. PgBouncer: up. Restarts since boot: 0.
- Memory: 71% used. Data disk: 26% used. Database size: 1.66 GB. WAL: 144 MB.
- Connections: 8/60. Pool clients: 1/200. Both low.
- Postgres logs, last 2 hours: 84 routine `LOG` lines (cron job start) and 2 `ERROR` lines that are my own mistyped audit queries. **Zero statement timeouts** — the earlier "canceling statement due to statement timeout" storm has stopped.
- Rolled-back transactions since boot: 930,848 — high, but cumulative since the last restart and consistent with the historical idle-insert churn, not an active symptom.

Conclusion: the load problem is resolved. Last idle row written was `2026-09-08 14:44:53Z`, right at the runner deployment — the fix took effect and nothing has been inserted since.

## 2. Slow-query evidence (pg_stat_statements, cumulative)

| Rank | Statement | Calls | Total ms | Mean ms | Max ms |
|---|---|---|---|---|---|
| 1 | `INSERT INTO admin_sms_worker_runs (...)` via PostgREST | 376,221 | 1,968,116 | 5.23 | 7,987 |
| 2 | `INSERT INTO page_views (...)` | 11,017 | 384,887 | 34.94 | 2,976 |
| 3 | `UPDATE notifications SET read = ... WHERE user_id = $2` | 2,693 | 367,558 | 136.49 | 5,181 |
| 4 | `SELECT user_id, created_at FROM page_views WHERE user_id IS NOT NULL ORDER BY created_at DESC LIMIT/OFFSET` | 7,637 | 279,279 | 36.57 | 1,771 |

The idle insert alone accounts for roughly 1.97 million ms — more than the next three combined. Each insert also maintained three indexes (51 MB total) and generated WAL, which is where the I/O went.

## 3. Sizes and dead tuples

| Table | Total | Heap | Indexes | Live rows | Dead | Last autovacuum |
|---|---|---|---|---|---|---|
| admin_sms_worker_runs | 78 MB | 28 MB | 50 MB | 376,221 | 71 | 2026-08-13 |
| page_views | 8.0 MB | 5.0 MB | 2.9 MB | 29,282 | 27 | 2026-09-05 |
| notifications | 6.3 MB | 3.5 MB | 2.7 MB | 9,480 | 6 | 2026-09-04 |
| everything else | < 4 MB each | | | | | |

`admin_sms_worker_runs` is ~10x the size of every other table combined at the top of the list. Dead tuples are negligible everywhere — bloat is not the issue; sheer row count is.

## 4. Indexes on implicated tables

admin_sms_worker_runs:
- `idx_admin_sms_worker_runs_source_ran_at` — 20 MB, **0 scans ever**
- `admin_sms_worker_runs_pkey` — 16 MB, 0 scans
- `idx_admin_sms_worker_runs_ran_at` — 15 MB, 2,226 scans (the only one used)

Two of the three indexes have never served a single query, yet were written on all 376k inserts.

page_views: `idx_page_views_created_at` (13,171 scans) and `idx_page_views_path` (2,054) are used; `page_views_pkey` has 0 scans; `idx_page_views_user_id` only 132 scans while the top-4 slow query filters `user_id IS NOT NULL` and orders by `created_at` — it is using the created_at index and discarding rows.

notifications: all indexes see traffic; `notifications_pkey` 3.9M scans, `idx_notifications_user_id` 32,726. The slow bulk `UPDATE ... WHERE user_id = $2` ("mark all read") is inherently a multi-row update, 1.76M row updates recorded on this table.

## 5. Obsolete idle-run count (exact)

Shape: `source='cron'` AND `processed_campaign_ids` empty AND `processed_recipients_count=0` AND `errors IS NULL`.

- Obsolete idle rows: **376,036**
- Real / manual rows to keep: **185**
- Total: 376,221
- Earliest row: `2025-12-20 01:03:44Z` · Latest: `2026-09-08 14:44:53Z`
- Approximate heap bytes across all rows: 24 MB

Reclaimable storage estimate: ~28 MB heap + ~50 MB indexes ≈ **76-78 MB of the 78 MB table**, since 99.95% of rows are obsolete.

## 6. Proposed cleanup (not executed)

Batched delete, repeatable until it reports 0:

```sql
-- Repeat until 0 rows affected. Each batch is its own transaction.
WITH victims AS (
  SELECT id FROM public.admin_sms_worker_runs
  WHERE source = 'cron'
    AND processed_recipients_count = 0
    AND errors IS NULL
    AND COALESCE(jsonb_array_length(
          CASE WHEN jsonb_typeof(processed_campaign_ids) = 'array'
               THEN processed_campaign_ids ELSE '[]'::jsonb END), 0) = 0
  ORDER BY ran_at
  LIMIT 5000
)
DELETE FROM public.admin_sms_worker_runs t
USING victims v WHERE t.id = v.id;
```

Maintenance afterwards, in this order:

```sql
VACUUM (ANALYZE) public.admin_sms_worker_runs;   -- not FULL: no exclusive lock
REINDEX TABLE CONCURRENTLY public.admin_sms_worker_runs;  -- shrinks the 51 MB of index bloat
```

`VACUUM FULL` would return the heap to the OS in one step but takes an ACCESS EXCLUSIVE lock; with 185 surviving rows the table is tiny either way, so plain VACUUM + concurrent reindex is the safe choice.

Index change justified by evidence — drop the never-scanned composite:

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.idx_admin_sms_worker_runs_source_ran_at;  -- 20 MB, 0 scans
```

No other index changes are justified. `page_views_pkey` shows 0 scans but is a primary key and stays. I would not add indexes for the `notifications` bulk update or the `page_views` visitor query without first running EXPLAIN (ANALYZE, BUFFERS) on them.

## Prioritized recommendation

1. **Nothing is on fire.** Disk I/O is normal, no timeouts in the last two hours, disk at 26%. The runner fix already stopped the bleeding. No emergency action needed.
2. **Delete the 376,036 obsolete rows in batches**, then VACUUM ANALYZE and REINDEX CONCURRENTLY. Recovers ~78 MB and removes a permanent drag on autovacuum and backups.
3. **Drop `idx_admin_sms_worker_runs_source_ran_at`** — 20 MB, never used once.
4. **Consider a retention policy** for `admin_sms_worker_runs` and `page_views` (e.g. 90 days) so this cannot rebuild.
5. **Later, with EXPLAIN evidence:** look at the notifications "mark all read" update (136 ms mean, 5.2 s max) and the page_views visitor query. Both are second-order once item 2 lands.

Approve this plan and I will run the batched cleanup and maintenance against production.
