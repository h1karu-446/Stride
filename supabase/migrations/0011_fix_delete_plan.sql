-- Stride: delete_plan fails when a kept task has both plan_id and routine_id
-- (Issue #28)
-- Deleting a plan runs two FK actions on tasks: plan_id "on delete set null"
-- and the cascade plans -> phases -> routines, whose routine_id "set null"
-- comes later. When the set-null UPDATE of plan_id hits a task row that was
-- created or updated in the same transaction, PostgreSQL re-checks the
-- unchanged routine_id FK too, and the routine is already gone:
-- tasks_routine_id_fkey is violated.
-- Fix: clear plan_id / routine_id of the kept tasks explicitly before the plan
-- is deleted. Which tasks are kept or removed does not change (BR-08).
-- Idempotent: create or replace.

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

  -- 1. Future unfinished tasks of the plan are removed. Deleting a routine
  --    task records a skip (tasks_record_routine_skip); those rows are
  --    removed with the routines in step 3.
  delete from public.tasks
   where plan_id = p_plan_id
     and scheduled_date > p_today
     and completed = false;

  -- 2. Every other task keeps its data but loses the link to the plan and to
  --    the plan's routines, before those rows are deleted.
  update public.tasks t
     set plan_id = case when t.plan_id = p_plan_id then null else t.plan_id end,
         routine_id = case
           when t.routine_id in (
             select r.id
               from public.routines r
               join public.phases ph on ph.id = r.phase_id
              where ph.plan_id = p_plan_id
           ) then null
           else t.routine_id
         end
   where t.plan_id = p_plan_id
      or t.routine_id in (
        select r.id
          from public.routines r
          join public.phases ph on ph.id = r.phase_id
         where ph.plan_id = p_plan_id
      );

  -- 3. Phases, routines, materials and routine skips go by cascade.
  delete from public.plans where id = p_plan_id;
end;
$$;
