// Device-scoped notification preferences for incoming inbox messages —
// same localStorage pattern as the contact-panel show/hide toggle.
// Two independent switches: an audible ping, and a browser Notification
// popup (which additionally requires OS/browser permission).

export const SOUND_STORAGE_KEY = "wacrm:inbox:notify-sound";
export const POPUP_STORAGE_KEY = "wacrm:inbox:notify-popup";

export function getSoundPref(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
  return stored === null ? true : stored === "true";
}

export function setSoundPref(enabled: boolean) {
  window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
}

export function getPopupPref(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(POPUP_STORAGE_KEY) === "true";
}

export function setPopupPref(enabled: boolean) {
  window.localStorage.setItem(POPUP_STORAGE_KEY, String(enabled));
}

let audioCtx: AudioContext | null = null;

/**
 * Short two-tone chime synthesized via WebAudio — no bundled audio
 * asset to fetch/host, and it respects the OS/tab mute state like any
 * other audio source.
 */
export function playNotificationSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    // Best-effort — never let a notification chime break message handling.
  }
}

export function showNotificationPopup(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: "wacrm-inbox" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Best-effort.
  }
}
