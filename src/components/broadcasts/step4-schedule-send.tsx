'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Send, Loader2, Users, Save, CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AudienceConfig {
  type: string;
  tagIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
}

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  onSend: () => void;
  onSaveDraft?: () => void;
  onSchedule?: (scheduledAt: Date) => void;
  lockAudience: boolean;
  onLockAudienceChange: (locked: boolean) => void;
  isEdit?: boolean;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
}

/** `datetime-local`'s value has no timezone — read/write it as local wall-clock time. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  onSend,
  onSaveDraft,
  onSchedule,
  lockAudience,
  onLockAudienceChange,
  isEdit,
  onBack,
  isProcessing,
  progress,
}: Step4Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const isCsv = audience.type === 'csv';

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        if (audience.type === 'all') {
          const { count } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true });
          setEstimatedReach(count ?? 0);
        } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.tagIds);

          const uniqueIds = new Set((contactTags ?? []).map((ct) => ct.contact_id));
          setEstimatedReach(uniqueIds.size);
        } else if (audience.type === 'csv' && audience.csvContacts) {
          setEstimatedReach(audience.csvContacts.length);
        } else {
          setEstimatedReach(0);
        }
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  const audienceLabel =
    audience.type === 'all'
      ? t('scheduleSend.audienceAll')
      : audience.type === 'tags'
        ? t('scheduleSend.audienceTags')
        : audience.type === 'csv'
          ? t('scheduleSend.audienceCsv')
          : t('scheduleSend.audienceField');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('scheduleSend.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('scheduleSend.subtitle')}
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('scheduleSend.broadcastName')}</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('scheduleSend.broadcastNamePlaceholder')}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">{t('scheduleSend.summary')}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.template')}</p>
            <p className="text-foreground">{template.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.audience')}</p>
            <p className="text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estimated Reach</p>
            <div className="flex items-center gap-1.5">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <p className="font-medium text-foreground">{estimatedReach.toLocaleString()}</p>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Language</p>
            <p className="text-foreground">{template.language ?? 'en_US'}</p>
          </div>
        </div>
      </div>

      {/* Audience lock — only meaningful when saving as a draft or
          scheduling (an instant send always resolves now regardless).
          CSV audiences are a fixed uploaded list, so there is nothing
          to "recalculate" — force-locked and explained rather than
          offering a toggle that can't do anything. */}
      {(onSaveDraft || onSchedule) && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isCsv ? true : lockAudience}
              disabled={isCsv}
              onChange={(e) => onLockAudienceChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary disabled:opacity-60"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                {t('scheduleSend.lockAudience')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {isCsv
                  ? t('scheduleSend.lockAudienceCsvForced')
                  : lockAudience
                    ? t('scheduleSend.lockAudienceOnHint')
                    : t('scheduleSend.lockAudienceOffHint')}
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{t('scheduleSend.sending')}</p>
            </div>
            <span className="text-xs font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('scheduleSend.saveDraft')}
            </Button>
          )}

          {onSchedule && (
            <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
              <DialogTrigger
                render={
                  <Button
                    variant="outline"
                    disabled={!name.trim() || isProcessing}
                    onClick={() => {
                      // Default to 15 minutes out so the picker never
                      // opens on a time that's already in the past.
                      setScheduleValue(
                        toDatetimeLocalValue(new Date(Date.now() + 15 * 60 * 1000)),
                      );
                    }}
                    className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                  />
                }
              >
                <CalendarClock className="h-4 w-4" />
                {t('scheduleSend.scheduleForLater')}
              </DialogTrigger>
              <DialogContent className="border-border bg-popover sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-popover-foreground">
                    {t('scheduleSend.scheduleDialogTitle')}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {t('scheduleSend.scheduleDialogDescription')}
                  </DialogDescription>
                </DialogHeader>
                <Input
                  type="datetime-local"
                  value={scheduleValue}
                  min={toDatetimeLocalValue(new Date(Date.now() + 60 * 1000))}
                  onChange={(e) => setScheduleValue(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowSchedule(false)}
                    className="border-border text-muted-foreground"
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    disabled={!scheduleValue}
                    onClick={() => {
                      const date = new Date(scheduleValue);
                      if (Number.isNaN(date.getTime())) return;
                      setShowSchedule(false);
                      onSchedule(date);
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <CalendarClock className="h-4 w-4" />
                    {t('scheduleSend.scheduleForLater')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogTrigger
            render={
              <Button
                disabled={!name.trim() || isProcessing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              />
            }
          >
            <Send className="h-4 w-4" />
            {isEdit ? t('scheduleSend.updateAndSend') : t('scheduleSend.sendNow')}
          </DialogTrigger>
          <DialogContent className="border-border bg-popover sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">Confirm Broadcast</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                You are about to send this broadcast to{' '}
                <span className="font-medium text-popover-foreground">{estimatedReach.toLocaleString()}</span>{' '}
                contacts using the{' '}
                <span className="font-medium text-popover-foreground">{template.name}</span> template.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                className="border-border text-muted-foreground"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  onSend();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="h-4 w-4" />
                {isEdit ? t('scheduleSend.updateAndSend') : t('scheduleSend.sendNow')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}
