-- Verifies migration 0023 (Issue #50). Everything is rolled back.
-- The file runs 0023 itself (twice, via \ir) inside its transaction, so it
-- works whether or not 0023 has already been applied.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0023_phase_completion.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0023_phase_completion.sql and pipe the
-- result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
insert into auth.users (id, email) values
 ('a2300000-0000-0000-0000-000000000001', 'stride-test-0023-a@example.invalid'),
 ('a2300000-0000-0000-0000-000000000002', 'stride-test-0023-b@example.invalid');
-- A phase that exists before 0023 (when 0023 is not applied yet).
insert into public.plans (id, user_id, name, color, status) values
 ('a2300000-0000-0000-0000-000000000011', 'a2300000-0000-0000-0000-000000000001', 'A plan', 'blue', 'active');

\ir ../migrations/0023_phase_completion.sql
\ir ../migrations/0023_phase_completion.sql

do $$ begin
  if (select count(*) from pg_constraint
       where conrelid = 'public.phases'::regclass and conname = 'phases_completed_at_shape') <> 1 then
    raise exception 'phases_completed_at_shape must exist exactly once';
  end if;
  if exists (select 1 from public.phases where completed_at is not null) then
    raise exception 'existing phases must stay not completed';
  end if;
  if has_function_privilege('anon', 'public.set_phase_completion(uuid, date)', 'execute') then
    raise exception 'anon can execute set_phase_completion';
  end if;
end $$;

set local role authenticated;

-- User A ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000001', true);
do $$
declare
  p uuid := 'a2300000-0000-0000-0000-000000000011';
  implicit_id uuid;
  a uuid;
  b uuid;
  menu jsonb := jsonb_build_array(jsonb_build_object(
    'title', 'Menu A', 'minutes', 30, 'weekdays', jsonb_build_array(1,2,3,4,5,6,7),
    'importance', '中', 'menu', null));
begin
  select id into implicit_id from public.phases where plan_id = p and is_implicit;
  begin
    perform public.set_phase_completion(implicit_id, current_date);
    raise exception 'implicit phase completed';
  exception when invalid_parameter_value then null; end;

  -- Phase A runs yesterday .. +5, phase B overlaps from today.
  a := public.save_phase_settings(p, null, 'Phase A', current_date - 1, current_date + 5, menu);
  b := public.save_phase_settings(p, null, 'Phase B', current_date, current_date + 10,
         jsonb_set(menu, '{0,title}', '"Menu B"'));

  -- Out of range: before the start, after the planned end, in the future.
  begin
    perform public.set_phase_completion(a, current_date - 2);
    raise exception 'completed before the start';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_phase_completion(b, current_date + 2);
    raise exception 'completed in the future';
  exception when invalid_parameter_value then null; end;

  -- Generated before completing: today's task of A exists.
  if public.generate_routine_tasks(current_date) <> 2 then
    raise exception 'both phases must generate today';
  end if;

  -- Complete A yesterday: the planned dates stay, today and later generate nothing new,
  -- and today's task that already exists is kept.
  perform public.set_phase_completion(a, current_date - 1);
  if (select (completed_at, start_date, end_date) from public.phases where id = a)
     is distinct from (current_date - 1, current_date - 1, current_date + 5) then
    raise exception 'completion must keep the planned dates';
  end if;
  if not exists (select 1 from public.tasks t join public.routines r on r.id = t.routine_id
                  where r.phase_id = a and t.scheduled_date = current_date) then
    raise exception 'an already generated task was removed';
  end if;
  if public.generate_routine_tasks(current_date + 1) <> 1 then
    raise exception 'only phase B must generate after A is completed';
  end if;
  if exists (select 1 from public.tasks t join public.routines r on r.id = t.routine_id
              where r.phase_id = a and t.scheduled_date = current_date + 1) then
    raise exception 'a completed phase generated a task after its completion day';
  end if;

  -- Completing today keeps today's generation (the completion day is included).
  perform public.set_phase_completion(b, current_date);
  delete from public.tasks where plan_id = p and scheduled_date = current_date;
  delete from public.routine_skips where date = current_date;
  if public.generate_routine_tasks(current_date) <> 1 then
    raise exception 'the completion day must still generate phase B only';
  end if;

  -- Undo: generation comes back.
  perform public.set_phase_completion(a, null);
  if (select completed_at from public.phases where id = a) is not null then
    raise exception 'completion not undone';
  end if;
  delete from public.tasks where plan_id = p and scheduled_date = current_date + 1;
  delete from public.routine_skips where date = current_date + 1;
  if public.generate_routine_tasks(current_date + 1) <> 1 then
    raise exception 'phase A must generate again after the undo (B is completed today)';
  end if;

  -- Moving the start after, or the end before, the completion day is rejected.
  perform public.set_phase_completion(a, current_date);
  begin
    perform public.save_phase_settings(p, a, 'Phase A', current_date + 1, current_date + 5, menu);
    raise exception 'start moved after the completion day';
  exception when check_violation then null; end;
  begin
    perform public.save_phase_settings(p, a, 'Phase A', current_date - 1, current_date - 1, menu);
    raise exception 'end moved before the completion day';
  exception when check_violation then null; end;

  -- Deleting B, then A (the last phase) falls back to the implicit phase without a completion.
  perform public.delete_phase(b);
  perform public.delete_phase(a);
  if (select (is_implicit, completed_at) from public.phases where id = a)
     is distinct from (true, null::date) then
    raise exception 'the implicit fallback must clear completed_at';
  end if;
end $$;

-- User B cannot complete A's phase ---------------------------------------
select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000001', true);
do $$
declare v uuid;
begin
  v := public.save_phase_settings('a2300000-0000-0000-0000-000000000011', null, 'Phase C',
         current_date, current_date + 3, '[]'::jsonb);
  perform set_config('stride.test_phase', v::text, true);
end $$;
select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000002', true);
do $$ begin
  begin
    perform public.set_phase_completion(current_setting('stride.test_phase')::uuid, current_date);
    raise exception 'B completed A phase';
  exception when no_data_found then null; end;
end $$;

reset role;
do $$ begin
  if (select completed_at from public.phases where id = current_setting('stride.test_phase')::uuid) is not null then
    raise exception 'A phase changed by B';
  end if;
end $$;

select '0023_phase_completion: all checks passed' as result;
rollback;
