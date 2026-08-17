# Gated Signup + Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New wacrm signups land in a `pending` state, cannot access the app until approved through a minimal admin page, and the operator gets notified (email/Telegram/WhatsApp, each toggle-able) when review is needed.

**Architecture:** One migration adds `status` to `accounts`. A single shared server helper (`getCurrentAccount`, already the app's one choke point for account resolution) gains a status check, so every API route and the middleware enforce the gate from one place. A new `/platform/approvals` route (nginx Basic Auth, not app-level auth — deliberately throwaway per spec) lists pending accounts and lets the operator approve/reject using a service-role client. A new `notify()` module with three independent provider adapters (email via nodemailer/SMTP, Telegram via Bot API, WhatsApp via Meta Graph API) fires on signup/approve/reject.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (self-hosted, already deployed), nodemailer (new dependency), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-gated-signup-approval-design.md`

## Global Constraints

- Migration must be additive-only (`ADD COLUMN IF NOT EXISTS`), matching every existing migration in `supabase/migrations/`.
- Existing accounts backfill to `status='approved'` in the same migration — nobody currently using the system gets locked out.
- The gate is enforced server-side (middleware + the shared `getCurrentAccount` helper), never only in UI.
- `/platform/approvals` uses the `SUPABASE_SERVICE_ROLE_KEY` client (bypasses RLS — required, must see across all tenants), never the anon/session client.
- A disabled or misconfigured notification channel must never throw or block the underlying approve/reject/signup action — log and continue.
- Follow existing code conventions: named-parameter functions (see `src/lib/whatsapp/meta-api.ts`), typed error classes for API routes (see `src/lib/auth/account.ts`), lazy singleton service-role clients (see `src/lib/ai/admin-client.ts`).

---

## Task 1: Migration — `accounts.status`

**Files:**
- Create: `supabase/migrations/040_account_approval_gate.sql`

**Interfaces:**
- Produces: `accounts.status` (`'pending' | 'approved' | 'rejected'`, default `'pending'`), `accounts.approved_at`, `accounts.approved_by`, `accounts.rejected_reason`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 040_account_approval_gate.sql — Gated signup approval
--
-- Adds an approval gate to accounts. New signups default to
-- 'pending' and cannot use the app until an operator approves
-- them via /platform/approvals. Existing accounts (created
-- before this migration) are backfilled to 'approved' so nobody
-- currently using the system gets locked out.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_status_check'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Backfill: every account that existed before this migration is
-- already in active use — grandfather it in as approved.
UPDATE accounts SET status = 'approved', approved_at = COALESCE(approved_at, created_at)
  WHERE status = 'pending' AND created_at < NOW();
```

- [ ] **Step 2: Apply against the live self-hosted Postgres**

```bash
export PGPASSWORD=$(ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud "grep '^POSTGRES_PASSWORD=' /var/www/wacrm-stack/supabase/.env | cut -d= -f2")
scp -i ~/.ssh/id_ed25519 supabase/migrations/040_account_approval_gate.sql root@srv1824357.hstgr.cloud:/tmp/040.sql
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud \
  "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 < /tmp/040.sql"
```

Expected: no errors. Then verify:

```bash
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud \
  "docker exec supabase-db psql -U postgres -c \"select status, count(*) from accounts group by status;\""
```

Expected: any pre-existing account shows `approved`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/040_account_approval_gate.sql
git commit -m "feat(db): add accounts.status approval gate (migration 040)"
```

---

## Task 2: Account role type — add `AccountStatus`

**Files:**
- Modify: `src/lib/auth/roles.ts`
- Test: `src/lib/auth/roles.test.ts` (new)

**Interfaces:**
- Produces: `AccountStatus` type (`'pending' | 'approved' | 'rejected'`), `isAccountStatus(value: unknown): value is AccountStatus`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/auth/roles.test.ts
import { describe, it, expect } from "vitest";
import { isAccountStatus } from "./roles";

describe("isAccountStatus", () => {
  it("accepts valid statuses", () => {
    expect(isAccountStatus("pending")).toBe(true);
    expect(isAccountStatus("approved")).toBe(true);
    expect(isAccountStatus("rejected")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isAccountStatus("active")).toBe(false);
    expect(isAccountStatus(null)).toBe(false);
    expect(isAccountStatus(42)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/roles.test.ts`
Expected: FAIL — `isAccountStatus` is not exported.

- [ ] **Step 3: Add the type and guard to `roles.ts`**

Append to `src/lib/auth/roles.ts`:

```typescript
// ------------------------------------------------------------
// Account approval status — separate axis from role. A user can
// be "owner" of an account that is still "pending" operator
// approval; role governs in-account permissions, status governs
// whether the account can use the app at all.
// ------------------------------------------------------------

export type AccountStatus = "pending" | "approved" | "rejected";

const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  "pending",
  "approved",
  "rejected",
] as const;

/** Type-narrow an unknown string into a valid `AccountStatus`. */
export function isAccountStatus(value: unknown): value is AccountStatus {
  return (
    typeof value === "string" &&
    (ACCOUNT_STATUSES as readonly string[]).includes(value)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/roles.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/roles.test.ts
git commit -m "feat(auth): add AccountStatus type and guard"
```

---

## Task 3: Enforce the gate in `getCurrentAccount`

**Files:**
- Modify: `src/lib/auth/account.ts`
- Test: `src/lib/auth/account.test.ts` (new)

**Interfaces:**
- Consumes: `AccountStatus`, `isAccountStatus` from Task 2 (`./roles`).
- Produces: `PendingApprovalError` (new exported error class, `status = 403`), `AccountContext.accountStatus: AccountStatus` (new field), `getCurrentAccount()` now throws `PendingApprovalError` for non-approved accounts. `toErrorResponse` maps it to `403` like `ForbiddenError`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/auth/account.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

import { getCurrentAccount, PendingApprovalError, ForbiddenError } from "./account";

function fakeSupabase({ role = "owner", status = "approved" }: { role?: string; status?: string }) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "profiles") {
              return { data: { account_id: "acct-1", account_role: role }, error: null };
            }
            if (table === "accounts") {
              return { data: { id: "acct-1", name: "Acme", status }, error: null };
            }
            throw new Error(`unexpected table ${table}`);
          },
        }),
      }),
    }),
  };
}

describe("getCurrentAccount", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  it("resolves normally for an approved account", async () => {
    mockCreateClient.mockResolvedValue(fakeSupabase({ status: "approved" }));
    const ctx = await getCurrentAccount();
    expect(ctx.accountId).toBe("acct-1");
    expect(ctx.accountStatus).toBe("approved");
  });

  it("throws PendingApprovalError for a pending account", async () => {
    mockCreateClient.mockResolvedValue(fakeSupabase({ status: "pending" }));
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(PendingApprovalError);
  });

  it("throws PendingApprovalError for a rejected account", async () => {
    mockCreateClient.mockResolvedValue(fakeSupabase({ status: "rejected" }));
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(PendingApprovalError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/account.test.ts`
Expected: FAIL — `PendingApprovalError` is not exported, `accountStatus` undefined.

- [ ] **Step 3: Implement**

In `src/lib/auth/account.ts`:

1. Add import: `import { hasMinRole, isAccountRole, isAccountStatus, type AccountRole, type AccountStatus } from "./roles";`

2. Add the new error class after `ForbiddenError`:

```typescript
export class PendingApprovalError extends Error {
  readonly status = 403 as const;
  constructor(message = "Account is awaiting approval") {
    super(message);
    this.name = "PendingApprovalError";
  }
}
```

3. Update `toErrorResponse` to include it:

```typescript
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof PendingApprovalError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[toErrorResponse] uncategorized error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

4. Add `accountStatus` to `AccountContext`:

```typescript
export interface AccountContext {
  supabase: SupabaseClient;
  userId: string;
  accountId: string;
  role: AccountRole;
  accountStatus: AccountStatus;
  account: { id: string; name: string };
}
```

5. In `getCurrentAccount`, change the accounts select to also fetch `status`, validate it, and throw when not approved:

```typescript
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select("id, name, status")
    .eq("id", data.account_id)
    .maybeSingle();

  if (accountErr) {
    console.error("[getCurrentAccount] account fetch error:", accountErr);
    throw new ForbiddenError("Could not load account context");
  }
  if (!account) {
    throw new ForbiddenError("Profile is not linked to an account");
  }
  if (!isAccountStatus(account.status)) {
    throw new ForbiddenError(`Unknown account status: ${account.status}`);
  }
  if (account.status !== "approved") {
    throw new PendingApprovalError();
  }

  return {
    supabase,
    userId: user.id,
    accountId: data.account_id,
    role: data.account_role,
    accountStatus: account.status,
    account: { id: account.id, name: account.name },
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/account.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/account.ts src/lib/auth/account.test.ts
git commit -m "feat(auth): enforce account approval status in getCurrentAccount"
```

---

## Task 4: Middleware redirect to `/pending-approval`

**Files:**
- Modify: `src/middleware.ts`
- Create: `src/app/pending-approval/page.tsx`
- Test: `src/middleware.test.ts` (extend existing)

**Interfaces:**
- Consumes: none new (queries `profiles`/`accounts` directly via the existing SSR client already created in middleware — Task 3's `getCurrentAccount` is server-component/route-only, not edge-middleware-safe, so middleware does its own lightweight query).
- Produces: middleware redirects any authenticated user whose account `status !== 'approved'` to `/pending-approval` before they reach any protected path.

- [ ] **Step 1: Read the existing middleware test to match its mocking style**

Run: `cat src/middleware.test.ts` — reuse whatever Supabase-client mock pattern is already there instead of inventing a new one.

- [ ] **Step 2: Write the failing test**

Add to `src/middleware.test.ts` (following the file's existing mock setup — mock `supabase.auth.getUser()` to return a user, and mock `supabase.from('profiles')...` / `.from('accounts')...` chains to return a `pending` status):

```typescript
it("redirects an authenticated user with a pending account to /pending-approval", async () => {
  // Arrange: mock getUser() -> { id: 'user-1' }, mock profiles select ->
  // { account_id: 'acct-1' }, mock accounts select -> { status: 'pending' }
  // (match this test file's existing mock helper functions).
  const request = new NextRequest("https://app.intellinix.in/dashboard");
  const response = await middleware(request);
  expect(response.status).toBe(307); // NextResponse.redirect default
  expect(response.headers.get("location")).toContain("/pending-approval");
});

it("does not redirect an approved account", async () => {
  // Arrange: same as above but accounts select -> { status: 'approved' }
  const request = new NextRequest("https://app.intellinix.in/dashboard");
  const response = await middleware(request);
  expect(response.headers.get("location")).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/middleware.test.ts`
Expected: FAIL — no redirect happens yet.

- [ ] **Step 4: Implement the middleware check**

In `src/middleware.ts`, after the existing `const { data: { user } } = await supabase.auth.getUser()` block and before the "Auth pages" block, insert:

```typescript
  // Approval gate — an authenticated user whose account is not yet
  // approved gets sent to /pending-approval for any protected path.
  // Excluded: /pending-approval itself (avoid a redirect loop),
  // auth pages (handled by the block below), and /platform/* (the
  // operator approval page, gated separately by nginx Basic Auth).
  if (
    user &&
    request.nextUrl.pathname !== "/pending-approval" &&
    !request.nextUrl.pathname.startsWith("/platform") &&
    !["/login", "/signup", "/forgot-password"].includes(request.nextUrl.pathname)
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.account_id) {
      const { data: account } = await supabase
        .from("accounts")
        .select("status")
        .eq("id", profile.account_id)
        .maybeSingle();

      if (account && account.status !== "approved") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        url.search = "";
        return withRefreshedCookies(NextResponse.redirect(url));
      }
    }
  }
```

- [ ] **Step 5: Create the pending-approval page**

```tsx
// src/app/pending-approval/page.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Account pending approval</CardTitle>
          <CardDescription>
            Your account has been created and is awaiting approval. You&apos;ll
            be able to sign in as soon as it&apos;s reviewed.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          If this is taking longer than expected, contact the person who
          invited you to this workspace.
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/middleware.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/middleware.ts src/middleware.test.ts src/app/pending-approval/page.tsx
git commit -m "feat(auth): redirect pending/rejected accounts to /pending-approval"
```

---

## Task 5: API gate — `/api/v1` and other unauthenticated-account-context routes

**Files:**
- Modify: `src/app/api/v1/**` route handlers that call `getCurrentAccount`/`requireRole` — no code change needed here, since Task 3 already makes every existing caller of `getCurrentAccount`/`requireRole` throw `PendingApprovalError` automatically.
- Test: `src/app/api/v1/contacts/route.test.ts` (or whichever `/api/v1` route already has a test file — extend it) — add one gate-check test.

**Interfaces:**
- Consumes: `PendingApprovalError`, `toErrorResponse` from Task 3.

- [ ] **Step 1: Locate an existing `/api/v1` route test to extend**

Run: `find src/app/api/v1 -name "*.test.ts"` and open the first result to see its existing mock pattern for `getCurrentAccount`.

- [ ] **Step 2: Write the failing test**

Add to that file (mirroring its existing "unauthorized" test case, e.g. `it("returns 401 when not authenticated", ...)`):

```typescript
it("returns 403 when the account is pending approval", async () => {
  vi.mocked(getCurrentAccount).mockRejectedValueOnce(new PendingApprovalError());
  const response = await GET(new Request("https://app.intellinix.in/api/v1/contacts"));
  expect(response.status).toBe(403);
});
```

(Adjust the imported route handler name and `Request` construction to match the target file's existing conventions exactly.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run <path-to-file>`
Expected: FAIL if the route doesn't already funnel errors through `toErrorResponse` — if it does (all `/api/v1` routes should, since that's the established pattern from Task 3's file), this may already PASS, which confirms the gate is live with zero additional code. Either outcome is informative — record which one happened in the commit message.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/**/*.test.ts
git commit -m "test(api): verify pending accounts get 403 from getCurrentAccount consumers"
```

---

## Task 6: Platform service-role client + Basic Auth nginx gate

**Files:**
- Create: `src/lib/platform/admin-client.ts`
- Modify: `/etc/nginx/sites-available/app.intellinix.in` on the VPS (not in this git repo — infra change, mirrored to `~/wacrm-infra/nginx/`)

**Interfaces:**
- Produces: `supabasePlatformAdmin(): SupabaseClient` — lazy singleton service-role client, mirrors `src/lib/ai/admin-client.ts`.

- [ ] **Step 1: Create the admin client**

```typescript
// src/lib/platform/admin-client.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy, shared service-role client for platform-level actions
// (approving/rejecting accounts) that must see across every
// tenant, bypassing RLS. Mirrors src/lib/ai/admin-client.ts.
let _platformAdminClient: SupabaseClient | null = null

export function supabasePlatformAdmin(): SupabaseClient {
  if (!_platformAdminClient) {
    _platformAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _platformAdminClient
}
```

- [ ] **Step 2: Generate the htpasswd file on the VPS**

```bash
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud "which htpasswd || apt-get install -y apache2-utils"
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud \
  "htpasswd -bc /etc/nginx/.htpasswd-wacrm-platform admin '<CHOOSE-A-REAL-PASSWORD>'"
```

Replace `<CHOOSE-A-REAL-PASSWORD>` with a real generated password (`openssl rand -base64 18`) — record it in your password manager, not in git.

- [ ] **Step 3: Add the Basic Auth location block to nginx**

Edit `/etc/nginx/sites-available/app.intellinix.in` on the VPS (via `ssh` + inline edit, matching the "single named file, never bulk" deploy rule), inserting before the general `location /` block in the `443` server block (created when certbot ran in the earlier session):

```nginx
    location /platform/ {
        auth_basic "wacrm platform";
        auth_basic_user_file /etc/nginx/.htpasswd-wacrm-platform;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

- [ ] **Step 4: Test and reload nginx**

```bash
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud "nginx -t && systemctl reload nginx"
```

Expected: `syntax is ok` / `test is successful`, then reload with no error.

- [ ] **Step 5: Verify the gate is live**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.intellinix.in/platform/approvals
# Expected: 401 (no credentials yet — route doesn't exist as a page
# either until Task 7, but the auth_basic challenge fires before
# the app is even reached, so 401 is correct at this stage)
```

- [ ] **Step 6: Commit local copies**

```bash
git add src/lib/platform/admin-client.ts
git commit -m "feat(platform): add service-role admin client for cross-tenant actions"
cp <the edited nginx file, pulled via scp> ~/wacrm-infra/nginx/app.intellinix.in.conf
cd ~/wacrm-infra
git add nginx/app.intellinix.in.conf
git commit -m "infra: add nginx Basic Auth gate for /platform/ (throwaway until real superadmin auth ships)"
```

---

## Task 7: `notify()` module — email, Telegram, WhatsApp adapters

**Files:**
- Create: `src/lib/platform/notify.ts`
- Create: `src/lib/platform/notify-email.ts`
- Create: `src/lib/platform/notify-telegram.ts`
- Create: `src/lib/platform/notify-whatsapp.ts`
- Test: `src/lib/platform/notify.test.ts`
- Modify: `package.json` (add `nodemailer`, `@types/nodemailer`)
- Modify: `.env.local.example` (document new env vars)

**Interfaces:**
- Produces: `notify(event: 'signup_pending' | 'account_approved' | 'account_rejected', payload: { accountId: string; reason?: string }): Promise<void>` — the single entry point Task 7 already calls.

- [ ] **Step 1: Install nodemailer**

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: Write the failing test for the dispatcher**

```typescript
// src/lib/platform/notify.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmail = vi.fn();
const sendTelegram = vi.fn();
const sendWhatsapp = vi.fn();

vi.mock("./notify-email", () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));
vi.mock("./notify-telegram", () => ({ sendTelegram: (...args: unknown[]) => sendTelegram(...args) }));
vi.mock("./notify-whatsapp", () => ({ sendWhatsapp: (...args: unknown[]) => sendWhatsapp(...args) }));

vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "Acme", owner_user_id: "user-1" }, error: null }),
        }),
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@acme.test" } }, error: null }) } },
  }),
}));

describe("notify", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendTelegram.mockReset();
    sendWhatsapp.mockReset();
    vi.unstubAllEnvs();
  });

  it("fires all enabled channels on signup_pending", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    vi.stubEnv("NOTIFY_TELEGRAM_ENABLED", "true");
    vi.stubEnv("NOTIFY_WHATSAPP_ENABLED", "false");
    const { notify } = await import("./notify");

    await notify("signup_pending", { accountId: "acct-1" });

    expect(sendEmail).toHaveBeenCalled();
    expect(sendTelegram).toHaveBeenCalled();
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  it("does not throw when a channel adapter rejects", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    const { notify } = await import("./notify");

    await expect(notify("signup_pending", { accountId: "acct-1" })).resolves.toBeUndefined();
  });

  it("only sends email for account_approved", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    vi.stubEnv("NOTIFY_TELEGRAM_ENABLED", "true");
    const { notify } = await import("./notify");

    await notify("account_approved", { accountId: "acct-1" });

    expect(sendEmail).toHaveBeenCalled();
    expect(sendTelegram).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/platform/notify.test.ts`
Expected: FAIL — none of the files exist yet.

- [ ] **Step 4: Implement the email adapter**

```typescript
// src/lib/platform/notify-email.ts
import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function transporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return _transporter;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await transporter().sendMail({
    from: process.env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}
```

- [ ] **Step 5: Implement the Telegram adapter**

```typescript
// src/lib/platform/notify-telegram.ts
export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    throw new Error(`Telegram send failed: ${response.status}`);
  }
}
```

- [ ] **Step 6: Implement the WhatsApp adapter**

```typescript
// src/lib/platform/notify-whatsapp.ts
// Uses dhan-research's WABA credentials (saas-ra-360) — credential
// reuse only, no shared code/DB with that system. Same Meta Cloud
// API shape as src/lib/whatsapp/meta-api.ts, kept separate because
// that module is tenant-config-scoped and this is a fixed platform
// number.
const META_API_VERSION = "v21.0";

export async function sendWhatsapp(text: string): Promise<void> {
  const token = process.env.WHATSAPP_PLATFORM_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PLATFORM_PHONE_ID;
  const to = process.env.NOTIFY_WHATSAPP_TO;

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`WhatsApp send failed: ${response.status}`);
  }
}
```

- [ ] **Step 7: Implement the dispatcher**

```typescript
// src/lib/platform/notify.ts
import { sendEmail } from "./notify-email";
import { sendTelegram } from "./notify-telegram";
import { sendWhatsapp } from "./notify-whatsapp";
import { supabasePlatformAdmin } from "./admin-client";

export type NotifyEvent = "signup_pending" | "account_approved" | "account_rejected";

export interface NotifyPayload {
  accountId: string;
  reason?: string;
}

async function loadAccount(accountId: string) {
  const admin = supabasePlatformAdmin();
  const { data: account } = await admin
    .from("accounts")
    .select("name, owner_user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return null;
  const { data } = await admin.auth.admin.getUserById(account.owner_user_id);
  return { name: account.name, ownerEmail: data.user?.email ?? null };
}

function messageFor(event: NotifyEvent, accountName: string, reason?: string): string {
  switch (event) {
    case "signup_pending":
      return `New wacrm signup awaiting approval: "${accountName}". Review at /platform/approvals.`;
    case "account_approved":
      return `Your wacrm account "${accountName}" has been approved. You can now sign in.`;
    case "account_rejected":
      return `Your wacrm account "${accountName}" was not approved.${reason ? ` Reason: ${reason}` : ""}`;
  }
}

/**
 * Fires the notification for `event` on every enabled channel.
 * A channel with its flag off, or one that fails, is logged and
 * skipped — never throws, never blocks the caller's underlying
 * state change.
 */
export async function notify(event: NotifyEvent, payload: NotifyPayload): Promise<void> {
  const account = await loadAccount(payload.accountId);
  if (!account) {
    console.error(`[notify] account ${payload.accountId} not found for event ${event}`);
    return;
  }

  const text = messageFor(event, account.name, payload.reason);
  const operatorEvents: NotifyEvent[] = ["signup_pending"];
  const applicantEvents: NotifyEvent[] = ["account_approved", "account_rejected"];

  const tasks: Promise<void>[] = [];

  if (operatorEvents.includes(event)) {
    if (process.env.NOTIFY_EMAIL_ENABLED === "true") {
      tasks.push(sendEmail({ to: process.env.NOTIFY_EMAIL_TO!, subject: "wacrm: action needed", text }));
    }
    if (process.env.NOTIFY_TELEGRAM_ENABLED === "true") {
      tasks.push(sendTelegram(text));
    }
    if (process.env.NOTIFY_WHATSAPP_ENABLED === "true") {
      tasks.push(sendWhatsapp(text));
    }
  }

  if (applicantEvents.includes(event) && account.ownerEmail) {
    tasks.push(sendEmail({ to: account.ownerEmail, subject: "Your wacrm account", text }));
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error(`[notify] channel failed for event ${event}:`, result.reason);
    }
  });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/platform/notify.test.ts`
Expected: PASS

- [ ] **Step 9: Document the new env vars**

Append to `.env.local.example` (in the OPTIONAL section):

```bash
# ------------------------------------------------------------------
# Platform notifications (gated signup approval)
# ------------------------------------------------------------------
# Fired when a new account needs approval (to the operator) and
# when an account is approved/rejected (to the applicant, email
# only). Each channel is independently toggle-able; a disabled or
# misconfigured channel is skipped, never blocks the others.

NOTIFY_EMAIL_ENABLED=false
NOTIFY_EMAIL_TO=you@example.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=wacrm@app.intellinix.in

NOTIFY_TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

NOTIFY_WHATSAPP_ENABLED=false
WHATSAPP_PLATFORM_TOKEN=
WHATSAPP_PLATFORM_PHONE_ID=
NOTIFY_WHATSAPP_TO=
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/platform/notify.ts src/lib/platform/notify-email.ts \
  src/lib/platform/notify-telegram.ts src/lib/platform/notify-whatsapp.ts \
  src/lib/platform/notify.test.ts package.json package-lock.json .env.local.example
git commit -m "feat(platform): multi-channel notify() for signup/approve/reject events"
```

---

## Task 8: `/platform/approvals` page + approve/reject API routes

**Files:**
- Create: `src/app/platform/approvals/page.tsx`
- Create: `src/app/api/platform/approvals/route.ts` (GET — list pending accounts)
- Create: `src/app/api/platform/approvals/[accountId]/route.ts` (POST — approve or reject)
- Test: `src/app/api/platform/approvals/route.test.ts`
- Test: `src/app/api/platform/approvals/[accountId]/route.test.ts`

**Interfaces:**
- Consumes: `supabasePlatformAdmin` from Task 6, `notify` from Task 7 (already implemented — this task's approve/reject route calls `notify('account_approved', ...)` / `notify('account_rejected', ...)`).
- Produces: `GET /api/platform/approvals` → `{ accounts: Array<{ id: string; name: string; ownerEmail: string; createdAt: string }> }`. `POST /api/platform/approvals/[accountId]` with body `{ action: 'approve' } | { action: 'reject'; reason: string }`.

- [ ] **Step 1: Write the failing test for the list route**

```typescript
// src/app/api/platform/approvals/route.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [
              {
                id: "acct-1",
                name: "Acme",
                created_at: "2026-08-17T00:00:00Z",
                owner_user_id: "user-1",
              },
            ],
            error: null,
          }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: "owner@acme.test" } }, error: null }),
      },
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/platform/approvals", () => {
  it("returns pending accounts with owner email", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.accounts).toEqual([
      { id: "acct-1", name: "Acme", ownerEmail: "owner@acme.test", createdAt: "2026-08-17T00:00:00Z" },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/platform/approvals/route.test.ts`
Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement the list route**

```typescript
// src/app/api/platform/approvals/route.ts
import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";

export async function GET() {
  const admin = supabasePlatformAdmin();

  const { data: accounts, error } = await admin
    .from("accounts")
    .select("id, name, created_at, owner_user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[GET /api/platform/approvals] query error:", error);
    return NextResponse.json({ error: "Failed to load pending accounts" }, { status: 500 });
  }

  const withEmails = await Promise.all(
    (accounts ?? []).map(async (account) => {
      const { data } = await admin.auth.admin.getUserById(account.owner_user_id);
      return {
        id: account.id,
        name: account.name,
        ownerEmail: data.user?.email ?? "(unknown)",
        createdAt: account.created_at,
      };
    })
  );

  return NextResponse.json({ accounts: withEmails });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/platform/approvals/route.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the approve/reject route**

```typescript
// src/app/api/platform/approvals/[accountId]/route.test.ts
import { describe, it, expect, vi } from "vitest";

const updateMock = vi.fn(() => ({ eq: async () => ({ error: null }) }));
vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({ update: updateMock }),
  }),
}));
vi.mock("@/lib/platform/notify", () => ({ notify: vi.fn() }));

import { POST } from "./route";
import { notify } from "@/lib/platform/notify";

describe("POST /api/platform/approvals/[accountId]", () => {
  it("approves and notifies", async () => {
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" })
    );
    expect(notify).toHaveBeenCalledWith("account_approved", { accountId: "acct-1" });
  });

  it("rejects with a reason and notifies", async () => {
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      body: JSON.stringify({ action: "reject", reason: "duplicate signup" }),
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", rejected_reason: "duplicate signup" })
    );
    expect(notify).toHaveBeenCalledWith("account_rejected", { accountId: "acct-1", reason: "duplicate signup" });
  });

  it("400s when reject has no reason", async () => {
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      body: JSON.stringify({ action: "reject" }),
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run "src/app/api/platform/approvals/[accountId]/route.test.ts"`
Expected: FAIL — file doesn't exist.

- [ ] **Step 7: Implement the approve/reject route**

```typescript
// src/app/api/platform/approvals/[accountId]/route.ts
import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { notify } from "@/lib/platform/notify";

interface Body {
  action: "approve" | "reject";
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;
  const body = (await request.json()) as Body;

  if (body.action === "reject" && !body.reason?.trim()) {
    return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  }

  const admin = supabasePlatformAdmin();
  const update =
    body.action === "approve"
      ? { status: "approved", approved_at: new Date().toISOString() }
      : { status: "rejected", rejected_reason: body.reason };

  const { error } = await admin.from("accounts").update(update).eq("id", accountId);
  if (error) {
    console.error("[POST /api/platform/approvals] update error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }

  if (body.action === "approve") {
    await notify("account_approved", { accountId });
  } else {
    await notify("account_rejected", { accountId, reason: body.reason! });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run "src/app/api/platform/approvals/[accountId]/route.test.ts"`
Expected: PASS

- [ ] **Step 9: Build the approvals page (client component, calls the two routes above)**

```tsx
// src/app/platform/approvals/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface PendingAccount {
  id: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
}

export default function ApprovalsPage() {
  const [accounts, setAccounts] = useState<PendingAccount[]>([]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/platform/approvals");
    const body = await res.json();
    setAccounts(body.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    const reason = reasonById[id];
    if (action === "reject" && !reason?.trim()) {
      alert("A rejection reason is required.");
      return;
    }
    await fetch(`/api/platform/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify(action === "approve" ? { action } : { action, reason }),
    });
    await load();
  }

  if (loading) return <div className="p-8">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Pending account approvals</h1>
      {accounts.length === 0 && (
        <p className="text-muted-foreground">No pending accounts.</p>
      )}
      {accounts.map((account) => (
        <Card key={account.id}>
          <CardHeader>
            <CardTitle className="text-base">{account.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {account.ownerEmail} · signed up {new Date(account.createdAt).toLocaleString()}
            </p>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button onClick={() => act(account.id, "approve")}>Approve</Button>
            <Input
              placeholder="Rejection reason"
              value={reasonById[account.id] ?? ""}
              onChange={(e) =>
                setReasonById((prev) => ({ ...prev, [account.id]: e.target.value }))
              }
              className="max-w-xs"
            />
            <Button variant="destructive" onClick={() => act(account.id, "reject")}>
              Reject
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add src/app/platform/approvals/page.tsx src/app/api/platform/approvals/route.ts \
  src/app/api/platform/approvals/route.test.ts \
  "src/app/api/platform/approvals/[accountId]/route.ts" \
  "src/app/api/platform/approvals/[accountId]/route.test.ts"
git commit -m "feat(platform): approve/reject page and API routes for pending accounts"
```

---

## Task 9: Wire real signup — trigger `signup_pending` notification

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx` (or wherever the signup form calls `supabase.auth.signUp` — locate exact call site first)
- Test: extend that component's existing test file if one exists, otherwise add an integration-style test at `src/app/api/platform/approvals/route.test.ts` level is not appropriate here — this is a client-side trigger, so verify via Task 11's live E2E check instead (no new unit test needed; signup itself is Supabase Auth's existing, already-tested flow — we're only adding a fire-and-forget notify call).

**Interfaces:**
- Consumes: nothing new — this task calls a new route that wraps `notify`.

- [ ] **Step 1: Locate the signup call site**

Run: `grep -n "auth.signUp" src/app/\(auth\)/signup/page.tsx`

- [ ] **Step 2: Add a server route the client calls right after successful signup**

```typescript
// src/app/api/platform/signup-notify/route.ts
//
// Fire-and-forget notification that a new account needs approval.
// Called by the client immediately after a successful
// supabase.auth.signUp() — the DB trigger (handle_new_user) has
// already created the pending account by the time this runs, since
// it's synchronous with the signUp() call.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/platform/notify";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.account_id) {
    await notify("signup_pending", { accountId: profile.account_id });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Call it from the signup page after `signUp()` succeeds**

In `src/app/(auth)/signup/page.tsx`, immediately after the existing successful-signup branch (wherever it currently redirects or shows a success state), add:

```typescript
fetch("/api/platform/signup-notify", { method: "POST" }).catch(() => {
  // Best-effort — a failed notification must never block the
  // signup flow itself.
});
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/platform/signup-notify/route.ts "src/app/(auth)/signup/page.tsx"
git commit -m "feat(platform): notify operator on new signup"
```

---

## Task 10: Build, typecheck, full test suite

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass, including every test added in Tasks 2–8.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds (same as the successful build already verified live during initial deploy).

- [ ] **Step 4: Commit if any lockfile/build-artifact changes were produced**

```bash
git status
# only commit if npm ci/build modified tracked files unexpectedly — investigate first if so
```

---

## Task 11: Deploy and verify live

**Files:** none (deploy-only task)

- [ ] **Step 1: Push the local commits, pull on VPS, rebuild**

```bash
cd /Users/vyapaarmitra/wacrm
git push origin main
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud "cd /var/www/wacrm/app && git pull origin main"
```

- [ ] **Step 2: Apply the migration (already done in Task 1, verify it's present)**

```bash
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud \
  "docker exec supabase-db psql -U postgres -c \"select column_name from information_schema.columns where table_name='accounts' and column_name='status';\""
```

Expected: one row, `status`.

- [ ] **Step 3: Fill in the real notification env vars in `.env.local` on the VPS**

Edit `/var/www/wacrm/app/.env.local` on the VPS to add whichever `NOTIFY_*_ENABLED=true` + credentials you're ready to use now (leave others `false` — they're safe no-ops). This requires the SMTP creds and/or Telegram bot token you'll provide.

- [ ] **Step 4: Rebuild and restart the app container**

```bash
ssh -i ~/.ssh/id_ed25519 root@srv1824357.hstgr.cloud "cd /var/www/wacrm/app && docker compose build && docker compose up -d"
```

- [ ] **Step 5: Live verification — real signup through the real gate**

```bash
# 1. Create a throwaway test account via the real signup form (browser
#    or curl against Supabase Auth directly).
# 2. Confirm login redirects to /pending-approval, not /dashboard.
curl -s -o /dev/null -w '%{http_code}\n' https://app.intellinix.in/dashboard \
  -H "Cookie: <session cookie from the throwaway signup>"
# Expected: 307 (redirect)

# 3. Approve it via the real page (enter the Basic Auth credentials
#    from Task 6 in the browser prompt), or curl:
curl -s -u admin:<password> https://app.intellinix.in/api/platform/approvals
# Expected: JSON listing the throwaway account

curl -s -u admin:<password> -X POST \
  https://app.intellinix.in/api/platform/approvals/<accountId> \
  -d '{"action":"approve"}'
# Expected: {"ok":true}

# 4. Confirm the throwaway account can now reach /dashboard.
# 5. Delete the throwaway test account+user afterward (via Supabase
#    Studio at the self-hosted instance, or SQL) so it doesn't linger.
```

- [ ] **Step 6: Update `docs/ops/SYSTEM_STATE.md`-equivalent for wacrm**

If a `docs/ops/` tracking file exists for wacrm (create one modeled on saas-ra-360's `SYSTEM_STATE.md` if not), record: migration 040 applied, gated signup live, notification channels enabled/disabled, throwaway Basic Auth credential location (password manager, not this file).
