"use client";

import { useRealtime } from "@/hooks/use-realtime";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types";
import {
  getSoundPref,
  getPopupPref,
  playNotificationSound,
  showNotificationPopup,
} from "@/lib/inbox/notification-prefs";

/**
 * App-wide inbound-message alerting (sound + desktop popup). Mounted
 * once in the dashboard shell so it works from ANY page — mounting
 * this only inside the Inbox page (the original implementation) meant
 * the moment you navigated away to Dashboard/Contacts/wherever, the
 * whole realtime subscription unmounted and alerts silently stopped,
 * which defeats the entire point of an "alert so you don't have to
 * stare at the inbox" feature (#312 follow-up).
 *
 * The Inbox page itself no longer fires sound/popup — this is the
 * single source of truth, so it can't double-fire when both are
 * mounted at once.
 */
export function useGlobalNotifications() {
  useRealtime({
    channelName: "global-notifications",
    onMessageEvent: async (event) => {
      if (event.eventType !== "INSERT") return;
      const newMsg = event.new as Message;
      if (newMsg.sender_type !== "customer") return;

      if (getSoundPref()) playNotificationSound();

      if (getPopupPref()) {
        const supabase = createClient();
        const { data: conv } = await supabase
          .from("conversations")
          .select("contact:contacts(name, phone)")
          .eq("id", newMsg.conversation_id)
          .maybeSingle();
        const contact = conv?.contact as { name?: string; phone?: string } | null;
        showNotificationPopup(
          contact?.name || contact?.phone || "New message",
          newMsg.content_text || "You have a new message",
        );
      }
    },
    enabled: true,
  });
}
