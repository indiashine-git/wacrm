# Gated Signup + Approval — Design

**Status:** Approved, not yet implemented
**Sub-project 1 of 4** (order: gated signup+approval → superadmin panel → billing → wallet/pricing)

## Context

wacrm (self-hosted fork of ArnasDon/wacrm, deployed at `app.intellinix.in`) currently has open signup — anyone who finds the URL can self-provision a tenant account with no approval step (`ENABLE_EMAIL_SIGNUP=true`, `DISABLE_SIGNUP=false`). This spec gates that: new signups land in a `pending` state and require explicit approval before they can use the product.

There is no superadmin/platform-management system yet (that's sub-project 2). This spec deliberately uses a throwaway minimal approval interface rather than building real admin auth prematurely.

## Goals

- New signups cannot access the app until approved by the operator (you).
- Approval/rejection is a real action taken through a page, not a raw SQL command.
- The operator is notified when a new signup needs review, on whichever channels they've enabled (email / Telegram / WhatsApp).
- The applicant is notified by email when approved or rejected.
- The gate is enforced server-side (middleware + API), not just hidden via UI routing.

## Non-goals

- Real superadmin authentication (deferred to sub-project 2 — this uses nginx Basic Auth as a stopgap).
- Multi-tenant visibility/management beyond approve/reject (view all tenants, suspend, usage dashboards — sub-project 2).
- Billing, wallets, usage-based pricing (sub-projects 3 and 4).
- Rate-limiting or CAPTCHA on the signup form itself (out of scope; flag separately if needed).

## Data model

New migration (next sequence number after `039_inbound_media_mirror.sql`, i.e. `040_account_approval_gate.sql`):

```sql
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
```

- `handle_new_user` (from migration 017) is updated so new accounts are created with `status='pending'` explicitly (matches the new column default, but stated for clarity — the trigger already creates the account row).
- Existing accounts (created before this migration) are backfilled to `status='approved'` in the same migration, so nobody currently using the system gets locked out.

## Access gate

Enforced in two places, both required (defense in depth):

1. **Middleware** (`src/middleware.ts` or wherever wacrm's existing auth middleware lives) — after resolving the authenticated user's account, check `status`. If not `approved`, redirect to `/pending-approval` (a static informational page: "awaiting approval" for `pending`, "not approved" for `rejected` — no account details leaked).
2. **API routes** — the same check added at the point routes currently resolve `account_id` from session (a single shared helper, not duplicated per-route), returning `403` for non-approved accounts. This covers the public API (`/api/v1`) and any server actions that bypass the middleware.

RLS is **not** the enforcement mechanism here — `status` gates application access, not data visibility (an approved admin's own data is still correctly isolated by existing account-scoped RLS regardless of this feature).

## Approval interface

- Route: `/platform/approvals` (new top-level route, outside the tenant app shell).
- Protected by **nginx HTTP Basic Auth** on that path only (`auth_basic` + `htpasswd`, added to the `app.intellinix.in` nginx config) — a single operator credential, not a database-backed user. This is explicitly throwaway: sub-project 2 replaces it with a real superadmin login and this nginx rule is removed then.
- Page lists accounts where `status='pending'`: account name, owner email, signup timestamp. Approve / Reject buttons per row; Reject requires a short reason (stored in `rejected_reason`, included in the rejection email).
- Actions POST to a server route that uses the `SUPABASE_SERVICE_ROLE_KEY` client (bypasses RLS — required, since this route must act across all tenants) to update `status`, `approved_at`, `approved_by`, then fires the relevant notification(s).

## Notifications

A single internal module, `src/lib/notify.ts` (or equivalent), exposing:

```ts
notify(event: 'signup_pending' | 'account_approved' | 'account_rejected', payload) => Promise<void>
```

Three provider adapters, each independently enabled via env flag:

| Channel | Env flags | Notes |
|---|---|---|
| Email | `NOTIFY_EMAIL_ENABLED`, `SMTP_HOST/PORT/USER/PASS`, `SMTP_FROM` | Uses saas-ra-360's existing mail server — new creds/from-address scoped to wacrm, not a shared account. |
| Telegram | `NOTIFY_TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Simple bot API POST, no webhook needed (outbound only). |
| WhatsApp | `NOTIFY_WHATSAPP_ENABLED`, `WHATSAPP_PLATFORM_TOKEN`, `WHATSAPP_PLATFORM_PHONE_ID`, `NOTIFY_WHATSAPP_TO` | Reuses dhan-research's WABA credentials (saas-ra-360) via direct Meta Graph API call — credential reuse only, no shared code or DB with saas-ra-360. |

Routing:
- `signup_pending` → fires on all operator-enabled channels (email/Telegram/WhatsApp), to the operator.
- `account_approved` / `account_rejected` → email only, to the applicant (the channel guaranteed to reach an arbitrary signup — Telegram/WhatsApp require a pre-known chat/number, which the operator has but an arbitrary tenant doesn't).

A channel with its flag off is a no-op — `notify()` never throws on a disabled/misconfigured channel; it logs and continues to the next channel, so one bad SMTP config doesn't prevent Telegram from firing.

## Error handling

- Migration is additive-only (`ADD COLUMN IF NOT EXISTS`), safe to re-run, matches wacrm's existing migration style.
- If a notification provider fails (SMTP down, Telegram API error, Meta API error), the approval/rejection/signup action itself still succeeds — notification failure is logged, never blocks the underlying state change.
- Basic Auth misconfiguration (missing htpasswd file) should fail nginx config test (`nginx -t`) before reload, not silently expose the route.

## Testing

- Migration: apply against the live self-hosted Postgres (same pattern used for the initial 39 migrations), verify existing accounts backfilled to `approved`, new signups default to `pending`.
- Middleware: real signup → confirm redirect to `/pending-approval`; approve via the page → confirm dashboard now accessible; reject → confirm `/pending-approval` shows rejection state, no dashboard access.
- API gate: direct `curl` against `/api/v1/*` with a pending account's session → expect `403`.
- Notifications: trigger each channel independently (toggle one on at a time) with a real test signup, confirm delivery; confirm a disabled channel is a silent no-op and doesn't block the others.
