'use client';

// Settings -> Integrations: Zapier / Make. Both directions already
// exist in the product -- this card is pure discoverability, not new
// backend. Verified live 2026-08-21: a real `tag_added` automation with
// a Send Webhook step delivered a real signed POST from this server to
// an external URL the instant the trigger fired -- exactly what a
// Zapier "Catch Hook" / Make "Webhook" trigger receives.
//
// Trigger direction (WATU -> Zapier/Make): any automation trigger
// (new contact, tag added, order received, etc.) + a "Send Webhook"
// step pointed at Zapier/Make's own Catch Hook URL. No new WATU setup.
//
// Action direction (Zapier/Make -> WATU): the public v1 API + an API
// key (Settings -> API keys), called from Zapier's "Webhooks by
// Zapier" action or Make's "HTTP" module. No app-store review needed
// since this is a private/custom integration, not a listed app.

import { Webhook, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function ZapierMakeSettings() {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="size-4" />
          Zapier / Make
        </CardTitle>
        <CardDescription>
          Connect WATU to thousands of other apps. Works today with what&apos;s already set up below --
          no new app to install, no approval to wait on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-background/50 p-3">
          <div className="flex items-center gap-2">
            <Webhook className="text-muted-foreground size-4 shrink-0" />
            <p className="text-sm font-medium text-foreground">Trigger a Zap/Scenario from WATU</p>
            <Badge variant="outline" className="ml-auto text-xs">no setup here</Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            In Zapier or Make, create a &quot;Catch Hook&quot; / &quot;Webhook&quot; trigger -- it gives you a URL.
            Then in WATU: Automations → new automation → any trigger (new contact, tag added, order received...)
            → add a <span className="font-medium text-foreground">Send Webhook</span> step → paste that URL.
            The next time the trigger fires, Zapier/Make receives it in real time.
          </p>
        </div>

        <div className="rounded-md border border-border bg-background/50 p-3">
          <div className="flex items-center gap-2">
            <Zap className="text-muted-foreground size-4 shrink-0" />
            <p className="text-sm font-medium text-foreground">Let a Zap/Scenario act on WATU</p>
            <Badge variant="outline" className="ml-auto text-xs">needs an API key</Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Create a key above under API keys, then use Zapier&apos;s &quot;Webhooks by Zapier&quot; action (or
            Make&apos;s HTTP module) to call WATU&apos;s public API -- create/update a contact, send a message,
            start a broadcast -- with{' '}
            <code className="text-[11px]">Authorization: Bearer YOUR_API_KEY</code>.
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Full endpoint reference: <code className="text-[11px]">docs/public-api.md</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
