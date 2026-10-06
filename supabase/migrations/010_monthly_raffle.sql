-- Monthly Telegram Stars raffle. Additive and safe to re-run.
-- Tickets are scoped to a round; an unawarded prize or expired ticket never
-- carries into the next round.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vip_expiry timestamptz;

-- Older production instances also require these legacy transaction columns.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tg_id text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS base_amount integer,
  ADD COLUMN IF NOT EXISTS final_charged integer;

CREATE TABLE IF NOT EXISTS public.raffle_rounds (
  round_key text PRIMARY KEY CHECK (round_key ~ '^[0-9]{4}-[0-9]{2}$'),
  closes_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drawn')),
  tickets_sold bigint NOT NULL DEFAULT 0 CHECK (tickets_sold >= 0),
  drawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'open' AND drawn_at IS NULL)
    OR (status = 'drawn' AND drawn_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.raffle_ticket_intents (
  id uuid PRIMARY KEY,
  round_key text NOT NULL REFERENCES public.raffle_rounds(round_key),
  tg_id text NOT NULL CHECK (tg_id ~ '^[0-9]{1,20}$' AND tg_id::numeric > 0),
  username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{5,32}$'),
  audience_bot text NOT NULL CHECK (audience_bot IN ('botA', 'botB')),
  amount bigint NOT NULL CHECK (amount = 100),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'prechecked', 'paid', 'cancelled', 'expired', 'refund_pending', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  precheckout_at timestamptz,
  telegram_payment_charge_id text UNIQUE,
  provider_payment_charge_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS raffle_one_active_intent_per_user_round
  ON public.raffle_ticket_intents (round_key, tg_id)
  WHERE status IN ('pending', 'prechecked');
CREATE INDEX IF NOT EXISTS raffle_ticket_intents_expiry_idx
  ON public.raffle_ticket_intents (expires_at)
  WHERE status IN ('pending', 'prechecked');

CREATE TABLE IF NOT EXISTS public.raffle_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_key text NOT NULL REFERENCES public.raffle_rounds(round_key),
  intent_id uuid NOT NULL UNIQUE REFERENCES public.raffle_ticket_intents(id),
  tg_id text NOT NULL CHECK (tg_id ~ '^[0-9]{1,20}$' AND tg_id::numeric > 0),
  username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{5,32}$'),
  audience_bot text NOT NULL CHECK (audience_bot IN ('botA', 'botB')),
  telegram_payment_charge_id text NOT NULL UNIQUE,
  provider_payment_charge_id text,
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS raffle_tickets_round_user_idx
  ON public.raffle_tickets (round_key, tg_id);

CREATE TABLE IF NOT EXISTS public.raffle_awards (
  round_key text NOT NULL REFERENCES public.raffle_rounds(round_key),
  prize_position smallint NOT NULL CHECK (prize_position BETWEEN 1 AND 4),
  prize_key text NOT NULL CHECK (prize_key IN ('vip', 'filter', 'invisible', 'hide_age')),
  tg_id text NOT NULL CHECK (tg_id ~ '^[0-9]{1,20}$' AND tg_id::numeric > 0),
  username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{5,32}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_key, prize_key),
  UNIQUE (round_key, prize_position),
  UNIQUE (round_key, tg_id)
);

ALTER TABLE public.raffle_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_ticket_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_awards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.raffle_rounds, public.raffle_ticket_intents,
  public.raffle_tickets, public.raffle_awards FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.raffle_rounds, public.raffle_ticket_intents,
  public.raffle_tickets, public.raffle_awards TO service_role;

CREATE OR REPLACE FUNCTION public.raffle_current_schedule(
  p_at timestamptz DEFAULT clock_timestamp()
)
RETURNS TABLE(round_key text, closes_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  local_now timestamp without time zone;
  month_start timestamp without time zone;
  target_month timestamp without time zone;
BEGIN
  local_now := p_at AT TIME ZONE 'Asia/Hong_Kong';
  month_start := date_trunc('month', local_now);
  IF local_now::date = month_start::date AND local_now::time < time '20:00:00' THEN
    target_month := month_start;
  ELSE
    target_month := month_start + interval '1 month';
  END IF;

  RETURN QUERY
  SELECT
    to_char(target_month, 'YYYY-MM'),
    (target_month + interval '20 hours') AT TIME ZONE 'Asia/Hong_Kong';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_raffle_state(p_tg_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  schedule record;
  latest_round_key text;
  latest_drawn_at timestamptz;
  winner_list jsonb := '[]'::jsonb;
  total_tickets bigint := 0;
  user_tickets bigint := 0;
BEGIN
  IF p_tg_id IS NOT NULL AND (p_tg_id !~ '^[0-9]{1,20}$' OR p_tg_id::numeric <= 0) THEN
    RAISE EXCEPTION 'Invalid Telegram user ID';
  END IF;

  SELECT * INTO schedule FROM public.raffle_current_schedule(clock_timestamp());
  INSERT INTO public.raffle_rounds (round_key, closes_at)
  VALUES (schedule.round_key, schedule.closes_at)
  ON CONFLICT (round_key) DO NOTHING;

  SELECT count(*) INTO total_tickets
  FROM public.raffle_tickets
  WHERE round_key = schedule.round_key;

  IF p_tg_id IS NOT NULL THEN
    SELECT count(*) INTO user_tickets
    FROM public.raffle_tickets
    WHERE round_key = schedule.round_key AND tg_id = p_tg_id;
  END IF;

  SELECT round_key, drawn_at
  INTO latest_round_key, latest_drawn_at
  FROM public.raffle_rounds
  WHERE status = 'drawn'
  ORDER BY drawn_at DESC
  LIMIT 1;

  IF latest_round_key IS NOT NULL THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'prizeKey', a.prize_key,
          'username', a.username,
          'expiresAt', a.expires_at,
          'isYou', p_tg_id IS NOT NULL AND a.tg_id = p_tg_id
        )
        ORDER BY a.prize_position
      ),
      '[]'::jsonb
    )
    INTO winner_list
    FROM public.raffle_awards a
    WHERE a.round_key = latest_round_key;
  END IF;

  RETURN jsonb_build_object(
    'roundKey', schedule.round_key,
    'closesAt', schedule.closes_at,
    'serverNow', clock_timestamp(),
    'ticketCount', total_tickets,
    'userTicketCount', user_tickets,
    'latestDraw',
      CASE WHEN latest_round_key IS NULL THEN NULL
      ELSE jsonb_build_object(
        'roundKey', latest_round_key,
        'drawnAt', latest_drawn_at,
        'winners', winner_list
      )
      END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_raffle_ticket_intent(
  p_intent_id uuid,
  p_tg_id text,
  p_username text,
  p_bot text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  schedule record;
  current_round public.raffle_rounds%ROWTYPE;
  inserted_id uuid;
BEGIN
  IF p_intent_id IS NULL
     OR p_tg_id IS NULL OR p_tg_id !~ '^[0-9]{1,20}$' OR p_tg_id::numeric <= 0
     OR p_username IS NULL OR p_username !~ '^[A-Za-z0-9_]{5,32}$'
     OR p_bot IS NULL OR p_bot NOT IN ('botA', 'botB') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = 'tg_' || p_tg_id
      AND coalesce(is_underage, false) = false
      AND dob IS NOT NULL
      AND public.compute_age(dob) >= 18
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile');
  END IF;

  SELECT * INTO schedule FROM public.raffle_current_schedule(clock_timestamp());
  INSERT INTO public.raffle_rounds (round_key, closes_at)
  VALUES (schedule.round_key, schedule.closes_at)
  ON CONFLICT (round_key) DO NOTHING;

  SELECT * INTO current_round
  FROM public.raffle_rounds
  WHERE round_key = schedule.round_key
  FOR UPDATE;

  IF current_round.status <> 'open' OR current_round.closes_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed');
  END IF;

  UPDATE public.raffle_ticket_intents
  SET status = 'expired', updated_at = clock_timestamp()
  WHERE round_key = current_round.round_key
    AND (
      (status = 'pending' AND expires_at <= clock_timestamp())
      OR (status = 'prechecked' AND precheckout_at <= clock_timestamp() - interval '15 minutes')
    );

  INSERT INTO public.raffle_ticket_intents (
    id, round_key, tg_id, username, audience_bot, amount, expires_at
  )
  VALUES (
    p_intent_id, current_round.round_key, p_tg_id, lower(p_username), p_bot, 100,
    least(current_round.closes_at, clock_timestamp() + interval '15 minutes')
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pending_invoice');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'roundKey', current_round.round_key,
    'closesAt', current_round.closes_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_raffle_ticket_prechecked(
  p_intent_id uuid,
  p_tg_id text,
  p_username text,
  p_bot text,
  p_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  intent_round_key text;
  current_round public.raffle_rounds%ROWTYPE;
  current_intent public.raffle_ticket_intents%ROWTYPE;
BEGIN
  SELECT round_key INTO intent_round_key
  FROM public.raffle_ticket_intents
  WHERE id = p_intent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  SELECT * INTO current_round
  FROM public.raffle_rounds
  WHERE round_key = intent_round_key
  FOR UPDATE;
  SELECT * INTO current_intent
  FROM public.raffle_ticket_intents
  WHERE id = p_intent_id
  FOR UPDATE;

  IF current_intent.tg_id IS DISTINCT FROM p_tg_id
     OR current_intent.username IS DISTINCT FROM lower(p_username)
     OR current_intent.audience_bot IS DISTINCT FROM p_bot
     OR current_intent.amount IS DISTINCT FROM p_amount THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  IF current_intent.status = 'prechecked'
     AND current_intent.precheckout_at > clock_timestamp() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF current_intent.status <> 'pending'
     OR current_intent.expires_at <= clock_timestamp()
     OR current_round.status <> 'open'
     OR current_round.closes_at <= clock_timestamp() THEN
    IF current_intent.status = 'pending' THEN
      UPDATE public.raffle_ticket_intents
      SET status = 'expired', updated_at = clock_timestamp()
      WHERE id = p_intent_id;
    END IF;
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.raffle_ticket_intents
  SET status = 'prechecked',
      precheckout_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = p_intent_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_raffle_ticket_payment(
  p_intent_id uuid,
  p_tg_id text,
  p_bot text,
  p_amount bigint,
  p_currency text,
  p_telegram_payment_charge_id text,
  p_provider_payment_charge_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  intent_round_key text;
  current_round public.raffle_rounds%ROWTYPE;
  current_intent public.raffle_ticket_intents%ROWTYPE;
  receipt_id uuid;
  ticket_id uuid;
  paid_at timestamptz := clock_timestamp();
BEGIN
  SELECT round_key INTO intent_round_key
  FROM public.raffle_ticket_intents
  WHERE id = p_intent_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'refund', true, 'reason', 'intent_not_found');
  END IF;

  SELECT * INTO current_round
  FROM public.raffle_rounds
  WHERE round_key = intent_round_key
  FOR UPDATE;
  SELECT * INTO current_intent
  FROM public.raffle_ticket_intents
  WHERE id = p_intent_id
  FOR UPDATE;

  IF current_intent.status = 'paid'
     AND current_intent.telegram_payment_charge_id = p_telegram_payment_charge_id THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  IF current_intent.status = 'refunded'
     AND current_intent.telegram_payment_charge_id = p_telegram_payment_charge_id THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'refunded', true);
  END IF;
  IF current_intent.status = 'refund_pending'
     AND current_intent.telegram_payment_charge_id = p_telegram_payment_charge_id THEN
    RETURN jsonb_build_object('ok', false, 'refund', true, 'duplicate', true);
  END IF;

  IF current_intent.status <> 'prechecked'
     OR current_intent.tg_id IS DISTINCT FROM p_tg_id
     OR current_intent.audience_bot IS DISTINCT FROM p_bot
     OR current_intent.amount IS DISTINCT FROM p_amount
     OR p_amount IS DISTINCT FROM 100
     OR p_currency IS DISTINCT FROM 'XTR'
     OR p_telegram_payment_charge_id IS NULL
     OR btrim(p_telegram_payment_charge_id) = ''
     OR current_round.status <> 'open'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = 'tg_' || p_tg_id
         AND coalesce(is_underage, false) = false
         AND dob IS NOT NULL
         AND public.compute_age(dob) >= 18
     ) THEN
    IF p_telegram_payment_charge_id IS NOT NULL
       AND btrim(p_telegram_payment_charge_id) <> '' THEN
      UPDATE public.raffle_ticket_intents
      SET status = 'refund_pending',
          telegram_payment_charge_id = p_telegram_payment_charge_id,
          provider_payment_charge_id = nullif(p_provider_payment_charge_id, ''),
          updated_at = paid_at
      WHERE id = p_intent_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'refund', true, 'reason', 'not_eligible');
  END IF;

  INSERT INTO public.transactions (
    tg_id, item_type, base_amount, final_charged,
    user_id, type, amount, currency, provider_payment_charge_id,
    telegram_payment_charge_id, status, created_at
  )
  VALUES (
    p_tg_id, 'raffle_ticket', 100, 100,
    'tg_' || p_tg_id, 'raffle_ticket', 100, 'XTR',
    nullif(p_provider_payment_charge_id, ''),
    p_telegram_payment_charge_id, 'paid', paid_at
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO receipt_id;

  IF receipt_id IS NULL THEN
    UPDATE public.raffle_ticket_intents
    SET status = 'refund_pending',
        telegram_payment_charge_id = p_telegram_payment_charge_id,
        provider_payment_charge_id = nullif(p_provider_payment_charge_id, ''),
        updated_at = paid_at
    WHERE id = p_intent_id;
    RETURN jsonb_build_object('ok', false, 'refund', true, 'reason', 'duplicate_charge');
  END IF;

  INSERT INTO public.raffle_tickets (
    round_key, intent_id, tg_id, username, audience_bot,
    telegram_payment_charge_id, provider_payment_charge_id, paid_at
  )
  VALUES (
    current_intent.round_key, current_intent.id, current_intent.tg_id,
    current_intent.username, current_intent.audience_bot,
    p_telegram_payment_charge_id, nullif(p_provider_payment_charge_id, ''), paid_at
  )
  RETURNING id INTO ticket_id;

  UPDATE public.raffle_ticket_intents
  SET status = 'paid',
      telegram_payment_charge_id = p_telegram_payment_charge_id,
      provider_payment_charge_id = nullif(p_provider_payment_charge_id, ''),
      updated_at = paid_at
  WHERE id = p_intent_id;

  UPDATE public.raffle_rounds
  SET tickets_sold = tickets_sold + 1
  WHERE round_key = current_intent.round_key;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'ticketId', ticket_id,
    'roundKey', current_intent.round_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_raffle_ticket_refunded(
  p_intent_id uuid,
  p_telegram_payment_charge_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.raffle_ticket_intents
  SET status = 'refunded', updated_at = clock_timestamp()
  WHERE id = p_intent_id
    AND telegram_payment_charge_id = p_telegram_payment_charge_id
    AND status IN ('refund_pending', 'refunded');

  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_raffle_round(p_round_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_round public.raffle_rounds%ROWTYPE;
  ticket_total bigint;
  participant_total bigint;
  remaining_weight bigint;
  ticket_offset bigint;
  random_value numeric;
  random_bytes bytea;
  byte_index integer;
  prize_position integer;
  prize_total integer;
  prize_key text;
  winner_tg_id text;
  winner_username text;
  selected_tg_ids text[] := ARRAY[]::text[];
  current_expiry timestamptz;
  prize_expiry timestamptz;
  draw_time timestamptz := clock_timestamp();
  inserted_count integer := 0;
BEGIN
  SELECT * INTO current_round
  FROM public.raffle_rounds
  WHERE round_key = p_round_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'round_not_found');
  END IF;
  IF current_round.status = 'drawn' THEN
    RETURN jsonb_build_object('ok', true, 'drawn', false, 'duplicate', true);
  END IF;
  IF current_round.closes_at > draw_time THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_due');
  END IF;

  UPDATE public.raffle_ticket_intents
  SET status = 'expired', updated_at = draw_time
  WHERE round_key = p_round_key
    AND (
      (status = 'pending' AND expires_at <= draw_time)
      OR (status = 'prechecked' AND precheckout_at <= draw_time - interval '15 minutes')
    );

  IF EXISTS (
    SELECT 1 FROM public.raffle_ticket_intents
    WHERE round_key = p_round_key AND status IN ('pending', 'prechecked')
  ) THEN
    RETURN jsonb_build_object('ok', true, 'drawn', false, 'reason', 'pending_invoice');
  END IF;

  SELECT count(*), count(DISTINCT t.tg_id)
  INTO ticket_total, participant_total
  FROM public.raffle_tickets t
  JOIN public.profiles p ON p.id = 'tg_' || t.tg_id
  WHERE t.round_key = p_round_key
    AND coalesce(p.is_underage, false) = false
    AND p.dob IS NOT NULL
    AND public.compute_age(p.dob) >= 18;

  prize_total := CASE WHEN participant_total >= 4 THEN 4 WHEN participant_total > 0 THEN 1 ELSE 0 END;

  FOR prize_position IN 1..prize_total LOOP
    prize_key := CASE prize_position
      WHEN 1 THEN 'vip'
      WHEN 2 THEN 'filter'
      WHEN 3 THEN 'invisible'
      ELSE 'hide_age'
    END;

    SELECT coalesce(sum(candidate.ticket_weight), 0)
    INTO remaining_weight
    FROM (
      SELECT count(*)::bigint AS ticket_weight
      FROM public.raffle_tickets t
      JOIN public.profiles p ON p.id = 'tg_' || t.tg_id
      WHERE t.round_key = p_round_key
        AND coalesce(p.is_underage, false) = false
        AND p.dob IS NOT NULL
        AND public.compute_age(p.dob) >= 18
        AND NOT (t.tg_id = ANY(selected_tg_ids))
      GROUP BY t.tg_id
    ) candidate;

    IF remaining_weight <= 0 THEN
      EXIT;
    END IF;

    -- Build a cryptographically strong 128-bit draw value from PostgreSQL's
    -- UUID generator. The modulo bias is negligible for realistic ticket pools.
    random_bytes := uuid_send(gen_random_uuid());
    random_value := 0;
    FOR byte_index IN 0..15 LOOP
      random_value := random_value * 256 + get_byte(random_bytes, byte_index);
    END LOOP;
    ticket_offset := mod(random_value, remaining_weight)::bigint;

    WITH candidate_weights AS (
      SELECT
        t.tg_id,
        (array_agg(t.username ORDER BY t.paid_at DESC, t.id DESC))[1] AS username,
        count(*)::bigint AS ticket_weight
      FROM public.raffle_tickets t
      JOIN public.profiles p ON p.id = 'tg_' || t.tg_id
      WHERE t.round_key = p_round_key
        AND coalesce(p.is_underage, false) = false
        AND p.dob IS NOT NULL
        AND public.compute_age(p.dob) >= 18
        AND NOT (t.tg_id = ANY(selected_tg_ids))
      GROUP BY t.tg_id
    ),
    weighted_candidates AS (
      SELECT
        tg_id,
        username,
        sum(ticket_weight) OVER (ORDER BY tg_id) AS cumulative_weight
      FROM candidate_weights
    )
    SELECT tg_id, username
    INTO winner_tg_id, winner_username
    FROM weighted_candidates
    WHERE cumulative_weight > ticket_offset
    ORDER BY cumulative_weight
    LIMIT 1;

    IF winner_tg_id IS NULL THEN
      EXIT;
    END IF;

    IF prize_key = 'vip' THEN
      SELECT vip_expiry INTO current_expiry
      FROM public.profiles WHERE id = 'tg_' || winner_tg_id FOR UPDATE;
      prize_expiry := greatest(coalesce(current_expiry, draw_time), draw_time) + interval '1 month';
      UPDATE public.profiles
      SET vip_expiry = prize_expiry, updated_at = draw_time
      WHERE id = 'tg_' || winner_tg_id;
    ELSIF prize_key = 'filter' THEN
      SELECT filter_sub_expiry INTO current_expiry
      FROM public.profiles WHERE id = 'tg_' || winner_tg_id FOR UPDATE;
      prize_expiry := greatest(coalesce(current_expiry, draw_time), draw_time) + interval '1 month';
      UPDATE public.profiles
      SET filter_sub_expiry = prize_expiry, updated_at = draw_time
      WHERE id = 'tg_' || winner_tg_id;
    ELSIF prize_key = 'invisible' THEN
      SELECT invisible_expiry INTO current_expiry
      FROM public.profiles WHERE id = 'tg_' || winner_tg_id FOR UPDATE;
      prize_expiry := greatest(coalesce(current_expiry, draw_time), draw_time) + interval '1 month';
      UPDATE public.profiles
      SET grid_visible = false, invisible_expiry = prize_expiry, updated_at = draw_time
      WHERE id = 'tg_' || winner_tg_id;
    ELSE
      SELECT hide_age_expiry INTO current_expiry
      FROM public.profiles WHERE id = 'tg_' || winner_tg_id FOR UPDATE;
      prize_expiry := greatest(coalesce(current_expiry, draw_time), draw_time) + interval '1 month';
      UPDATE public.profiles
      SET hide_age = true, hide_age_expiry = prize_expiry, updated_at = draw_time
      WHERE id = 'tg_' || winner_tg_id;
    END IF;

    INSERT INTO public.raffle_awards (
      round_key, prize_position, prize_key, tg_id, username, expires_at, created_at
    )
    VALUES (
      p_round_key, prize_position, prize_key, winner_tg_id,
      winner_username, prize_expiry, draw_time
    );
    selected_tg_ids := array_append(selected_tg_ids, winner_tg_id);
    inserted_count := inserted_count + 1;
  END LOOP;

  UPDATE public.raffle_rounds
  SET status = 'drawn',
      tickets_sold = ticket_total,
      drawn_at = draw_time
  WHERE round_key = p_round_key;

  RETURN jsonb_build_object(
    'ok', true,
    'drawn', true,
    'roundKey', p_round_key,
    'ticketsSold', ticket_total,
    'distinctWinners', inserted_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_due_raffle_rounds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  due_round record;
  draw_result jsonb;
  drawn_count integer := 0;
BEGIN
  FOR due_round IN
    SELECT round_key
    FROM public.raffle_rounds
    WHERE status = 'open' AND closes_at <= clock_timestamp()
    ORDER BY closes_at
    FOR UPDATE
  LOOP
    draw_result := public.draw_raffle_round(due_round.round_key);
    IF coalesce((draw_result ->> 'drawn')::boolean, false) THEN
      drawn_count := drawn_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('drawnRounds', drawn_count);
END;
$$;

REVOKE ALL ON FUNCTION public.raffle_current_schedule(timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_raffle_state(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_raffle_ticket_intent(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_raffle_ticket_prechecked(uuid, text, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_raffle_ticket_payment(uuid, text, text, bigint, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_raffle_ticket_refunded(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.draw_raffle_round(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.draw_due_raffle_rounds()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.raffle_current_schedule(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_raffle_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_raffle_ticket_intent(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_raffle_ticket_prechecked(uuid, text, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_raffle_ticket_payment(uuid, text, text, bigint, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_raffle_ticket_refunded(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.draw_raffle_round(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.draw_due_raffle_rounds() TO service_role;

NOTIFY pgrst, 'reload schema';
