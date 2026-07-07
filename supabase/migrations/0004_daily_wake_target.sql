-- Stride: per-day wake-up time target
-- - daily_reviews.wake_target lets a single day override the account-level
--   default target (auth.users.raw_user_meta_data->>'wake_target').
-- - calculate_daily_score now prefers the per-day override, falling back to
--   the account default, then '07:00'.

alter table public.daily_reviews
  add column if not exists wake_target time;

create or replace function public.calculate_daily_score(
  p_user_id uuid,
  p_date date
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
  v_fulfillment int;
  v_wake_time time;
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

  select fulfillment, wake_time, wake_target
    into v_fulfillment, v_wake_time, v_wake_target
    from public.daily_reviews
   where user_id = p_user_id and date = p_date;

  v_fulfillment_score := coalesce(v_fulfillment, 0) * 1;

  if v_wake_target is null then
    select coalesce(
      nullif(raw_user_meta_data->>'wake_target', '')::time,
      '07:00'::time
    )
      into v_wake_target
      from auth.users
     where id = p_user_id;
  end if;

  if v_wake_time is null or v_wake_target is null then
    v_wake_score := 0;
  else
    v_late_min := greatest(0, extract(epoch from (v_wake_time - v_wake_target)) / 60.0);
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
