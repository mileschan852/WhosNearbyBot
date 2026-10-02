-- Who's Nearby — 008: private profile access and idempotent payment fulfillment.
-- Apply after migrations 001–007. Safe to re-run.

-- The Worker is the only supported path for profile, payment, and nearby access.
-- Remove every existing policy on these tables, including service-role policies:
-- the Supabase service_role bypasses RLS and retains table privileges.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'transactions', 'purchases')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.purchases enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.transactions from anon, authenticated;
revoke all privileges on table public.purchases from anon, authenticated;
grant all privileges on table public.profiles to service_role;
grant all privileges on table public.transactions to service_role;
grant all privileges on table public.purchases to service_role;

-- A nearby request can only run with the Worker service-role credential. The
-- Worker derives both the caller ID and admin flag from verified Telegram data.
revoke all privileges on function public.get_nearby_users(
  double precision, double precision, double precision, text, boolean
) from public, anon, authenticated;
grant execute on function public.get_nearby_users(
  double precision, double precision, double precision, text, boolean
) to service_role;

-- Make payment fulfillment atomic and idempotent. A transaction receipt and
-- its entitlement are committed together; duplicate Telegram charge IDs never
-- extend or re-grant the entitlement.
create or replace function public.apply_payment(
  p_tg_id text,
  p_type text,
  p_amount bigint,
  p_currency text,
  p_telegram_payment_charge_id text,
  p_provider_payment_charge_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  expected_amount bigint;
  profile_id text;
  receipt_id uuid;
  current_expiry timestamptz;
  entitlement_expiry timestamptz;
  paid_at timestamptz := now();
begin
  if p_tg_id is null or p_tg_id !~ '^[0-9]{1,20}$' or p_tg_id::numeric <= 0 then
    raise exception 'Invalid Telegram user ID';
  end if;
  if p_currency is distinct from 'XTR' then
    raise exception 'Unsupported payment currency';
  end if;
  if p_telegram_payment_charge_id is null or btrim(p_telegram_payment_charge_id) = '' then
    raise exception 'Missing Telegram payment charge ID';
  end if;

  expected_amount := case p_type
    when 'hide_age' then 1000
    when 'invisible' then 3000
    when 'edit_profile' then 1000
    when 'change_preference' then 1000
    when 'change_filter' then 1000
    else null
  end;
  if expected_amount is null or p_amount is distinct from expected_amount then
    raise exception 'Invalid payment type or amount';
  end if;

  profile_id := 'tg_' || p_tg_id;
  perform 1
  from public.profiles
  where id = profile_id
    and coalesce(is_underage, false) = false
    and (dob is null or public.compute_age(dob) >= 18)
  for update;
  if not found then
    raise exception 'Profile not found or not eligible';
  end if;

  insert into public.transactions (
    user_id,
    type,
    amount,
    currency,
    provider_payment_charge_id,
    telegram_payment_charge_id,
    status,
    created_at
  )
  values (
    profile_id,
    p_type,
    p_amount,
    p_currency,
    nullif(p_provider_payment_charge_id, ''),
    p_telegram_payment_charge_id,
    'paid',
    paid_at
  )
  on conflict do nothing
  returning id into receipt_id;

  if receipt_id is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_type = 'hide_age' then
    select hide_age_expiry into current_expiry
    from public.profiles where id = profile_id;
    entitlement_expiry := greatest(coalesce(current_expiry, paid_at), paid_at) + interval '30 days';
    update public.profiles
    set hide_age = true, hide_age_expiry = entitlement_expiry, updated_at = paid_at
    where id = profile_id;
  elsif p_type = 'invisible' then
    select invisible_expiry into current_expiry
    from public.profiles where id = profile_id;
    entitlement_expiry := greatest(coalesce(current_expiry, paid_at), paid_at) + interval '30 days';
    update public.profiles
    set grid_visible = false, invisible_expiry = entitlement_expiry, updated_at = paid_at
    where id = profile_id;
  elsif p_type in ('edit_profile', 'change_preference') then
    select edit_profile_expiry into current_expiry
    from public.profiles where id = profile_id;
    entitlement_expiry := greatest(coalesce(current_expiry, paid_at), paid_at) + interval '30 days';
    update public.profiles
    set edit_profile_pass = true, edit_profile_expiry = entitlement_expiry, updated_at = paid_at
    where id = profile_id;
  elsif p_type = 'change_filter' then
    select filter_sub_expiry into current_expiry
    from public.profiles where id = profile_id;
    entitlement_expiry := greatest(coalesce(current_expiry, paid_at), paid_at) + interval '30 days';
    update public.profiles
    set filter_sub_expiry = entitlement_expiry, updated_at = paid_at
    where id = profile_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'type', p_type,
    'expires_at', entitlement_expiry
  );
end;
$$;

revoke all privileges on function public.apply_payment(
  text, text, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.apply_payment(
  text, text, bigint, text, text, text
) to service_role;

notify pgrst, 'reload schema';