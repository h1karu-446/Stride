-- Stride: フェーズの早期完了 (Issue #50)
-- - phases.completed_at: the day the phase was actually finished (date, the
--   client sends its local date). The planned start / end dates are kept.
--   NULL = not completed. Only explicit phases can be completed, and only
--   within their planned period (so the period cannot be moved past it).
-- - set_phase_completion(p_phase_id, p_date): completes (p_date) or undoes
--   (NULL) the completion. p_date must be within the phase's planned period
--   and no later than the DB date + 1 (time zones), like generate_routine_tasks.
--   security invoker, so phases_owner_all (RLS) decides whose phase it is.
-- - generate_routine_tasks: same as 0021, plus a completed phase creates no
--   task after its completion day. Tasks already created (including the
--   completion day) and past scores are not changed.
-- - delete_phase: same as 0007, plus completed_at is cleared when the last
--   phase falls back to the implicit phase (the implicit phase has no dates).
-- - The next phase's dates are never moved automatically; the screen offers
--   to start it early and the user saves the dates.
-- - Idempotent: add column if not exists, constraints dropped and re-added,
--   functions created or replaced.

alter table public.phases
  add column if not exists completed_at date;

alter table public.phases
  drop constraint if exists phases_completed_at_shape;
alter table public.phases
  add constraint phases_completed_at_shape check (
    completed_at is null
    or (not is_implicit and completed_at between start_date and end_date)
  );

create or replace function public.set_phase_completion(p_phase_id uuid, p_date date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phase public.phases%rowtype;
begin
  select * into v_phase from public.phases
   where id = p_phase_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'phase % not found', p_phase_id using errcode = 'P0002';
  end if;
  if v_phase.is_implicit then
    raise exception 'the implicit phase cannot be completed' using errcode = '22023';
  end if;
  if p_date is not null and (
       p_date < v_phase.start_date
       or p_date > v_phase.end_date
       or p_date > current_date + 1
     ) then
    raise exception 'p_date % is out of the allowed range', p_date
      using errcode = '22023';
  end if;

  update public.phases set completed_at = p_date where id = p_phase_id;
end;
$$;

revoke all on function public.set_phase_completion(uuid, date) from public;
grant execute on function public.set_phase_completion(uuid, date) to authenticated;

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
       set is_implicit = true, name = null, start_date = null, end_date = null,
           completed_at = null
     where id = p_phase_id;
  end if;
end;
$$;
