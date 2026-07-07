-- Stride: fix stale scores in the daily_reviews scoring trigger
-- - calculate_daily_score used to re-SELECT fulfillment/wake_time/wake_target
--   from daily_reviews for the row it was about to write. Since the trigger
--   runs BEFORE INSERT/UPDATE, that SELECT saw the row's *previous* state
--   (or nothing, on INSERT), so every save computed scores one write behind.
-- - Fix: pass fulfillment/wake_time/wake_target in directly from the
--   trigger's NEW record instead of re-reading the table.

drop function if exists public.calculate_daily_score(uuid, date);

create or replace function public.calculate_daily_score(
  p_user_id uuid,
  p_date date,
  p_fulfillment int,
  p_wake_time time,
  p_wake_target time
) returns table (
  completion_score numeric,
  fulfillment_score numeric,
  wake_score numeric,
  total_score numeric,
  cluster text
) as $$
declare
  v_completed_weight int;
  v_scheduled_weight int;
  v_wake_target time;
  v_late_min numeric;
  v_completion_score numeric;
  v_fulfillment_score numeric;
  v_wake_score numeric;
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
    v_completion_score := (v_completed_weight::numeric / v_scheduled_weight) * 90;
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
    v_late_min := greatest(0, extract(epoch from (p_wake_time - v_wake_target)) / 60.0);
    v_wake_score := 5 * greatest(0, 1 - v_late_min / 150.0);
  end if;

  v_total := v_completion_score + v_fulfillment_score + v_wake_score;

  if v_total >= 85 then v_cluster := 'A';
  elsif v_total >= 70 then v_cluster := 'B';
  elsif v_total >= 50 then v_cluster := 'C';
  elsif v_total > 30 then v_cluster := 'D';
  else v_cluster := 'E';
  end if;

  return query select v_completion_score, v_fulfillment_score, v_wake_score, v_total, v_cluster;
end;
$$ language plpgsql stable security definer;

create or replace function public.update_daily_review_scores()
returns trigger as $$
declare
  scores record;
begin
  select * into scores
    from public.calculate_daily_score(
      new.user_id,
      new.date,
      new.fulfillment,
      new.wake_time,
      new.wake_target
    );

  new.completion_score := scores.completion_score;
  new.fulfillment_score := scores.fulfillment_score;
  new.wake_score := scores.wake_score;
  new.total_score := scores.total_score;
  new.cluster := scores.cluster;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;
