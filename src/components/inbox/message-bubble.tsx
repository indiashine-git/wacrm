"use client";

import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  MapPin,
  LayoutTemplate,
  CornerDownLeft,
  Sparkles,
  ClipboardCheck,
  ShoppingBag,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import {
  MediaAudioBubble,
  MediaDocumentBubble,
  MediaImageBubble,
  MediaUnavailable,
  MediaVideoBubble,
} from "./message-media";
import { InteractivePreview } from "@/components/interactive/interactive-preview";
import { formatWhatsAppText } from "@/lib/whatsapp/format-text";
import { useTranslations } from "next-intl";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  /**
   * Opens the thread's media viewer on this message. Only images and videos
   * call it; omitted when the parent renders no viewer, in which case media
   * stays inline and non-clickable.
   */
  onOpenMedia?: (messageId: string) => void;
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3.5 w-3.5 text-blue-400" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    default:
      return null;
  }
}

/**
 * Parses the webhook's "[Form submitted]\nfield: value\n..." fallback
 * text for a real Meta Flow submission back into ordered [key, value]
 * pairs. Returns null for anything else so callers can fall back to
 * the plain-text rendering unchanged.
 */
function parseFormSubmittedText(
  text: string | null | undefined,
): [string, string][] | null {
  if (!text?.startsWith("[Form submitted]\n")) return null;
  const body = text.slice("[Form submitted]\n".length);
  const pairs: [string, string][] = [];
  for (const line of body.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    pairs.push([line.slice(0, idx), line.slice(idx + 2)]);
  }
  return pairs.length > 0 ? pairs : null;
}

/** "business_name" -> "Business name" */
function formatFieldLabel(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface ParsedOrderLine {
  quantity: number;
  productId: string;
}

/**
 * Parses the webhook's "[Order]\n1x watu\n2x orbit\nTotal: INR 3.00"
 * fallback text for a real Meta catalog-order submission back into
 * structured items + total. Returns null for anything else.
 */
function parseOrderText(
  text: string | null | undefined,
): { items: ParsedOrderLine[]; total: string } | null {
  if (!text?.startsWith("[Order]\n")) return null;
  const lines = text.slice("[Order]\n".length).split("\n");
  const items: ParsedOrderLine[] = [];
  let total = "";
  for (const line of lines) {
    const itemMatch = line.match(/^(\d+)x (.+)$/);
    if (itemMatch) {
      items.push({ quantity: Number(itemMatch[1]), productId: itemMatch[2] });
      continue;
    }
    const totalMatch = line.match(/^Total: (.+)$/);
    if (totalMatch) total = totalMatch[1];
  }
  return items.length > 0 ? { items, total } : null;
}

function MessageContent({
  message,
  t,
  isAgent,
  onOpenMedia,
}: {
  message: Message;
  t: ReturnType<typeof useTranslations>;
  /** Outbound bubbles sit on the primary fill — badges must invert. */
  isAgent: boolean;
  onOpenMedia?: (messageId: string) => void;
}) {
  // Passed to the media bubbles as a no-arg callback; `undefined` when the
  // parent wired up no viewer, which is what makes them non-clickable.
  const openMedia = onOpenMedia ? () => onOpenMedia(message.id) : undefined;

  switch (message.content_type) {
    case "text": {
      const order = parseOrderText(message.content_text);
      if (order) {
        return (
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <ShoppingBag className="h-3 w-3" />
              {t("orderPlaced")}
            </span>
            <ul className="space-y-0.5 text-sm">
              {order.items.map((item, i) => (
                <li key={i}>
                  {item.quantity}x {item.productId}
                </li>
              ))}
            </ul>
            {order.total && (
              <p className="text-sm font-medium">{t("orderTotal", { total: order.total })}</p>
            )}
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {formatWhatsAppText(message.content_text ?? "")}
        </p>
      );
    }

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImageBubble message={message} onOpen={openMedia} t={t} />
          ) : (
            <MediaUnavailable label={t("photo")} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {formatWhatsAppText(message.content_text)}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <MediaVideoBubble message={message} onOpen={openMedia} t={t} />
          ) : (
            <MediaUnavailable label={t("video")} t={t} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {formatWhatsAppText(message.content_text)}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <MediaAudioBubble message={message} t={t} />
          ) : (
            <MediaUnavailable label={t("audio")} t={t} />
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || t("document")} t={t} />;
      }
      return <MediaDocumentBubble message={message} t={t} />;

    case "template":
      // Templates are almost always outbound, where the bubble fill IS
      // `primary` — so the old `bg-primary/20 text-primary` chip was
      // primary-on-primary and invisible. Paired with a null
      // content_text (issue #483) that rendered a bubble with nothing
      // in it at all. Invert on the primary fill, and fall back to the
      // template's name when we have no stored body (legacy rows sent
      // before the fix).
      return (
        <div>
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              isAgent
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/20 text-primary",
            )}
          >
            <LayoutTemplate className="h-3 w-3" />
            {t("template")}
          </span>
          {message.content_text ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {formatWhatsAppText(message.content_text)}
            </p>
          ) : (
            message.template_name && (
              <p className="mt-1 break-words text-sm italic opacity-80">
                {message.template_name}
              </p>
            )
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || t("locationShared")}</span>
        </div>
      );

    case "interactive": {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return <InteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === "customer") {
        // A real Meta WhatsApp Flow submission — webhook route encodes
        // it as "[Form submitted]\nfield: value\n..." since there's no
        // structured column for inbound flow data. Render the fields
        // as a clean card instead of dumping that raw stacked text.
        const flowFields = parseFormSubmittedText(message.content_text);
        if (flowFields) {
          return (
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <ClipboardCheck className="h-3 w-3" />
                {t("formSubmitted")}
              </span>
              <dl className="space-y-1">
                {flowFields
                  .filter(([key]) => key !== "flow_token")
                  .map(([key, value]) => (
                    <div key={key} className="flex gap-1.5 text-sm">
                      <dt className="shrink-0 font-medium text-foreground">
                        {formatFieldLabel(key)}:
                      </dt>
                      <dd className="break-words">{value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              {t("buttonReply")}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm">
              {formatWhatsAppText(message.content_text || t("interactiveReply"))}
            </p>
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {formatWhatsAppText(message.content_text || t("interactiveReply"))}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {formatWhatsAppText(message.content_text || t("unsupported"))}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenMedia,
}: MessageBubbleProps) {
  const t = useTranslations("Inbox.bubble");

  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          // Plain rounded bubble, no tail. The CSS-triangle attempt
          // didn't read as a real WhatsApp tail and isn't worth the
          // fragility (it already caused one real bug via Tailwind's
          // box-sizing preflight) — clean rounded corners on both
          // sides is the safer, better-looking default.
          "relative rounded-2xl px-3 pb-1.5 pt-2",
          isAgent
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        {/* Reserve room bottom-right for the timestamp/ticks corner
            overlay below, so short last lines don't collide with it. */}
        <div className="pr-14">
          <MessageContent
            message={message}
            t={t}
            isAgent={isAgent}
            onOpenMedia={onOpenMedia}
          />
        </div>
        {/* Timestamp + ticks sit in the bubble's own bottom-right
            corner, inline with the last line rather than on a
            separate row below the message — matches WhatsApp. */}
        <div className="absolute bottom-1.5 right-2.5 flex items-center gap-1">
          {/* AI badge — only on replies the auto-reply bot generated
              (always outbound, so it sits on the primary fill). Lets
              agents tell an AI reply from their own / a Flow's at a
              glance. */}
          {message.ai_generated && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/20 px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-primary-foreground"
              title={t("aiBadgeTitle")}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t("aiBadge")}
            </span>
          )}
          <span
            className={cn(
              "text-[11px]",
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} />}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
