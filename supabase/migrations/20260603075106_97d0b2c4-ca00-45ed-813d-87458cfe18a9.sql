
-- =================== ENUM ===================
CREATE TYPE public.app_role AS ENUM ('admin','operator','viewer');

-- helper: updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =================== plant_config ===================
CREATE TABLE public.plant_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_name text DEFAULT 'Bua Bicchiya SCADA',
  export_emails text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_config TO authenticated;
GRANT ALL ON public.plant_config TO service_role;
ALTER TABLE public.plant_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all plant_config" ON public.plant_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_plant_config_updated BEFORE UPDATE ON public.plant_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================== mqtt_config ===================
CREATE TABLE public.mqtt_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_url text,
  client_id text,
  oht_topic text,
  oht_topic_2 text,
  oht_topic_3 text,
  intake_topic text,
  wtp_topic text,
  auto_connect boolean DEFAULT true,
  is_connected boolean DEFAULT false,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mqtt_config TO authenticated;
GRANT ALL ON public.mqtt_config TO service_role;
ALTER TABLE public.mqtt_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all mqtt_config" ON public.mqtt_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_mqtt_config_updated BEFORE UPDATE ON public.mqtt_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================== tag_config ===================
CREATE TABLE public.tag_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  tag_id text NOT NULL,
  label text,
  unit text,
  is_active boolean DEFAULT true,
  activated_at timestamptz DEFAULT now(),
  high_setpoint numeric,
  low_setpoint numeric,
  alarm_enabled boolean DEFAULT false,
  alarm_emails text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tag_config TO authenticated;
GRANT ALL ON public.tag_config TO service_role;
ALTER TABLE public.tag_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all tag_config" ON public.tag_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_tag_config_updated BEFORE UPDATE ON public.tag_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================== alarms ===================
CREATE TABLE public.alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id text NOT NULL,
  tag_config_id uuid REFERENCES public.tag_config(id) ON DELETE SET NULL,
  label text,
  value numeric,
  unit text,
  alarm_type text,
  message text,
  section text,
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  email_sent boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alarms TO authenticated;
GRANT ALL ON public.alarms TO service_role;
ALTER TABLE public.alarms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all alarms" ON public.alarms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_alarms_created ON public.alarms(created_at DESC);

-- =================== historian_logs ===================
CREATE TABLE public.historian_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id text NOT NULL,
  tag_config_id uuid REFERENCES public.tag_config(id) ON DELETE SET NULL,
  section text,
  value numeric,
  timestamp timestamptz NOT NULL DEFAULT now(),
  source text,
  mqtt_topic text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historian_logs TO authenticated;
GRANT ALL ON public.historian_logs TO service_role;
ALTER TABLE public.historian_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all historian_logs" ON public.historian_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_historian_tag_time ON public.historian_logs(tag_id, timestamp DESC);
CREATE INDEX idx_historian_section_time ON public.historian_logs(section, timestamp DESC);

-- =================== historian_aggregates ===================
CREATE TABLE public.historian_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  tag_id text NOT NULL,
  bucket_start timestamptz NOT NULL,
  bucket_size text DEFAULT '1h',
  avg_value numeric,
  min_value numeric,
  max_value numeric,
  sample_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historian_aggregates TO authenticated;
GRANT ALL ON public.historian_aggregates TO service_role;
ALTER TABLE public.historian_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all hist_agg" ON public.historian_aggregates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_hist_agg_section ON public.historian_aggregates(section, bucket_start DESC);

-- =================== consumption_data ===================
CREATE TABLE public.consumption_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  date date NOT NULL,
  hour integer,
  hourly_consumption numeric DEFAULT 0,
  daily_consumption numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consumption_data TO authenticated;
GRANT ALL ON public.consumption_data TO service_role;
ALTER TABLE public.consumption_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all consumption" ON public.consumption_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_consumption_section_date ON public.consumption_data(section, date DESC);
CREATE TRIGGER trg_consumption_updated BEFORE UPDATE ON public.consumption_data FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================== pump_analytics ===================
CREATE TABLE public.pump_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_id text NOT NULL,
  section text NOT NULL,
  date date NOT NULL,
  runtime_seconds integer DEFAULT 0,
  start_count integer DEFAULT 0,
  total_runtime_seconds bigint DEFAULT 0,
  total_start_count integer DEFAULT 0,
  current_state boolean DEFAULT false,
  last_state_change timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pump_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pump_analytics TO authenticated;
GRANT ALL ON public.pump_analytics TO service_role;
ALTER TABLE public.pump_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all pump_analytics" ON public.pump_analytics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_pump_section_date ON public.pump_analytics(section, date DESC);
CREATE TRIGGER trg_pump_analytics_updated BEFORE UPDATE ON public.pump_analytics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================== data_exports ===================
CREATE TABLE public.data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  file_path text,
  record_count integer DEFAULT 0,
  email_sent boolean DEFAULT false,
  downloaded boolean DEFAULT false,
  cleanup_done boolean DEFAULT false,
  status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_exports TO authenticated;
GRANT ALL ON public.data_exports TO service_role;
ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all data_exports" ON public.data_exports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_data_exports_created ON public.data_exports(created_at DESC);

-- =================== chat_conversations ===================
CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chat_conversations" ON public.chat_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_chat_conv_updated BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================== chat_messages ===================
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text,
  suggestions jsonb,
  deleted boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chat_messages" ON public.chat_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_chat_msg_conv ON public.chat_messages(conversation_id, created_at);

-- =================== user_roles ===================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Seed admin role for the existing admin user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE email = 'adminbicchiya@buabicchiya.scada'
ON CONFLICT DO NOTHING;
