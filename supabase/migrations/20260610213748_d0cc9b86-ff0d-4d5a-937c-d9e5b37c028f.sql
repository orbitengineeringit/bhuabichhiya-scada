
DROP POLICY IF EXISTS "auth acknowledge alarms" ON public.alarms;

CREATE POLICY "auth acknowledge alarms"
  ON public.alarms
  FOR UPDATE
  TO authenticated
  USING (acknowledged = false)
  WITH CHECK (acknowledged = true);
