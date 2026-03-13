-- Sprint U: Shopify GDPR webhooks
-- Run in Supabase SQL editor
-- DO NOT run automatically

create table if not exists shopify_gdpr_requests (
  id             uuid        primary key default gen_random_uuid(),
  shop_domain    text        not null,
  customer_id    text,
  customer_email text,
  request_type   text        not null, -- 'data_request' | 'customer_redact' | 'shop_redact'
  status         text        not null  default 'received',
  requested_at   timestamptz           default now(),
  completed_at   timestamptz,
  notes          text
);

create index if not exists shopify_gdpr_requests_shop_domain_idx
  on shopify_gdpr_requests (shop_domain);

create index if not exists shopify_gdpr_requests_request_type_idx
  on shopify_gdpr_requests (request_type);

create index if not exists shopify_gdpr_requests_status_idx
  on shopify_gdpr_requests (status);
