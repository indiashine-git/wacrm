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

function getAudioCtx(): AudioContext | null {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

/**
 * Browsers refuse to run an AudioContext until it's been resumed
 * inside a real user gesture (click/keydown/tap) — resuming it from
 * an async WebSocket callback later, with no gesture in that call
 * stack, silently does nothing in Chrome/Safari's autoplay policy.
 * Call this once from a real click/keydown handler as early as
 * possible (dashboard-shell does this on the first interaction
 * anywhere in the app) so the context is already running by the time
 * a notification actually needs to play.
 */
export function primeAudioContext() {
  try {
    getAudioCtx()?.resume();
  } catch {
    // Best-effort.
  }
}

/**
 * WATU's signature chime: a soft three-note rising arpeggio (C6-E6-G6,
 * a bright major triad) synthesized via WebAudio — no bundled audio
 * asset to fetch/host, and it respects the OS/tab mute state like any
 * other audio source. Each note pairs a sine fundamental with a
 * quieter octave-up sine for a rounder, more "bell-like" timbre than
 * a flat single-oscillator beep.
 */
export function playNotificationSound() {
  try {
    const audioCtx = getAudioCtx();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    const notes = [1046.5, 1318.5, 1568]; // C6, E6, G6
    notes.forEach((freq, i) => {
      const start = now + i * 0.1;
      const duration = 0.32;

      const fundamental = audioCtx!.createOscillator();
      const fundamentalGain = audioCtx!.createGain();
      fundamental.type = "sine";
      fundamental.frequency.value = freq;
      fundamentalGain.gain.setValueAtTime(0, start);
      fundamentalGain.gain.linearRampToValueAtTime(0.22, start + 0.015);
      fundamentalGain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      fundamental.connect(fundamentalGain);
      fundamentalGain.connect(audioCtx!.destination);
      fundamental.start(start);
      fundamental.stop(start + duration);

      const overtone = audioCtx!.createOscillator();
      const overtoneGain = audioCtx!.createGain();
      overtone.type = "sine";
      overtone.frequency.value = freq * 2;
      overtoneGain.gain.setValueAtTime(0, start);
      overtoneGain.gain.linearRampToValueAtTime(0.06, start + 0.015);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, start + duration * 0.7);
      overtone.connect(overtoneGain);
      overtoneGain.connect(audioCtx!.destination);
      overtone.start(start);
      overtone.stop(start + duration * 0.7);
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
