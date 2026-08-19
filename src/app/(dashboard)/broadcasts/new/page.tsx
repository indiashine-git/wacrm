'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { MessageTemplate } from '@/types';
import { Step1ChooseTemplate } from '@/components/broadcasts/step1-choose-template';
import { Step2SelectAudience } from '@/components/broadcasts/step2-select-audience';
import { Step3Personalize } from '@/components/broadcasts/step3-personalize';
import { Step4ScheduleSend } from '@/components/broadcasts/step4-schedule-send';
import { useBroadcastSending } from '@/hooks/use-broadcast-sending';
import { Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

const steps = [
  { label: 'template', key: 'template' },
  { label: 'audience', key: 'audience' },
  { label: 'personalize', key: 'personalize' },
  { label: 'send', key: 'send' },
] as const;

export default function NewBroadcastPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const t = useTranslations('Broadcasts.new');
  const { accountId } = useAuth();
  const {
    createAndSendBroadcast,
    createDraftOrScheduled,
    isProcessing,
    progress,
  } = useBroadcastSending();

  const [currentStep, setCurrentStep] = useState(0);
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [audience, setAudience] = useState<{
    type: 'all' | 'tags' | 'custom_field' | 'csv';
    tagIds?: string[];
    customField?: {
      fieldId: string;
      operator: 'is' | 'is_not' | 'contains';
      value: string;
    };
    csvContacts?: { phone: string; name?: string }[];
    excludeTagIds?: string[];
  }>({ type: 'all' });
  const [variables, setVariables] = useState<
    Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>
  >({});
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [name, setName] = useState('');
  const [lockAudience, setLockAudience] = useState(true);

  // ── Edit mode: hydrate wizard state from an existing draft/scheduled
  // broadcast row. Recipients are always recomputed on save (see
  // createDraftOrScheduled), so nothing here needs to reconstruct the
  // OLD recipient rows — only the inputs that produced them.
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;

    (async () => {
      setLoadingEdit(true);
      setEditLoadError(null);
      const supabase = createClient();

      const { data: broadcast, error: bcError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', editId)
        .maybeSingle();

      if (cancelled) return;

      if (bcError || !broadcast) {
        setEditLoadError(t('editLoadFailed'));
        setLoadingEdit(false);
        return;
      }
      if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
        setEditLoadError(t('editNotEditable'));
        setLoadingEdit(false);
        return;
      }

      const { data: templateRow } = await supabase
        .from('message_templates')
        .select('*')
        .eq('name', broadcast.template_name)
        .eq('language', broadcast.template_language)
        .maybeSingle();

      if (cancelled) return;

      if (!templateRow) {
        setEditLoadError(t('editTemplateGone'));
        setLoadingEdit(false);
        return;
      }

      const filter = (broadcast.audience_filter ?? { type: 'all' }) as {
        type: 'all' | 'tags' | 'custom_field' | 'csv';
        tagIds?: string[];
        customField?: {
          fieldId: string;
          operator: 'is' | 'is_not' | 'contains';
          value: string;
        };
        csvContacts?: { phone: string; name?: string }[];
        excludeTagIds?: string[];
      };

      setName(broadcast.name);
      setTemplate(templateRow as MessageTemplate);
      setAudience(filter);
      setVariables(
        (broadcast.template_variables ?? {}) as Record<
          string,
          { type: 'static' | 'field' | 'custom_field'; value: string }
        >,
      );
      // A recipient count > 0 means this draft was saved with the
      // audience locked (resolved) — default the toggle to match so
      // re-saving without touching it preserves the original choice.
      setLockAudience(
        filter.type === 'csv' || broadcast.total_recipients > 0,
      );
      setLoadingEdit(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [editId, t]);

  async function handleSend() {
    if (!template) return;

    try {
      let broadcastId: string;
      if (editId) {
        // Editing an existing draft/scheduled row: resolve + lock the
        // (possibly changed) audience into that same row, then fire it
        // through the server pipeline — same path a scheduled send or
        // the detail page's "Send now" button uses.
        broadcastId = await createDraftOrScheduled(
          { name, template, audience, variables, headerMediaUrl },
          { lockAudience: true, scheduledAt: null, existingBroadcastId: editId },
        );
        const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/send`, {
          method: 'POST',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
      } else {
        broadcastId = await createAndSendBroadcast({
          name,
          template,
          audience: {
            type: audience.type,
            tagIds: audience.tagIds,
            customField: audience.customField,
            csvContacts: audience.csvContacts,
            excludeTagIds: audience.excludeTagIds,
          },
          variables,
          headerMediaUrl,
        });
      }
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Broadcast failed';
      console.error('Broadcast failed:', err);
      toast.error(message);
    }
  }

  async function handleSaveDraft() {
    if (!template || !name.trim()) {
      toast.error(t('toastGiveName'));
      return;
    }
    if (!accountId) {
      toast.error(t('toastNotLinked'));
      return;
    }
    try {
      const broadcastId = await createDraftOrScheduled(
        { name: name.trim(), template, audience, variables, headerMediaUrl },
        { lockAudience, scheduledAt: null, existingBroadcastId: editId ?? undefined },
      );
      toast.success(t('toastDraftSaved'));
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      toast.error(
        t('toastFailedDraft', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }),
      );
    }
  }

  async function handleSchedule(scheduledAt: Date) {
    if (!template || !name.trim()) {
      toast.error(t('toastGiveName'));
      return;
    }
    if (!accountId) {
      toast.error(t('toastNotLinked'));
      return;
    }
    if (scheduledAt.getTime() <= Date.now()) {
      toast.error(t('toastScheduleInFuture'));
      return;
    }
    try {
      const broadcastId = await createDraftOrScheduled(
        { name: name.trim(), template, audience, variables, headerMediaUrl },
        {
          lockAudience,
          scheduledAt: scheduledAt.toISOString(),
          existingBroadcastId: editId ?? undefined,
        },
      );
      toast.success(t('toastScheduled'));
      router.push(`/broadcasts/${broadcastId}`);
    } catch (err) {
      toast.error(
        t('toastFailedSchedule', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }),
      );
    }
  }

  if (loadingEdit) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (editLoadError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-400">{editLoadError}</p>
        <button
          className="text-sm text-primary underline"
          onClick={() => router.push('/broadcasts')}
        >
          {t('backToBroadcasts')}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {editId ? t('editTitle') : t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary bg-primary/10 text-primary'
                        : 'border border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isActive ? 'text-foreground' : isCompleted ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {t(`steps.${step.label}`)}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-3 h-px flex-1 ${
                    index < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="relative min-h-[400px]">
        <div
          className="transition-all duration-300 ease-in-out"
          style={{
            opacity: isProcessing ? 0.6 : 1,
            pointerEvents: isProcessing ? 'none' : 'auto',
          }}
        >
          {currentStep === 0 && (
            <Step1ChooseTemplate
              selectedTemplate={template}
              onSelect={setTemplate}
              onNext={() => setCurrentStep(1)}
              onBack={() => router.push('/broadcasts')}
            />
          )}
          {currentStep === 1 && (
            <Step2SelectAudience
              audience={audience}
              onUpdate={setAudience}
              onNext={() => setCurrentStep(2)}
              onBack={() => setCurrentStep(0)}
            />
          )}
          {currentStep === 2 && template && (
            <Step3Personalize
              template={template}
              variables={variables}
              onUpdate={setVariables}
              headerMediaUrl={headerMediaUrl}
              onHeaderMediaUrlChange={setHeaderMediaUrl}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && template && (
            <Step4ScheduleSend
              name={name}
              onNameChange={setName}
              template={template}
              audience={audience}
              onSend={handleSend}
              onSaveDraft={handleSaveDraft}
              onSchedule={handleSchedule}
              lockAudience={lockAudience}
              onLockAudienceChange={setLockAudience}
              isEdit={!!editId}
              onBack={() => setCurrentStep(2)}
              isProcessing={isProcessing}
              progress={progress}
            />
          )}
        </div>
      </div>
    </div>
  );
}
