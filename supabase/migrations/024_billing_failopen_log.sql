-- Sprint V: Billing fail-open audit log
-- Run in Supabase SQL editor

create table if not exists billing_failopen_log (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  site_id        uuid,
  action         text not null,
  error_message  text,
  failed_at      timestamptz default now(),
  reconciled     boolean default false,
  reconciled_at  timestamptz
);

create index if not exists idx_billing_failopen_tenant
  on billing_failopen_log (tenant_id);

create index if not exists idx_billing_failopen_reconciled
  on billing_failopen_log (reconciled);

create index if not exists idx_billing_failopen_failed_at
  on billing_failopen_log (failed_at desc);
