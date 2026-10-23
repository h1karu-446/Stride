-- Stride: 未来の日のメニューをボタンで出す (Issue #84)
-- - generate_routine_tasks(p_date): same as 0023, but p_date may be up to the
--   DB date + 8 (was + 1). The screen offers the button for tomorrow .. the
--   device's today + 7; in Japan between 0 and 9 o'clock the DB current_date
--   (UTC) is the previous day, so the device's + 7 is the DB's + 8.
--   The lower bound (DB date - 1) is unchanged, so past dates still never
--   generate. Today's automatic generation is unchanged (the screen calls it
--   only for today).
-- - Generating early uses the same rules: the partial unique index
--   tasks (routine_id, scheduled_date) with on conflict do nothing prevents a
--   second task on the day itself, and deleting an early task records a
--   routine_skips row (tasks_record_routine_skip), so that day does not
--   generate it again.
-- - Idempotent: create or replace keeps the existing grants.

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
     or p_date > current_date + 8 then
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
         or (p_date between ph.start_date and ph.end_date
             and (ph.completed_at is null or p_date <= ph.completed_at))
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
