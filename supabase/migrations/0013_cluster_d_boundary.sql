-- Stride: rank boundaries on the stored (rounded) total; exactly 30 is D (Issue #35)
-- - CLUSTER_META.D.min is 30, but calculate_daily_score (and clusterFromScore
--   in src/lib/score.ts) used `> 30`, so exactly 30 was E.
-- - The rank was also decided on the unrounded total while total_score is
--   stored as numeric(5,2), so a day stored as 30.00 could be E
--   (29.999…975). The same applied to the 50 / 70 / 85 boundaries.
-- - Replaces calculate_daily_score from 0006. Only two things change:
--   v_total is rounded (round(round(v_total, 9), 2)) before the rank is
--   decided, and the D condition is `>= 30`.
-- - Fixes stored daily_reviews whose cluster does not match the rank of their
--   stored total_score. Scores are not recomputed; only cluster changes.
--   trg_update_scores (BEFORE UPDATE) is disabled for that update, since it
--   would recompute every score (and days whose wake/bed target is NULL would
--   pick up the user's current default targets). Disable, update and enable
--   are in one DO block, so they are atomic even when run in autocommit mode.
-- - Idempotent: create or replace, and the update touches only rows whose
--   cluster is wrong.

create or replace function public.calculate_daily_score(
  p_user_id uuid,
  p_date date,
  p_fulfillment int,
  p_wake_time time,
  p_wake_target time,
  p_bed_time time,
  p_bed_target time
) returns table (
  completion_score numeric,
  fulfillment_score numeric,
  wake_score numeric,
  bed_score numeric,
  total_score numeric,
  cluster text
) as $$
declare
  v_completed_weight int;
  v_scheduled_weight int;
  v_wake_target time;
  v_bed_target time;
  v_wake_late_min numeric;
  v_bed_actual_min numeric;
  v_bed_target_min numeric;
  v_bed_late_min numeric;
  v_completion_score numeric;
  v_fulfillment_score numeric;
  v_wake_score numeric;
  v_bed_score numeric;
  v_total numeric;
  v_cluster text;
begin
  select coalesce(sum(
    case
      when importance = '重' then 3
      when importance = '中' then 2
      when importance = '軽' then 1
      else 0
    end
  ), 0)
    into v_completed_weight
    from public.tasks
   where user_id = p_user_id
     and scheduled_date = p_date
     and completed = true;

  select coalesce(sum(
    case
      when importance = '重' then 3
      when importance = '中' then 2
      when importance = '軽' then 1
      else 0
    end
  ), 0)
    into v_scheduled_weight
    from public.tasks
   where user_id = p_user_id
     and scheduled_date = p_date;

  if v_scheduled_weight = 0 then
    v_completion_score := 0;
  else
    v_completion_score := (v_completed_weight::numeric / v_scheduled_weight) * 80;
  end if;

  v_fulfillment_score := coalesce(p_fulfillment, 0) * 1;

  v_wake_target := p_wake_target;
  if v_wake_target is null then
    select coalesce(
      nullif(raw_user_meta_data->>'wake_target', '')::time,
      '07:00'::time
    )
      into v_wake_target
      from auth.users
     where id = p_user_id;
  end if;

  if p_wake_time is null or v_wake_target is null then
    v_wake_score := 0;
  else
    v_wake_late_min := greatest(0, extract(epoch from (p_wake_time - v_wake_target)) / 60.0);
    v_wake_score := 7.5 * greatest(0, 1 - v_wake_late_min / 150.0);
  end if;

  v_bed_target := p_bed_target;
  if v_bed_target is null then
    select coalesce(
      nullif(raw_user_meta_data->>'bed_target', '')::time,
      '23:00'::time
    )
      into v_bed_target
      from auth.users
     where id = p_user_id;
  end if;

  if p_bed_time is null or v_bed_target is null then
    v_bed_score := 0;
  else
    v_bed_actual_min := extract(hour from p_bed_time) * 60 + extract(minute from p_bed_time);
    if v_bed_actual_min < 720 then
      v_bed_actual_min := v_bed_actual_min + 1440;
    end if;
    v_bed_target_min := extract(hour from v_bed_target) * 60 + extract(minute from v_bed_target);
    if v_bed_target_min < 720 then
      v_bed_target_min := v_bed_target_min + 1440;
    end if;
    v_bed_late_min := greatest(0, v_bed_actual_min - v_bed_target_min);
    v_bed_score := 7.5 * greatest(0, 1 - v_bed_late_min / 150.0);
  end if;

  v_total := v_completion_score + v_fulfillment_score + v_wake_score + v_bed_score;
  -- Rank the value that is stored (total_score is numeric(5,2)). Cut numeric
  -- noise at 9 decimals first (e.g. 7.5 * (1 - 100/150.0) = 2.4999…975),
  -- then round to 2 like the column does. Same as roundTotalScore in
  -- src/lib/score.ts.
  v_total := round(round(v_total, 9), 2);

  if v_total >= 85 then v_cluster := 'A';
  elsif v_total >= 70 then v_cluster := 'B';
  elsif v_total >= 50 then v_cluster := 'C';
  elsif v_total >= 30 then v_cluster := 'D';
  else v_cluster := 'E';
  end if;

  return query select v_completion_score, v_fulfillment_score, v_wake_score, v_bed_score, v_total, v_cluster;
end;
$$ language plpgsql stable security definer;

do $$
declare
  v_fixed int;
begin
  alter table public.daily_reviews disable trigger trg_update_scores;

  update public.daily_reviews r
     set cluster = x.rank
    from (
      select id,
             case
               when total_score >= 85 then 'A'
               when total_score >= 70 then 'B'
               when total_score >= 50 then 'C'
               when total_score >= 30 then 'D'
               else 'E'
             end as rank
        from public.daily_reviews
       where total_score is not null
    ) x
   where r.id = x.id
     and r.cluster is distinct from x.rank;
  get diagnostics v_fixed = row_count;

  alter table public.daily_reviews enable trigger trg_update_scores;

  raise notice '0013: fixed cluster of % daily_reviews rows', v_fixed;
end $$;
