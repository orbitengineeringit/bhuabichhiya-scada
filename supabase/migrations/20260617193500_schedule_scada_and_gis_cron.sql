-- Database Migration: Schedule SCADA Ingest and GIS Sync via pg_cron
-- This schedules the background jobs to invoke the Deno Edge Functions.

-- Remove old jobs to avoid duplicate execution if the migration is rerun
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'scada-ingest-cron';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gis-sync-cron';

-- Schedule scada-ingest to run every 5 minutes
SELECT cron.schedule(
  'scada-ingest-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bnyojzfjxjljewjplhmi.supabase.co/functions/v1/scada-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT cron_secret FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
    )
  );
  $$
);

-- Schedule gis-sync to run every 1 hour (as per frontend configuration)
SELECT cron.schedule(
  'gis-sync-cron',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bnyojzfjxjljewjplhmi.supabase.co/functions/v1/gis-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT cron_secret FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
    )
  );
  $$
);
