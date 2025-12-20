-- 1) Worker run logging table
create table if not exists public.admin_sms_worker_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  source text not null default 'cron',
  processed_campaign_ids jsonb not null default '[]'::jsonb,
  processed_recipients_count integer not null default 0,
  errors jsonb null,
  duration_ms integer null
);

create index if not exists idx_admin_sms_worker_runs_ran_at on public.admin_sms_worker_runs (ran_at desc);
create index if not exists idx_admin_sms_worker_runs_source_ran_at on public.admin_sms_worker_runs (source, ran_at desc);

alter table public.admin_sms_worker_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_sms_worker_runs'
      and policyname = 'Admins can view worker runs'
  ) then
    create policy "Admins can view worker runs"
    on public.admin_sms_worker_runs
    for select
    using (has_role(auth.uid(), 'admin'::app_role));
  end if;
end $$;

-- 2) Recipient locking / retries columns
alter table public.admin_sms_campaign_recipients
  add column if not exists locked_at timestamptz null,
  add column if not exists lock_id uuid null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text null,
  add column if not exists last_attempt_at timestamptz null;

create index if not exists idx_admin_sms_recipients_claim
  on public.admin_sms_campaign_recipients (campaign_id, status, locked_at, created_at);

create index if not exists idx_admin_sms_recipients_lock_stale
  on public.admin_sms_campaign_recipients (locked_at)
  where locked_at is not null;