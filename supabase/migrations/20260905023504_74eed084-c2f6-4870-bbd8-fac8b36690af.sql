create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

grant all on public.app_config to service_role;

alter table public.app_config enable row level security;