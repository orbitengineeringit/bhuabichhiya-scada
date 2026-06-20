-- ============================================================
-- Migration: Fix alarms section constraint to allow 'wtp'
--            + Add source column to alarms table
--            + Add index for faster queries & debounce checks
--            + Schedule daily 90-day alarm cleanup cron
-- ============================================================

-- Step 1: Drop old constraint if exists, and add updated one with 'wtp'
ALTER TABLE public.alarms DROP CONSTRAINT IF EXISTS alarms_section_check;
ALTER TABLE public.alarms ADD CONSTRAINT alarms_section_check
  CHECK (section = ANY (ARRAY['intake'::text, 'oht'::text, 'wtp'::text]));

-- Step 2: Add 'source' column to differentiate browser vs backend alarms
ALTER TABLE public.alarms
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'browser'::text NOT NULL,
  ADD CONSTRAINT alarms_source_check CHECK (source = ANY (ARRAY['browser'::text, 'backend:5min'::text]));

-- Step 3: Create composite index for faster queries and debounce checking
CREATE INDEX IF NOT EXISTS idx_alarms_tag_type_created
  ON public.alarms (tag_id, alarm_type, created_at DESC);

-- Step 4: Schedule daily cleanup of alarms older than 90 days (keeps Free Tier DB lightweight)
-- Safely unschedule first if it already exists
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'alarm-cleanup-cron';

SELECT cron.schedule(
  'alarm-cleanup-cron',
  '0 3 * * *', -- Everyday at 03:00 UTC (08:30 IST)
  $$DELETE FROM public.alarms WHERE created_at < NOW() - INTERVAL '90 days';$$
);
