DROP POLICY IF EXISTS "Authenticated users can insert gis_config" ON public.gis_config;
DROP POLICY IF EXISTS "Authenticated users can update gis_config" ON public.gis_config;
DROP POLICY IF EXISTS "Authenticated users can delete gis_config" ON public.gis_config;
DROP POLICY IF EXISTS "gis_config_insert" ON public.gis_config;
DROP POLICY IF EXISTS "gis_config_update" ON public.gis_config;
DROP POLICY IF EXISTS "gis_config_delete" ON public.gis_config;
DROP POLICY IF EXISTS "Authenticated can insert gis_config" ON public.gis_config;
DROP POLICY IF EXISTS "Authenticated can update gis_config" ON public.gis_config;
DROP POLICY IF EXISTS "Authenticated can delete gis_config" ON public.gis_config;

CREATE POLICY "Admins can insert gis_config"
  ON public.gis_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update gis_config"
  ON public.gis_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete gis_config"
  ON public.gis_config FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));