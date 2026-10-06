-- The browser must not be able to enumerate administrator or VIP usernames.
-- The Worker uses the service_role key for authenticated role reads and writes.
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_roles_read" ON public.app_roles;

REVOKE ALL PRIVILEGES ON TABLE public.app_roles FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.app_roles TO service_role;
