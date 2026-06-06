
-- ============ MQTT CONFIG: admin only ============
DROP POLICY IF EXISTS "auth all mqtt_config" ON public.mqtt_config;
CREATE POLICY "admins manage mqtt_config" ON public.mqtt_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ PLANT CONFIG: read auth, write admin ============
DROP POLICY IF EXISTS "auth all plant_config" ON public.plant_config;
CREATE POLICY "auth read plant_config" ON public.plant_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write plant_config" ON public.plant_config
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update plant_config" ON public.plant_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete plant_config" ON public.plant_config
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ TAG CONFIG: read auth, write admin ============
DROP POLICY IF EXISTS "auth all tag_config" ON public.tag_config;
CREATE POLICY "auth read tag_config" ON public.tag_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins write tag_config" ON public.tag_config
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update tag_config" ON public.tag_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete tag_config" ON public.tag_config
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ DATA EXPORTS: admin only ============
DROP POLICY IF EXISTS "auth all data_exports" ON public.data_exports;
CREATE POLICY "admins manage data_exports" ON public.data_exports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ OPERATIONAL TABLES: read+insert auth, update/delete admin ============
-- alarms
DROP POLICY IF EXISTS "auth all alarms" ON public.alarms;
CREATE POLICY "auth read alarms" ON public.alarms FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert alarms" ON public.alarms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admins update alarms" ON public.alarms FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete alarms" ON public.alarms FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- historian_logs
DROP POLICY IF EXISTS "auth all historian_logs" ON public.historian_logs;
CREATE POLICY "auth read historian_logs" ON public.historian_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert historian_logs" ON public.historian_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admins update historian_logs" ON public.historian_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete historian_logs" ON public.historian_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- historian_aggregates
DROP POLICY IF EXISTS "auth all hist_agg" ON public.historian_aggregates;
CREATE POLICY "auth read hist_agg" ON public.historian_aggregates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert hist_agg" ON public.historian_aggregates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admins update hist_agg" ON public.historian_aggregates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete hist_agg" ON public.historian_aggregates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- consumption_data
DROP POLICY IF EXISTS "auth all consumption" ON public.consumption_data;
CREATE POLICY "auth read consumption" ON public.consumption_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert consumption" ON public.consumption_data FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update consumption" ON public.consumption_data FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "admins delete consumption" ON public.consumption_data FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- pump_analytics
DROP POLICY IF EXISTS "auth all pump_analytics" ON public.pump_analytics;
CREATE POLICY "auth read pump_analytics" ON public.pump_analytics FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert pump_analytics" ON public.pump_analytics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update pump_analytics" ON public.pump_analytics FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "admins delete pump_analytics" ON public.pump_analytics FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ USER_ROLES: explicit write deny (no policy = denied, this makes intent clear) ============
-- Only service_role / SQL admins can change roles; no client-side writes allowed.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

-- ============ SECURITY DEFINER FUNCTIONS: revoke public/anon EXECUTE ============
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
