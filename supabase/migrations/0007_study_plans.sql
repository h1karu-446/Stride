-- Stride: study plans, phases and routines (release 2)
-- Design: docs/design/study-plans.md (4章), ADR-0002 / 0003 / 0004
-- - plans / phases / routines / routine_skips
-- - tasks: plan_id / routine_id / planned_minutes + one routine task per day
-- - triggers: updated_at, completed_at, implicit phase, routine skip record
-- - RPC: generate_routine_tasks, delete_phase, delete_plan
-- This migration only adds objects. calculate_daily_score is not touched.

create extension if not exists btree_gist;

-- Helper trigger functions ---------------------------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- Tables ---------------------------------------------------------------

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null check (
    color in ('pink', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'gray')
  ),
  status text not null default 'active'
    check (status in ('idea', 'active', 'paused', 'done')),
  due_date date,
  goal text check (goal is null or char_length(goal) <= 60),
  goal_note text check (goal_note is null or char_length(goal_note) <= 1000),
  completed_at date,
  overdue_notice_dismissed_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  name text check (name is null or char_length(btrim(name)) between 1 and 30),
  start_date date,
  end_date date,
  is_implicit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phases_implicit_shape check (
    (is_implicit
      and name is null and start_date is null and end_date is null)
    or
    (not is_implicit
      and name is not null and start_date is not null and end_date is not null
      and start_date <= end_date)
  ),
  -- Periods of explicit phases in one plan must not overlap.
  constraint phases_no_overlap exclude using gist (
    plan_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (not is_implicit)
);

-- At most one implicit phase per plan.
create unique index if not exists phases_one_implicit_per_plan
  on public.phases (plan_id) where is_implicit;

create index if not exists phases_plan_idx on public.phases (plan_id);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase_id uuid not null references public.phases(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 40),
  minutes integer not null default 30
    check (minutes between 5 and 600 and minutes % 5 = 0),
  weekdays smallint[] not null default '{1,2,3,4,5,6,7}'
    check (
      cardinality(weekdays) >= 1
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  importance text not null default '中' check (importance in ('重', '中', '軽')),
  menu text check (menu is null or char_length(menu) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routines_phase_idx on public.routines (phase_id);

-- Rows are written only by the tasks_record_routine_skip trigger (ADR-0003).
create table if not exists public.routine_skips (
  routine_id uuid not null references public.routines(id) on delete cascade,
  date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (routine_id, date)
);

-- tasks: link to plans / routines ---------------------------------------

alter table public.tasks
  add column if not exists plan_id uuid references public.plans(id) on delete set null,
  add column if not exists routine_id uuid references public.routines(id) on delete set null,
  add column if not exists planned_minutes integer;

-- One task per routine per day (NFR-04).
create unique index if not exists tasks_routine_date_uniq
  on public.tasks (routine_id, scheduled_date) where routine_id is not null;

create index if not exists tasks_plan_idx
  on public.tasks (plan_id) where plan_id is not null;

-- Grants ---------------------------------------------------------------
-- Newer Supabase stacks no longer grant API roles on new tables by default,
-- so grant explicitly. RLS below still restricts every row to its owner.

grant select, insert, update, delete on
  public.plans, public.phases, public.routines, public.routine_skips
  to authenticated;

-- RLS ------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.phases enable row level security;
alter table public.routines enable row level security;
alter table public.routine_skips enable row level security;

drop policy if exists "plans_owner_all" on public.plans;
create policy "plans_owner_all" on public.plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Child tables also require that the parent row belongs to the caller, so a
-- user cannot attach rows to someone else's plan by guessing its id.
drop policy if exists "phases_owner_all" on public.phases;
create policy "phases_owner_all" on public.phases for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.plans p
       where p.id = plan_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "routines_owner_all" on public.routines;
create policy "routines_owner_all" on public.routines for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.phases ph
       where ph.id = phase_id and ph.user_id = auth.uid()
    )
  );

drop policy if exists "routine_skips_owner_all" on public.routine_skips;
create policy "routine_skips_owner_all" on public.routine_skips for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.routines r
       where r.id = routine_id and r.user_id = auth.uid()
    )
  );

-- Triggers -------------------------------------------------------------

drop trigger if exists set_updated_at on public.plans;
create trigger set_updated_at before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.phases;
create trigger set_updated_at before update on public.phases
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.routines;
create trigger set_updated_at before update on public.routines
for each row execute function public.set_updated_at();

-- completed_at follows status. The client sends its local date; current_date
-- (UTC) is only a fallback when none was sent.
create or replace function public.plans_set_completed_at()
returns trigger as $$
begin
  if new.status <> 'done' then
    new.completed_at := null;
  elsif new.completed_at is null then
    new.completed_at := current_date;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists plans_set_completed_at on public.plans;
create trigger plans_set_completed_at
before insert or update on public.plans
for each row execute function public.plans_set_completed_at();

-- Every plan starts with one implicit phase (ADR-0004).
create or replace function public.plans_create_implicit_phase()
returns trigger as $$
begin
  insert into public.phases (user_id, plan_id, is_implicit)
  values (new.user_id, new.id, true);
  return new;
end;
$$ language plpgsql;

drop trigger if exists plans_create_implicit_phase on public.plans;
create trigger plans_create_implicit_phase
after insert on public.plans
for each row execute function public.plans_create_implicit_phase();

-- Side effect (ADR-0003): deleting a routine task records a skip so that
-- generate_routine_tasks does not create it again. The exists() guard keeps
-- cascaded deletes (routine or account removal) from violating the FK.
create or replace function public.tasks_record_routine_skip()
returns trigger as $$
begin
  if old.routine_id is not null and old.scheduled_date is not null then
    insert into public.routine_skips (routine_id, date, user_id)
    select old.routine_id, old.scheduled_date, old.user_id
     where exists (select 1 from public.routines r where r.id = old.routine_id)
    on conflict (routine_id, date) do nothing;
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists tasks_record_routine_skip on public.tasks;
create trigger tasks_record_routine_skip
after delete on public.tasks
for each row execute function public.tasks_record_routine_skip();

-- RPC ------------------------------------------------------------------

-- Creates today's routine tasks and returns how many were created (BR-02).
-- p_date is sent by the client; it must be within +-1 day of the DB date so
-- timezone differences are tolerated but past days are never rewritten.
create or replace function public.generate_routine_tasks(p_date date)
returns integer
language plpgsql
security invoker
as $$
declare
  v_count integer;
begin
  if p_date is null
     or p_date < current_date - 1
     or p_date > current_date + 1 then
    raise exception 'p_date % is out of the allowed range', p_date
      using errcode = '22023';
  end if;

  with inserted as (
    insert into public.tasks (
      user_id, title, importance, planned_minutes, memo,
      plan_id, routine_id, scheduled_date, completed
    )
    select r.user_id, r.title, r.importance, r.minutes, r.menu,
           p.id, r.id, p_date, false
      from public.routines r
      join public.phases ph on ph.id = r.phase_id
      join public.plans p on p.id = ph.plan_id
     where p.status = 'active'
       and (
         ph.is_implicit
         or p_date between ph.start_date and ph.end_date
       )
       and extract(isodow from p_date)::smallint = any (r.weekdays)
       and not exists (
         select 1 from public.routine_skips s
          where s.routine_id = r.id and s.date = p_date
       )
    on conflict (routine_id, scheduled_date) where routine_id is not null
    do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  return v_count;
end;
$$;

-- Deletes a phase. The last remaining phase reverts to the implicit phase
-- (BR-03) instead of being removed. Routines under it are deleted either way;
-- tasks already generated stay (tasks.routine_id becomes null).
create or replace function public.delete_phase(p_phase_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_plan_id uuid;
  v_implicit boolean;
  v_others integer;
begin
  select plan_id, is_implicit into v_plan_id, v_implicit
    from public.phases where id = p_phase_id;

  if not found then
    raise exception 'phase % not found', p_phase_id using errcode = 'P0002';
  end if;
  if v_implicit then
    raise exception 'the implicit phase cannot be deleted' using errcode = '22023';
  end if;

  select count(*) into v_others
    from public.phases
   where plan_id = v_plan_id and id <> p_phase_id and not is_implicit;

  if v_others > 0 then
    delete from public.phases where id = p_phase_id;
  else
    delete from public.routines where phase_id = p_phase_id;
    update public.phases
       set is_implicit = true, name = null, start_date = null, end_date = null
     where id = p_phase_id;
  end if;
end;
$$;

-- Deletes a plan (BR-08): future unfinished tasks of the plan are removed,
-- everything else is kept with plan_id / routine_id cleared.
create or replace function public.delete_plan(p_plan_id uuid, p_today date)
returns void
language plpgsql
security invoker
as $$
begin
  if p_today is null
     or p_today < current_date - 1
     or p_today > current_date + 1 then
    raise exception 'p_today % is out of the allowed range', p_today
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'plan % not found', p_plan_id using errcode = 'P0002';
  end if;

  delete from public.tasks
   where plan_id = p_plan_id
     and scheduled_date > p_today
     and completed = false;

  delete from public.plans where id = p_plan_id;
end;
$$;
