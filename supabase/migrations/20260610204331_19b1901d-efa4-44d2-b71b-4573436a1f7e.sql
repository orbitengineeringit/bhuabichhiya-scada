
-- gis_config
CREATE TABLE public.gis_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL DEFAULT 'https://urbangis.mp.gov.in/api/Station_Data/SCADA_Integration_Intake_WTP_OHT',
  api_token text NOT NULL DEFAULT '9090orbit6cb3638d62141ab71205c57pro99ada6ea9f306d3205741engs2022',
  vendor_key text NOT NULL DEFAULT 'UADDORESREG022',
  intake_device_id text NOT NULL DEFAULT 'BHU_INTK_001',
  wtp_device_id text NOT NULL DEFAULT 'BHU_WTP_001',
  oht1_device_id text NOT NULL DEFAULT 'BHU_OHT_001',
  oht2_device_id text NOT NULL DEFAULT 'BHU_OHT_002',
  oht3_device_id text NOT NULL DEFAULT 'BHU_OHT_003',
  auto_sync_enabled boolean NOT NULL DEFAULT true,
  sync_interval_seconds int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gis_config TO authenticated;
GRANT ALL ON public.gis_config TO service_role;
ALTER TABLE public.gis_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read gis_config" ON public.gis_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth update gis_config" ON public.gis_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth insert gis_config" ON public.gis_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE TRIGGER trg_gis_config_updated BEFORE UPDATE ON public.gis_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.gis_config DEFAULT VALUES;

-- gis_sync_logs
CREATE TABLE public.gis_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  request_payload jsonb,
  response_status int,
  response_body text,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  duration_ms int,
  triggered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gis_sync_logs TO authenticated;
GRANT ALL ON public.gis_sync_logs TO service_role;
ALTER TABLE public.gis_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read gis_sync_logs" ON public.gis_sync_logs FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_gis_sync_logs_triggered_at ON public.gis_sync_logs (triggered_at DESC);
