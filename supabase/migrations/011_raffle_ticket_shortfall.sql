-- The full prize draw requires at least four sold tickets and four distinct
-- eligible users. With a shortfall, only one VIP winner is selected. A round
-- with no eligible tickets awards nothing and does not carry prizes forward.
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

  prize_total := CASE
    WHEN ticket_total >= 4 AND participant_total >= 4 THEN 4
    WHEN participant_total > 0 THEN 1
    ELSE 0
  END;

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

REVOKE ALL ON FUNCTION public.draw_raffle_round(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.draw_raffle_round(text) TO service_role;
