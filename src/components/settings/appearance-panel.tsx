"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Moon, Palette, SunMoon, Sun, Volume2 } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { MODES, THEMES, type Mode, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { SettingsPanelHead } from "./settings-panel-head";
import { Switch } from "@/components/ui/switch";
import {
  getSoundPref,
  setSoundPref,
  getPopupPref,
  setPopupPref,
  playNotificationSound,
} from "@/lib/inbox/notification-prefs";

/**
 * Appearance panel — light/dark mode + accent-color picker.
 *
 * Two independent controls: a mode toggle (light / dark) and the
 * accent grid. Either applies + persists immediately. No save button:
 * each change is a single attribute swap on <html>, there's nothing
 * to roll back.
 *
 * Persistence: localStorage only (device-scoped). The boot script in
 * layout.tsx replays both choices before first paint on subsequent
 * loads.
 */
export function AppearancePanel() {
  const { theme, setTheme, mode, setMode } = useTheme();
  const t = useTranslations("Settings.appearance");

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
      />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          {t("mode")}
        </h3>

        <div
          role="radiogroup"
          aria-label="Color mode"
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette className="size-4 text-muted-foreground" />
          {t("accentColor")}
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((tObj) => (
            <ThemeCard
              key={tObj.id}
              id={tObj.id}
              name={tObj.name}
              tagline={tObj.tagline}
              swatch={tObj.swatch}
              isActive={tObj.id === theme}
              onPick={() => setTheme(tObj.id)}
            />
          ))}
        </div>
      </div>

      <NotificationsBlock />
    </section>
  );
}

/**
 * Device-scoped inbox notification toggles — same localStorage
 * pattern as the mode/accent choices above, but two independent
 * switches: an audible ping on every inbound message, and a browser
 * Notification popup (which additionally needs OS/browser permission,
 * requested lazily the moment the user turns it on).
 */
function NotificationsBlock() {
  const t = useTranslations("Settings.appearance");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [popupEnabled, setPopupEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    setSoundEnabled(getSoundPref());
    setPopupEnabled(getPopupPref());
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  function handleSoundToggle(checked: boolean) {
    setSoundEnabled(checked);
    setSoundPref(checked);
    if (checked) playNotificationSound();
  }

  async function handlePopupToggle(checked: boolean) {
    if (checked && permission !== "granted" && "Notification" in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        // Permission denied/dismissed — don't persist an "on" state the
        // browser will silently refuse to honor.
        setPopupEnabled(false);
        setPopupPref(false);
        return;
      }
    }
    setPopupEnabled(checked);
    setPopupPref(checked);
  }

  return (
    <div className="mt-8 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Bell className="size-4 text-muted-foreground" />
        {t("notifications")}
      </h3>

      <div className="max-w-md space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Volume2 className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{t("notifySound")}</p>
              <p className="text-xs text-muted-foreground">{t("notifySoundHint")}</p>
            </div>
          </div>
          <Switch checked={soundEnabled} onCheckedChange={handleSoundToggle} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Bell className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{t("notifyPopup")}</p>
              <p className="text-xs text-muted-foreground">
                {permission === "denied"
                  ? t("notifyPopupBlocked")
                  : t("notifyPopupHint")}
              </p>
            </div>
          </div>
          <Switch
            checked={popupEnabled}
            onCheckedChange={handlePopupToggle}
            disabled={permission === "denied"}
          />
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("Settings.appearance");
  const isLight = mode === "light";
  const Icon = isLight ? Sun : Moon;
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={t("useMode", { mode })}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-semibold capitalize text-foreground">
        {mode}
      </span>
      {isActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Check className="h-3 w-3" />
          {t("active")}
        </span>
      )}
    </button>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("Settings.appearance");
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={t("useTheme", { name })}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full"
          style={{
            background: swatch,
            boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.15)",
          }}
        />
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Check className="h-3 w-3" />
            {t("active")}
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {tagline}
        </div>
      </div>
      <div
        className="mt-1 flex h-2 overflow-hidden rounded-full"
        aria-hidden
      >
        <span className="flex-1" style={{ background: swatch }} />
        <span className="w-3 bg-muted-foreground/60" />
        <span className="w-3 bg-muted" />
        <span className="w-3 bg-card" />
      </div>
      <span className="sr-only">Theme id: {id}</span>
    </button>
  );
}
