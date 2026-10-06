-- The browser must not be able to enumerate administrator or VIP usernames.
-- The Worker uses the service_role key for authenticated role reads and writes.
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_roles_read" ON public.app_roles;

REVOKE ALL PRIVILEGES ON TABLE public.app_roles FROM PUBLIC, anon, authenticated;

-- PostgreSQL tracks column-level grants separately from table-level grants.
-- Revoke those as well so older column grants cannot bypass the table revoke.
DO $$
DECLARE
  role_columns text;
BEGIN
  SELECT string_agg(format('%I', attname), ', ')
    INTO role_columns
  FROM pg_attribute
  WHERE attrelid = 'public.app_roles'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  IF role_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE public.app_roles FROM PUBLIC, anon, authenticated',
      role_columns
    );
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON TABLE public.app_roles TO service_role;
