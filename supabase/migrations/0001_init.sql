-- Stride: initial schema + RLS + scoring function + trigger
-- Apply to a Supabase project (or any PostgreSQL 14+).

-- Tables ---------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  importance text not null check (importance in ('重', '中', '軽')),
  scheduled_date date,
  completed boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_date_idx
  on public.tasks (user_id, scheduled_date);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  fulfillment int check (fulfillment between 1 and 5),
  highlight text,
  tomorrow_intention text,
  memo text,
  completion_score numeric(5,2),
  fulfillment_score numeric(5,2),
  total_score numeric(5,2),
  cluster text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_reviews_user_date_idx
  on public.daily_reviews (user_id, date desc);

-- Scoring function -----------------------------------------------------

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
  else v_cluster := 'D';
  end if;

  return query select v_completion_score, v_fulfillment_score, v_total, v_cluster;
end;
$$ language plpgsql stable security definer;

-- Trigger: keep scores in sync on insert/update of daily_reviews

create or replace function public.update_daily_review_scores()
returns trigger as $$
declare
  scores record;
begin
  select * into scores
    from public.calculate_daily_score(new.user_id, new.date);

  new.completion_score := scores.completion_score;
  new.fulfillment_score := scores.fulfillment_score;
  new.total_score := scores.total_score;
  new.cluster := scores.cluster;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_scores on public.daily_reviews;
create trigger trg_update_scores
before insert or update on public.daily_reviews
for each row execute function public.update_daily_review_scores();

-- Also recompute review row when its tasks change ----------------------

create or replace function public.touch_daily_review_after_task_change()
returns trigger as $$
declare
  target_user uuid;
  target_date date;
begin
  if (tg_op = 'DELETE') then
    target_user := old.user_id;
    target_date := old.scheduled_date;
  else
    target_user := new.user_id;
    target_date := new.scheduled_date;
  end if;

  if target_date is null then
    return coalesce(new, old);
  end if;

  -- Bump updated_at on the matching review (if any) to retrigger scoring.
  update public.daily_reviews
     set updated_at = now()
   where user_id = target_user
     and date = target_date;

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_touch_review_on_task on public.tasks;
create trigger trg_touch_review_on_task
after insert or update or delete on public.tasks
for each row execute function public.touch_daily_review_after_task_change();

-- RLS ------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.daily_reviews enable row level security;

drop policy if exists "tasks_owner_all" on public.tasks;
create policy "tasks_owner_all"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "daily_reviews_owner_all" on public.daily_reviews;
create policy "daily_reviews_owner_all"
  on public.daily_reviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
