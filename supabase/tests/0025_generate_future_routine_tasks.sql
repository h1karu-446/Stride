-- Verifies migration 0025 (Issue #84). Everything is rolled back.
-- The file runs 0025 itself (twice, via \ir) inside its transaction, so it
-- works whether or not 0025 has already been applied.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0025_generate_future_routine_tasks.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0025_generate_future_routine_tasks.sql
-- and pipe the result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
insert into auth.users (id, email) values
 ('a2500000-0000-0000-0000-000000000001', 'stride-test-0025-a@example.invalid'),
 ('a2500000-0000-0000-0000-000000000002', 'stride-test-0025-b@example.invalid');
insert into public.plans (id, user_id, name, color, status) values
 ('a2500000-0000-0000-0000-000000000011', 'a2500000-0000-0000-0000-000000000001', 'A plan', 'blue', 'active');

\ir ../migrations/0025_generate_future_routine_tasks.sql
\ir ../migrations/0025_generate_future_routine_tasks.sql

set local role authenticated;

-- User A ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a2500000-0000-0000-0000-000000000001', true);
do $$
declare
  p uuid := 'a2500000-0000-0000-0000-000000000011';
  a uuid;
  menu jsonb := jsonb_build_array(jsonb_build_object(
    'title', 'Menu A', 'minutes', 30, 'weekdays', jsonb_build_array(1,2,3,4,5,6,7),
    'importance', '重', 'menu', 'detail'));
begin
  -- The phase ends at + 5, so later days have nothing to generate.
  a := public.save_phase_settings(p, null, 'Phase A', current_date - 1, current_date + 5, menu);

  -- Range: DB date - 1 .. + 8.
  begin
    perform public.generate_routine_tasks(current_date - 2);
    raise exception 'generated two days ago';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.generate_routine_tasks(current_date + 9);
    raise exception 'generated nine days ahead';
  exception when invalid_parameter_value then null; end;
  if public.generate_routine_tasks(current_date + 8) <> 0 then
    raise exception '+ 8 is outside the phase and must generate nothing';
  end if;

  -- A future day generates the same task as on the day itself.
  if public.generate_routine_tasks(current_date + 3) <> 1 then
    raise exception '+ 3 must generate one task';
  end if;
  if (select (title, importance::text, planned_minutes, memo, plan_id, from_routine, completed)
        from public.tasks where scheduled_date = current_date + 3)
     is distinct from ('Menu A'::text, '重'::text, 30, 'detail'::text, p, true, false) then
    raise exception 'the early task differs from a generated task';
  end if;

  -- Calling again (on the day itself) adds nothing.
  if public.generate_routine_tasks(current_date + 3) <> 0 then
    raise exception 'the day itself generated a second task';
  end if;

  -- Deleting the early task skips that day.
  delete from public.tasks where scheduled_date = current_date + 3;
  if not exists (select 1 from public.routine_skips where date = current_date + 3) then
    raise exception 'deleting an early task must record a skip';
  end if;
  if public.generate_routine_tasks(current_date + 3) <> 0 then
    raise exception 'a deleted early task was generated again';
  end if;

  -- After the phase end nothing is generated.
  if public.generate_routine_tasks(current_date + 6) <> 0 then
    raise exception 'generated after the phase end';
  end if;
  if public.generate_routine_tasks(current_date + 5) <> 1 then
    raise exception 'the last phase day must generate';
  end if;
end $$;

-- User B generates nothing from A's routines ------------------------------
select set_config('request.jwt.claim.sub', 'a2500000-0000-0000-0000-000000000002', true);
do $$ begin
  if public.generate_routine_tasks(current_date + 4) <> 0 then
    raise exception 'B generated from A routines';
  end if;
end $$;

reset role;
do $$ begin
  if exists (select 1 from public.tasks
              where user_id = 'a2500000-0000-0000-0000-000000000002') then
    raise exception 'B got a task';
  end if;
  if exists (select 1 from public.tasks
              where user_id = 'a2500000-0000-0000-0000-000000000001'
                and scheduled_date = current_date + 4) then
    raise exception 'B created a task for A';
  end if;
end $$;

select '0025_generate_future_routine_tasks: all checks passed' as result;
rollback;
