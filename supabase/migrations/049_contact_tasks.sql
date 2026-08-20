-- Tasks/reminders per contact -- "follow up with this contact
-- Thursday". Basic CRM table missing until now; contact sidebar's
-- Notes/Deals/Tags had no way to schedule a follow-up.

CREATE TABLE IF NOT EXISTS contact_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contact_tasks_contact ON contact_tasks(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_contact_tasks_account_due ON contact_tasks(account_id, due_at);

ALTER TABLE contact_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_tasks_select ON contact_tasks FOR SELECT USING (is_account_member(account_id));
CREATE POLICY contact_tasks_insert ON contact_tasks FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY contact_tasks_update ON contact_tasks FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY contact_tasks_delete ON contact_tasks FOR DELETE USING (is_account_member(account_id, 'agent'));
