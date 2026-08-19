"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Radio, Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useTranslations } from "next-intl";

interface MobileBottomNavProps {
  /** Opens the existing Sidebar drawer — reused as the "More" sheet
   *  instead of building a second overflow menu. */
  onOpenMore: () => void;
}

/**
 * Native-app-style bottom tab bar, mobile only (hidden at lg+, where
 * the persistent Sidebar already covers navigation). Four items:
 * the three highest-frequency destinations plus "More", which opens
 * the same drawer the old header hamburger used to — that hamburger
 * is now removed from Header on mobile since this replaces it.
 */
export function MobileBottomNav({ onOpenMore }: MobileBottomNavProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { totalUnreadMessages } = useTotalUnread();

  const items: { href: string; labelKey: string; icon: LucideIcon; badge?: number }[] = [
    { href: "/inbox", labelKey: "inbox", icon: MessageSquare, badge: totalUnreadMessages },
    { href: "/contacts", labelKey: "contacts", icon: Users },
    { href: "/broadcasts", labelKey: "broadcasts", icon: Radio },
  ];

  return (
    // Outer element carries the safe-area padding as *extra* space
    // beyond the fixed-height tab row below, so the row itself stays
    // a reliable, known 4rem (h-16) — pages that need to size against
    // this bar's total height (the Inbox page's calc) can rely on
    // "4rem + env(safe-area-inset-bottom)" being exact, not an
    // estimate that drifts if content height ever changes.
    <nav
      className="shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Primary"
    >
      <div className="flex h-16 items-stretch">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                // Tapping Inbox while already there is a same-route
                // Link, which Next.js treats as a no-op navigation —
                // it did nothing when a thread was open, reading as
                // broken. Tell the page to pop back to the list
                // instead, matching native chat apps.
                if (item.href === "/inbox" && pathname.startsWith("/inbox")) {
                  window.dispatchEvent(new Event("watu:inbox-back-to-list"));
                }
              }}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <item.icon className="h-5 w-5" />
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              {t(item.labelKey)}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors"
        >
          <Menu className="h-5 w-5" />
          {t("more")}
        </button>
      </div>
    </nav>
  );
}
