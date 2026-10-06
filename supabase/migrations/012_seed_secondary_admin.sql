-- Move the legacy secondary admin from the source-code allowlist into the
-- persistent Supabase role list. The primary owner remains immutable in code.
INSERT INTO public.app_roles (username, role)
VALUES ('hkmembersonly', 'admin')
ON CONFLICT (username) DO UPDATE
SET role = EXCLUDED.role;
