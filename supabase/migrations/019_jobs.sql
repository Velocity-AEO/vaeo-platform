-- 019_jobs.sql
--
-- Persistent job queue table.
--
-- Supported job types: crawl_site, triage_site, apply_fixes,
--   sandbox_verify, regression_check, gsc_sync
--
-- Indexes optimised for:
--   claimNextJob: (status, scheduled_at) + (job_type) filter
--   getJobStatus: (id)
--   getPendingJobs: (site_id, status)

create type job_status_enum as enum (
  'pending',
  'running',
  'done',
  'failed',
  'cancelled'
);

create type job_type_enum as enum (
  'crawl_site',
  'triage_site',
  'apply_fixes',
  'sandbox_verify',
  'regression_check',
  'gsc_sync'
);

create table if not exists jobs (
  id            uuid          primary key default gen_random_uuid(),
  site_id       text          not null,
  job_type      job_type_enum not null,
  status        job_status_enum not null default 'pending',
  payload       jsonb         not null default '{}',
  priority      integer       not null default 5,
  attempts      integer       not null default 0,
  max_attempts  integer       not null default 3,
  scheduled_at  timestamptz   not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  error         text,
  created_at    timestamptz   not null default now()
);

-- Claim query: pending jobs ready to run, ordered by priority desc + scheduled_at asc
create index if not exists jobs_claim_idx
  on jobs (status, scheduled_at, priority desc)
  where status = 'pending';

-- Site queue lookup
create index if not exists jobs_site_status_idx
  on jobs (site_id, status);

-- Type filter
create index if not exists jobs_type_idx
  on jobs (job_type);

-- Row-level security (optional — enable if using Supabase auth)
-- alter table jobs enable row level security;

comment on table jobs is 'Persistent async job queue for background site processing';
comment on column jobs.priority is 'Higher values = higher priority (0–10 scale)';
comment on column jobs.attempts is 'Number of times this job has been claimed and started';
comment on column jobs.max_attempts is 'Maximum claim attempts before marking as failed';
comment on column jobs.payload is 'Job-specific input data (e.g. site_url, max_urls)';
