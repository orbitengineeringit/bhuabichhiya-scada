
-- Lock down GIS config to admins only (creds: api_token, vendor_key, device IDs)
DROP POLICY IF EXISTS "auth read gis_config" ON public.gis_config;
DROP POLICY IF EXISTS "auth insert gis_config" ON public.gis_config;
DROP POLICY IF EXISTS "auth update gis_config" ON public.gis_config;

-- (Admin-only INSERT/UPDATE/DELETE policies from prior migration are already in place;
--  add admin-only SELECT here)
DROP POLICY IF EXISTS "Admins can read gis_config" ON public.gis_config;
CREATE POLICY "Admins can read gis_config"
ON public.gis_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- gis_sync_logs may contain creds in request_payload — restrict reads to admins
DROP POLICY IF EXISTS "auth read gis_sync_logs" ON public.gis_sync_logs;
DROP POLICY IF EXISTS "Admins can read gis_sync_logs" ON public.gis_sync_logs;
CREATE POLICY "Admins can read gis_sync_logs"
ON public.gis_sync_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Remove open authenticated write policies on data tables (writes happen via service_role in edge functions)
DROP POLICY IF EXISTS "auth insert alarms" ON public.alarms;

DROP POLICY IF EXISTS "auth insert consumption" ON public.consumption_data;
DROP POLICY IF EXISTS "auth update consumption" ON public.consumption_data;

DROP POLICY IF EXISTS "auth insert hist_agg" ON public.historian_aggregates;

DROP POLICY IF EXISTS "auth insert historian_logs" ON public.historian_logs;

DROP POLICY IF EXISTS "auth insert pump_analytics" ON public.pump_analytics;
DROP POLICY IF EXISTS "auth update pump_analytics" ON public.pump_analytics;
