-- ============================================================
-- Migration: Increase pg_net http_post timeout from 5000ms default
-- to 35000ms so scada-ingest (25s MQTT window) and other Edge
-- Functions are not aborted prematurely by pg_net.
-- ============================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('scada-ingest-cron', 'gis-sync-cron', 'aggregate-data-cron', 'retention-cleanup-export-cron');

SELECT cron.schedule(
  'scada-ingest-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url                  := 'https://kpzlcjgopkyyioimihae.supabase.co/functions/v1/scada-ingest',
    headers              := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT cron_secret FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 35000
  );
  $$
);

SELECT cron.schedule(
  'gis-sync-cron',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url                  := 'https://kpzlcjgopkyyioimihae.supabase.co/functions/v1/gis-sync',
    headers              := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT cron_secret FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 35000
  );
  $$
);

SELECT cron.schedule(
  'aggregate-data-cron',
  '2 * * * *',
  $$
  SELECT net.http_post(
    url                  := 'https://kpzlcjgopkyyioimihae.supabase.co/functions/v1/aggregate-data',
    headers              := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT cron_secret FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 35000
  );
  $$
);

SELECT cron.schedule(
  'retention-cleanup-export-cron',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url                  := 'https://kpzlcjgopkyyioimihae.supabase.co/functions/v1/export-historian-data',
    headers              := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (SELECT cron_secret FROM public.gis_config ORDER BY created_at DESC LIMIT 1)
    ),
    body                 := '{"action": "daily_check"}'::jsonb,
    timeout_milliseconds := 35000
  );
  $$
);
