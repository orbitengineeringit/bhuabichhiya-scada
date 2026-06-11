DO $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gis_cron_secret') INTO v_exists;
  IF NOT v_exists THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'gis_cron_secret', 'Internal key for gis-sync pg_cron job');
  END IF;
END $$;