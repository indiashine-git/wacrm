'use client';

// ============================================================
// ConnectWhatsAppButton
//
// Loads Meta's JS SDK, opens the Facebook Login for Business popup
// (Embedded Signup) using the app's login configuration, and on
// completion POSTs the resulting code + WABA/phone number IDs to
// /api/whatsapp/embedded-signup/exchange for the server-side token
// exchange. The access token itself never reaches the browser.
//
// Two independent signals have to both arrive before we call the
// server: FB.login's callback gives us the authorization `code`,
// and a `postMessage` event from the popup gives us the selected
// wabaId/phoneNumberId (Meta's docs call this the "session logging
// response"). Neither alone is enough to proceed.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

declare global {
  interface Window {
    FB?: {
      init: (opts: {
        appId: string;
        autoLogAppEvents?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string };
          status?: string;
        }) => void,
        opts: {
          config_id: string;
          response_type: 'code';
          override_default_response_type: true;
          extras?: { setup?: Record<string, unknown>; sessionInfoVersion?: string };
        }
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';
// Only accept the embedded-signup session payload from Meta's own
// origins — a page embedding this component in an iframe (or any
// other script on the page) cannot spoof a fake "success" event.
const TRUSTED_ORIGINS = ['https://www.facebook.com', 'https://business.facebook.com'];

interface SessionData {
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
}

function loadFbSdk(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) {
      resolve();
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
      resolve();
    };
    if (document.getElementById('facebook-jssdk')) return;
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = SDK_SRC;
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
}

interface ConnectWhatsAppButtonProps {
  onConnected: (result: { pin: string }) => void;
}

export function ConnectWhatsAppButton({ onConnected }: ConnectWhatsAppButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading-sdk' | 'waiting' | 'exchanging'>('idle');
  const sessionRef = useRef<SessionData | null>(null);
  const codeRef = useRef<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!TRUSTED_ORIGINS.includes(event.origin)) return;
      let data: { type?: string; event?: string; data?: SessionData };
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'FINISH' && data.data) {
        sessionRef.current = data.data;
        tryExchange();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryExchange() {
    const code = codeRef.current;
    const session = sessionRef.current;
    if (!code || !session?.waba_id || !session?.phone_number_id) return;
    setStatus('exchanging');
    try {
      const res = await fetch('/api/whatsapp/embedded-signup/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          wabaId: session.waba_id,
          phoneNumberId: session.phone_number_id,
          businessId: session.business_id,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || 'Failed to connect WhatsApp');
        setStatus('idle');
        return;
      }
      toast.success('WhatsApp connected');
      if (body.catalogId) {
        toast.success('Commerce catalog created and connected');
      }
      onConnected({ pin: body.pin });
    } catch (err) {
      console.error('[ConnectWhatsAppButton] exchange error:', err);
      toast.error('Could not reach the server. Try again?');
    } finally {
      setStatus('idle');
      codeRef.current = null;
      sessionRef.current = null;
    }
  }

  async function handleClick() {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
    if (!appId || !configId) {
      toast.error('WhatsApp connect is not configured on this instance yet.');
      return;
    }
    setStatus('loading-sdk');
    await loadFbSdk(appId);
    setStatus('waiting');
    window.FB!.login(
      (response) => {
        if (response.authResponse?.code) {
          codeRef.current = response.authResponse.code;
          tryExchange();
        } else {
          setStatus('idle');
        }
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: '3' },
      }
    );
  }

  const busy = status !== 'idle';

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {status === 'exchanging' ? 'Connecting…' : 'Opening Meta…'}
        </>
      ) : (
        <>
          <MessageCircle className="size-4" />
          Connect WhatsApp
        </>
      )}
    </Button>
  );
}
