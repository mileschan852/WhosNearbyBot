-- 003_private_notes_and_filter_sub.sql
-- Adds private_notes column (admin-only private notes on profiles)
-- and filter_sub_expiry (server-side filter subscription expiry).

alter table public.profiles add column if not exists private_notes text not null default '';
alter table public.profiles add column if not exists filter_sub_expiry timestamp with time zone;

-- Ensure webhook/service writes to these columns are allowed by RLS policies
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_service_all'
  ) then
    create policy profiles_service_all on public.profiles
      for all using (true) with check (true);
  end if;
end $$;
