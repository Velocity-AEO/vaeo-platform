-- Sprint V: Onboarding resume state
-- Run in Supabase SQL editor

create table if not exists onboarding_sessions (
  id               text primary key,
  tenant_id        uuid not null,
  platform         text not null,
  current_step     integer default 0,
  total_steps      integer not null,
  completed_steps  integer[] default '{}',
  form_data        jsonb default '{}',
  started_at       timestamptz default now(),
  last_updated_at  timestamptz default now(),
  completed        boolean default false
);

create index if not exists idx_onboarding_sessions_tenant
  on onboarding_sessions (tenant_id);
