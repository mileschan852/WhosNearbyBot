-- Who's Nearby — 002: server-side age enforcement + nearby search (Haversine)
-- Idempotent: uses create or replace / drop-if-exists everywhere.

-- Age from ISO date-of-birth text. Returns null when unparseable.
create or replace function public.compute_age(dob text)
returns integer
language sql
immutable
as $$
  select case
    when dob ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then
      date_part('year', age(current_date, dob::date))::int
    else null
  end;
$$;

-- Enforce age server-side: is_underage is ALWAYS recomputed from dob on write,
-- so a client can never forge is_underage = false (or true) for themselves.
create or replace function public.enforce_age()
returns trigger
language plpgsql
as $$
declare
  age int;
begin
  if new.dob is not null and new.dob <> '' then
    begin
      age := public.compute_age(new.dob);
      if age is not null then
        new.is_underage := (age < 18);
      end if;
    exception when others then
      null; -- leave flag unchanged if dob is unparseable
    end;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_enforce_age on public.profiles;
create trigger profiles_enforce_age
  before insert or update on public.profiles
  for each row execute function public.enforce_age();

-- Nearby users within radius, sorted by Haversine distance.
-- Underage users (by dob OR flag) are never returned, even to admins.
create or replace function public.get_nearby_users(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters double precision,
  p_requesting_user_id text,
  p_is_admin boolean default false
)
returns table (
  id text,
  name text,
  username text,
  avatar text,
  lat double precision,
  lng double precision,
  last_seen timestamp with time zone,
  gender text,
  seeking text,
  dob text,
  height text,
  weight text,
  role_pref text,
  safety_pref text,
  playstyle_pref text,
  where_pref text,
  how_many_pref text,
  non_man_mode text,
  is_underage boolean,
  hide_age boolean,
  grid_visible boolean,
  map_visible boolean,
  distance double precision,
  hide_age_expiry timestamp with time zone,
  invisible_expiry timestamp with time zone
)
language plpgsql
stable
as $$
declare
  ref_lat double precision;
  ref_lng double precision;
begin
  -- Prefer the requesting user's stored location; fall back to the passed coordinates.
  select p.lat, p.lng into ref_lat, ref_lng
  from profiles p
  where p.id = p_requesting_user_id;

  if ref_lat is null or ref_lng is null then
    ref_lat := p_lat;
    ref_lng := p_lng;
  end if;

  return query
  select *
  from (
    select
      p.id,
      p.name,
      p.username,
      p.avatar,
      p.lat,
      p.lng,
      p.last_seen,
      p.gender,
      p.seeking,
      p.dob,
      p.height,
      p.weight,
      p.role_pref,
      p.safety_pref,
      p.playstyle_pref,
      p.where_pref,
      p.how_many_pref,
      p.non_man_mode,
      p.is_underage,
      p.hide_age,
      p.grid_visible,
      p.map_visible,
      (6371000 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(ref_lat)) * cos(radians(p.lat)) *
          cos(radians(p.lng) - radians(ref_lng)) +
          sin(radians(ref_lat)) * sin(radians(p.lat))
        ))
      ))::double precision as distance,
      p.hide_age_expiry,
      p.invisible_expiry
    from profiles p
    where
      -- age gate: never expose underage profiles
      (p.is_underage is null or p.is_underage = false)
      and (public.compute_age(p.dob) is null or public.compute_age(p.dob) >= 18)
      -- admins and self see everyone; others only see grid-visible profiles
      and (
        p_is_admin = true
        or p.id = p_requesting_user_id
        or p.grid_visible = true
      )
      and p.lat is not null
      and p.lng is not null
  ) nearby
  where nearby.distance <= p_radius_meters
  order by nearby.distance asc;
end;
$$;

notify pgrst, 'reload schema';
