
REVOKE EXECUTE ON FUNCTION public.refresh_consumption_from_historian(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_consumption_from_historian(timestamptz, timestamptz) TO service_role;
