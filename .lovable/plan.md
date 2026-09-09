# Follow-up audit: visit history and notifications

Read-only. Nothing was changed, deployed, or sent.

## 1. Timeout settings (role level)

| Role | Settings |
|---|---|
| authenticator | statement_timeout = **30s** (still the temporary value, not 8s), lock_timeout = 8s, session_preload_libraries = safeupdate |
| anon | statement_timeout = 3s |
| authenticated | statement_timeout = 8s |
| service_role | none set (inherits) |

## 2. Measured query plans (EXPLAIN ANALYZE, BUFFERS)

a) Latest visits list — `page_views` ordered by created_at, limit 1000:
Index Scan using `idx_page_views_created_at`, rows=1000, buffers hit=197 read=73, **execution 133.8 ms** (2,561 rows discarded by the `user_id IS NOT NULL` filter).

Representative user chosen read-only: `04a9679b-e7d8-4b30-a36c-0e9071d69f1a` (largest notification owner, 3,817 rows, 6 unread).

b) Unread-only read for that user: Index Scan on `idx_notifications_user_id`, rows=6, **22.7 ms**, 3,811 rows removed by filter, buffers hit=129 read=12.

c) All notifications for that user: Index Scan on `idx_notifications_user_id`, rows=3,817, **1.3 ms**, buffers hit=139.

## 3. Plain EXPLAIN for the two UPDATE variants

Not obtainable: the read-only database tool runs as a role without write privilege, so even a non-executing `EXPLAIN UPDATE public.notifications ...` is rejected with `42501: permission denied for table notifications`. Row-count evidence in section 4 is used instead. Getting these plans would require running the statement through a write-capable path, which is out of scope for a read-only audit.

## 4. Distribution

- page_views: **28,938** rows total, **734** distinct non-null users.
- notifications: **9,480** total — 6,535 read, 2,945 unread (`false`), **0 NULL**.
- Per user: 583 users with notifications, average **16.26**, maximum **3,817**.
- Representative user's mark-all-as-read: current code rewrites **3,817** rows; with an unread predicate it would rewrite **6** rows (a 636x reduction for that user).
- Worst realistic case observed: a user with 2,184 rows / 219 unread (10x reduction), and one with 1,978 / 1,978 (no change).

## 5. Existing indexes and usage

page_views (~3.0 MB of indexes):
- idx_page_views_created_at 1152 kB — 13,171 scans
- idx_page_views_path 328 kB — 2,055 scans
- idx_page_views_user_id 328 kB — 133 scans
- page_views_pkey 1176 kB — **0 scans**

notifications:
- notifications_pkey 520 kB — 3,899,993 scans
- idx_notifications_user_id 352 kB — 32,726 scans
- idx_notifications_user_type_created 1120 kB — 10,621 scans
- idx_notifications_created_at 416 kB — 9,615 scans
- idx_notifications_debounce 16 kB — 59 scans
- idx_notifications_chat_id 16 kB — 12 scans
- idx_notifications_read 240 kB — 9 scans

## 6. Recommendations (only where evidence supports them)

**Do: add the unread predicate to mark-all-as-read.** `src/components/NotificationBell.tsx` currently issues `update({read:true}).eq('user_id', user.id)` with no read filter, rewriting every row the user owns (3,817 for the heaviest user) on every bell click. Adding `.neq('read', true)` — safe because there are zero NULL `read` values — cuts that to only genuinely unread rows. No visible behavior change; the UI already marks everything read optimistically.

**Do: replace the fetch-all visit query with a per-user latest-visit RPC.** `src/components/UserManagementTable.tsx` selects *every* non-null-user page view with no limit (currently ~26k rows over the wire) purely to compute one "last seen" timestamp per user, then throws the rest away. A `SECURITY DEFINER` function returning `DISTINCT ON (user_id) user_id, max(created_at)` (admin-gated via `has_role`) returns at most 734 rows. The measured 133 ms / 270 buffers for just the first 1,000 rows shows the full scan is far heavier; the fix is bounded and grows with users, not with pageviews.

**Do not: add a partial unread notifications index.** The unread read for the heaviest user already runs in 22.7 ms on `idx_notifications_user_id`, unread is 31% of a small 9,480-row table, and the existing `idx_notifications_read` has only 9 scans. No measured benefit.

**Optional, low priority:** a supporting index `page_views (user_id, created_at DESC) WHERE user_id IS NOT NULL` only if the new RPC's plan shows a full scan after it exists. Verify with EXPLAIN first rather than adding it blind.

**Not recommended now:** dropping the unused `page_views_pkey` (0 scans) — it is the primary key and only 1.1 MB; also `idx_notifications_read` (9 scans, 240 kB) is small enough to leave alone.

## 7. Current health

Database up, PgBouncer up, 0 restarts, memory 55%, data disk 25%, database size 1.59 GB, WAL 144 MB, connections 9/60, pool clients 1/200. **Statement timeouts in the last hour: 0.** No disk-I/O warning state is exposed by the available tooling; the earlier timeout storm has not returned since the cleanup.

## Minimal implementation plan (no UI change)

1. `src/components/NotificationBell.tsx`: add `.neq('read', true)` to the mark-all update. One line; identical user-visible result.
2. New migration: `SECURITY DEFINER` function `public.get_last_visit_per_user()` returning `(user_id uuid, last_visit timestamptz)`, `SET search_path = public`, gated on `public.has_role(auth.uid(),'admin')`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated` (admin check inside) and `service_role`.
3. `src/components/UserManagementTable.tsx`: call that RPC instead of the unbounded `page_views` select, building the same `userActivity` map. No layout, copy, or styling change.
4. After the function exists, run `EXPLAIN (ANALYZE, BUFFERS)` on it; add the partial `page_views` index only if the plan justifies it.
5. Verify: full test suite, typecheck, production build. Deployment/publish only on your go-ahead.
