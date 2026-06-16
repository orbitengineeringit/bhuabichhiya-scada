
-- Unique key for safe upsert (section + date + hour)
ALTER TABLE public.consumption_data
  DROP CONSTRAINT IF EXISTS consumption_data_section_date_hour_key;
CREATE UNIQUE INDEX IF NOT EXISTS consumption_data_section_date_hour_uidx
  ON public.consumption_data (section, date, COALESCE(hour, -1));

CREATE OR REPLACE FUNCTION public.refresh_consumption_from_historian(
  _from timestamptz DEFAULT (now() - interval '2 hours'),
  _to   timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  WITH src AS (
    SELECT
      CASE
        WHEN tag_id = 'INT-Totalizer'  THEN 'intake'
        WHEN tag_id = 'WTP-Totalizer'  THEN 'wtp'
        WHEN tag_id = 'OHT1-Totalizer' THEN 'oht-1'
        WHEN tag_id = 'OHT2-Totalizer' THEN 'oht-2'
        WHEN tag_id = 'OHT3-Totalizer' THEN 'oht-3'
      END AS sect,
      date_trunc('hour', timestamp) AS hr,
      value
    FROM public.historian_logs
    WHERE timestamp >= _from
      AND timestamp <  _to
      AND tag_id IN ('INT-Totalizer','WTP-Totalizer','OHT1-Totalizer','OHT2-Totalizer','OHT3-Totalizer')
      AND value IS NOT NULL
  ),
  hourly AS (
    SELECT sect,
           hr::date           AS d,
           extract(hour FROM hr)::int AS h,
           GREATEST(MAX(value) - MIN(value), 0) AS hourly_use
    FROM src
    WHERE sect IS NOT NULL
    GROUP BY sect, hr
  ),
  upsert AS (
    INSERT INTO public.consumption_data (section, date, hour, hourly_consumption, daily_consumption)
    SELECT sect, d, h, hourly_use, 0
    FROM hourly
    ON CONFLICT (section, date, COALESCE(hour, -1))
    DO UPDATE SET
      hourly_consumption = EXCLUDED.hourly_consumption,
      updated_at = now()
    RETURNING section, date
  ),
  affected AS (
    SELECT DISTINCT section, date FROM upsert
  )
  UPDATE public.consumption_data c
     SET daily_consumption = totals.t,
         updated_at = now()
    FROM (
      SELECT c2.section, c2.date, COALESCE(SUM(c2.hourly_consumption), 0) AS t
      FROM public.consumption_data c2
      JOIN affected a ON a.section = c2.section AND a.date = c2.date
      WHERE c2.hour IS NOT NULL
      GROUP BY c2.section, c2.date
    ) totals
   WHERE c.section = totals.section
     AND c.date    = totals.date
     AND c.hour IS NULL;

  -- Make sure the "daily" summary row exists for each affected (section, date)
  INSERT INTO public.consumption_data (section, date, hour, hourly_consumption, daily_consumption)
  SELECT a.section, a.date, NULL, 0,
         COALESCE((
           SELECT SUM(hourly_consumption) FROM public.consumption_data
           WHERE section = a.section AND date = a.date AND hour IS NOT NULL
         ), 0)
  FROM (
    SELECT DISTINCT sect AS section, hr::date AS date FROM (
      SELECT
        CASE
          WHEN tag_id = 'INT-Totalizer'  THEN 'intake'
          WHEN tag_id = 'WTP-Totalizer'  THEN 'wtp'
          WHEN tag_id = 'OHT1-Totalizer' THEN 'oht-1'
          WHEN tag_id = 'OHT2-Totalizer' THEN 'oht-2'
          WHEN tag_id = 'OHT3-Totalizer' THEN 'oht-3'
        END AS sect,
        date_trunc('hour', timestamp) AS hr
      FROM public.historian_logs
      WHERE timestamp >= _from AND timestamp < _to
        AND tag_id IN ('INT-Totalizer','WTP-Totalizer','OHT1-Totalizer','OHT2-Totalizer','OHT3-Totalizer')
    ) s WHERE sect IS NOT NULL
  ) a
  ON CONFLICT (section, date, COALESCE(hour, -1)) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_consumption_from_historian(timestamptz, timestamptz) TO authenticated, service_role;
