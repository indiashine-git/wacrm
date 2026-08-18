-- Per-tenant toggle, set only by platform admins, controlling whether
-- Embedded Signup onboarding tells the tenant "billing is on us" vs
-- "add your own payment method in Meta Business Manager". Does not
-- itself call any Meta credit-sharing API — that requires a real
-- Solution Partner commercial agreement we don't have configured yet.
-- This just gates the copy/flow until that's in place.
alter table accounts
  add column if not exists share_meta_credit boolean not null default false;

comment on column accounts.share_meta_credit is
  'Platform-admin-controlled per-tenant flag: when true, Embedded Signup onboarding tells the tenant messaging is billed on the platform''s account rather than asking them to add their own Meta payment method.';
