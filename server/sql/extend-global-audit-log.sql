
-- Global Audit Log Extension
-- Author: Derek Gamboa
-- Software Practicum - Fall 2026

-- Extend the existing audit table to support
-- activity tracking across the application.

-- Identify what type of record was affected.
ALTER TABLE public.admin_audit_log
ADD COLUMN IF NOT EXISTS entity_type TEXT;

-- Identify the specific record that was affected.
ALTER TABLE public.admin_audit_log
ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Improve performance when searching for
-- actions performed by a particular user.
CREATE INDEX IF NOT EXISTS audit_actor_time_idx
ON public.admin_audit_log (actor_id, created_at DESC);

-- Improve performance when searching for
-- activity related to a specific record.
CREATE INDEX IF NOT EXISTS audit_entity_idx
ON public.admin_audit_log (entity_type, entity_id);
