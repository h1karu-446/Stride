-- Remember that a task was generated from a routine (menu), even after the
-- routine is gone. tasks.routine_id is "on delete set null", so deleting a
-- menu, a phase or a plan used to turn the menu's past tasks into plain plan
-- schedules (plan_id set, routine_id null): they showed up under 予定 locked
-- (past date, no delete) with 今日に移す.
--
-- - tasks.from_routine: true on every task generate_routine_tasks creates.
--   The screens tell routine tasks from schedules with it, not routine_id.
-- - Backfill: rows that still have routine_id, and rows that already lost it.
--   A lost one is recognised by planned_minutes: only generated tasks (and
--   copies, excluded here) carry a duration together with plan_id; schedules
--   added on the plan screen never do.
-- - tasks_set_from_routine (BEFORE INSERT / UPDATE): a row with routine_id
--   always gets from_routine = true, and a missing value (NULL, e.g. a
--   restore_deleted_task row saved before 0021) becomes false. The flag is
--   never cleared here, so deleting the routine keeps it.
-- - generate_routine_tasks: same as 0007, plus from_routine = true.

alter table public.tasks
  add column if not exists from_routine boolean not null default false;

update public.tasks
   set from_routine = true
 where not from_routine
   and (
     routine_id is not null
     or (
       plan_id is not null
       and planned_minutes is not null
       and carried_from is null
     )
   );

create or replace function public.tasks_set_from_routine()
returns trigger
language plpgsql
as $$
begin
  new.from_routine := coalesce(new.from_routine, false) or new.routine_id is not null;
  return new;
end;
$$;

drop trigger if exists trg_tasks_set_from_routine on public.tasks;
create trigger trg_tasks_set_from_routine
before insert or update on public.tasks
for each row execute function public.tasks_set_from_routine();

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
      plan_id, routine_id, from_routine, scheduled_date, completed
    )
    select r.user_id, r.title, r.importance, r.minutes, r.menu,
           p.id, r.id, true, p_date, false
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
