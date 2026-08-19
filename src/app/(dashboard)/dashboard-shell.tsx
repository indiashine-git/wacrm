"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { primeAudioContext } from "@/lib/inbox/notification-prefs";
import { useGlobalNotifications } from "@/hooks/use-global-notifications";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Alerting has to be mounted here, not inside the Inbox page — a
  // subscription scoped to that page dies the instant the user
  // navigates elsewhere, which is exactly when an alert is useful.
  useGlobalNotifications();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Registers the no-op service worker (public/sw.js) so the app
  // meets Chrome's PWA install criteria and so notifications work on
  // Android (see notification-prefs.ts). Deliberately a pure
  // passthrough — see that file for why it must never cache anything.
  //
  // Also forces new deploys to actually reach installed PWAs: browsers
  // only lazily re-check a registered SW's script for changes (up to
  // ~24h by spec), and Android's standalone-app mode can keep an old
  // JS bundle running in memory across "reopens" that aren't a true
  // fresh process start. Several fixes in this app shipped correctly
  // but weren't visible until a manual "clear app storage" — this
  // makes that unnecessary going forward: call update() on every
  // mount/focus to force an immediate byte-check, and reload once when
  // a new worker actually takes control (self.skipWaiting() in sw.js
  // means it takes over right away rather than waiting for every tab
  // to close first).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => {});
        const onFocus = () => registration.update().catch(() => {});
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") onFocus();
        });
      })
      .catch(() => {
        // Best-effort — a failed SW registration shouldn't break the app,
        // it only means the install prompt/notifications may not work.
      });
  }, []);

  // Unlock the WebAudio context on the first real click/keydown
  // anywhere in the dashboard — browsers refuse to run audio started
  // outside a user gesture, and a WebSocket-triggered notification
  // chime later has no gesture in its call stack. Priming this early
  // means the sound alert actually plays when a message arrives.
  useEffect(() => {
    const unlock = () => {
      primeAudioContext();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          {children}
        </main>
        <MobileBottomNav onOpenMore={() => setSidebarOpen(true)} />
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
