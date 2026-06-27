-- Migration: Schedule daily 1-year retention cleanup and 3-month export checks via pg_cron
-- This schedules the background jobs to invoke the Deno Edge Function.

-- Step 1: Remove old cron job if exists to avoid duplicate execution
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'retention-cleanup-export-cron';

-- Step 2: Schedule retention-cleanup-export-cron to run every day at 02:00 UTC (07:30 IST)
SELECT cron.schedule(
  'retention-cleanup-export-cron',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url       := 'https://kpzlcjgopkyyioimihae.supabase.co/functions/v1/export-historian-data',
    headers   := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT cron_secret FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
    ),
    body      := '{"action": "daily_check"}'::jsonb
  );
  $$
);
