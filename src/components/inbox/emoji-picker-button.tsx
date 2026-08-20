"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Theme } from "emoji-picker-react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslations } from "next-intl";

// The picker ships its own category strip (Smileys, People, Animals,
// Food, Activities, Travel, Objects, Symbols, Flags) plus a search box
// and skin-tone selector — the same standard emoji set WhatsApp itself
// uses, not a hand-picked subset. Loaded client-side only: it's a large
// bundle (full emoji dataset) that every message-composer mount
// shouldn't pay for until the user actually opens the picker.
const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface EmojiPickerButtonProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

export function EmojiPickerButton({ onSelect, className }: EmojiPickerButtonProps) {
  const t = useTranslations("Inbox.composer");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
        aria-label={t("emojiPickerAria")}
        title={t("emojiPickerAria")}
      >
        <Smile className="h-5 w-5" />
      </PopoverTrigger>
      <PopoverContent className="w-auto border-none bg-transparent p-0 shadow-none" align="start">
        <Picker
          theme={Theme.AUTO}
          onEmojiClick={(emojiData) => {
            onSelect(emojiData.emoji);
            setOpen(false);
          }}
          searchDisabled={false}
          skinTonesDisabled={false}
          lazyLoadEmojis
          width={320}
          height={380}
        />
      </PopoverContent>
    </Popover>
  );
}
