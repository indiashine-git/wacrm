import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the Supabase auth code (from password-reset / magic-link /
// email-confirmation links) for a session, then redirects to `next`.
// Without this route, every `resetPasswordForEmail` / `signUp` redirect
// that points here 404s before a session ever gets established.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
