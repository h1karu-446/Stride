-- Stride: timeline (start/end time) + Cluster E (Worst Day, <=30)

alter table public.tasks
  add column if not exists start_time time,
  add column if not exists end_time time;

create or replace function public.calculate_daily_score(
  p_user_id uuid,
  p_date date
) returns table (
  completion_score numeric,
  fulfillment_score numeric,
  total_score numeric,
  cluster text
) as $$
declare
  v_completed_weight int;
  v_scheduled_weight int;
  v_fulfillment int;
  v_completion_score numeric;
  v_fulfillment_score numeric;
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

  select fulfillment into v_fulfillment
    from public.daily_reviews
   where user_id = p_user_id and date = p_date;

  v_fulfillment_score := coalesce(v_fulfillment, 0) * 2;
  v_total := v_completion_score + v_fulfillment_score;

  if v_total >= 85 then v_cluster := 'A';
  elsif v_total >= 70 then v_cluster := 'B';
  elsif v_total >= 50 then v_cluster := 'C';
  elsif v_total > 30 then v_cluster := 'D';
  else v_cluster := 'E';
  end if;

  return query select v_completion_score, v_fulfillment_score, v_total, v_cluster;
end;
$$ language plpgsql stable security definer;
