
-- 1) gis_config: strip plaintext credential defaults from schema
ALTER TABLE public.gis_config ALTER COLUMN api_token DROP DEFAULT;
ALTER TABLE public.gis_config ALTER COLUMN vendor_key DROP DEFAULT;
ALTER TABLE public.gis_config ALTER COLUMN intake_device_id DROP DEFAULT;
ALTER TABLE public.gis_config ALTER COLUMN wtp_device_id DROP DEFAULT;
ALTER TABLE public.gis_config ALTER COLUMN oht1_device_id DROP DEFAULT;
ALTER TABLE public.gis_config ALTER COLUMN oht2_device_id DROP DEFAULT;
ALTER TABLE public.gis_config ALTER COLUMN oht3_device_id DROP DEFAULT;

-- 2) Admin-only notification_recipients table
CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('export','alarm')),
  tag_config_id uuid REFERENCES public.tag_config(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_recipients_unique
  ON public.notification_recipients (scope, COALESCE(tag_config_id::text, ''), lower(email));

CREATE INDEX notification_recipients_scope_idx
  ON public.notification_recipients (scope);

CREATE INDEX notification_recipients_tag_idx
  ON public.notification_recipients (tag_config_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage notification_recipients"
  ON public.notification_recipients
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Migrate existing email arrays
INSERT INTO public.notification_recipients (scope, email)
SELECT DISTINCT 'export', lower(trim(e))
FROM public.plant_config, unnest(export_emails) AS e
WHERE e IS NOT NULL AND trim(e) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.notification_recipients (scope, tag_config_id, email)
SELECT DISTINCT 'alarm', tc.id, lower(trim(e))
FROM public.tag_config tc, unnest(tc.alarm_emails) AS e
WHERE e IS NOT NULL AND trim(e) <> ''
ON CONFLICT DO NOTHING;

-- 4) Drop the now-redundant columns
ALTER TABLE public.plant_config DROP COLUMN export_emails;
ALTER TABLE public.tag_config DROP COLUMN alarm_emails;

-- 5) alarms: allow operators to acknowledge (column-restricted)
REVOKE UPDATE ON public.alarms FROM authenticated;
GRANT UPDATE (acknowledged, acknowledged_at) ON public.alarms TO authenticated;

CREATE POLICY "auth acknowledge alarms"
  ON public.alarms
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
