-- Run with psql -v ON_ERROR_STOP=1 after migrations 0001..0011 (Issue #28).
-- All fixtures and mutations are rolled back; existing users are untouched.
-- The fixtures are created in this transaction on purpose: that is the case
-- where the old delete_plan hit tasks_routine_id_fkey.
-- A = ...0001 owns plan P (routine R, material) and plan Q (routine RQ).
-- B = ...0002 tries to delete P.
begin;
insert into auth.users (id, email) values
 ('a1100000-0000-0000-0000-000000000001', 'stride-test-0011-a@example.invalid'),
 ('a1100000-0000-0000-0000-000000000002', 'stride-test-0011-b@example.invalid');
set local role authenticated;

-- User A: fixtures ----------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000001', true);
insert into public.plans (id, user_id, name, color, status) values
 ('a1100000-0000-0000-0000-000000000011', auth.uid(), 'P', 'blue', 'active'),
 ('a1100000-0000-0000-0000-000000000012', auth.uid(), 'Q', 'green', 'active');
insert into public.routines (id, user_id, phase_id, title)
select 'a1100000-0000-0000-0000-000000000021', auth.uid(), ph.id, 'R'
  from public.phases ph
 where ph.plan_id = 'a1100000-0000-0000-0000-000000000011' and ph.is_implicit;
insert into public.routines (id, user_id, phase_id, title)
select 'a1100000-0000-0000-0000-000000000022', auth.uid(), ph.id, 'RQ'
  from public.phases ph
 where ph.plan_id = 'a1100000-0000-0000-0000-000000000012' and ph.is_implicit;
insert into public.materials (id, user_id, plan_id, title)
values ('a1100000-0000-0000-0000-000000000031', auth.uid(),
        'a1100000-0000-0000-0000-000000000011', 'P material');

-- Today's routine tasks of R and RQ (plan_id + routine_id)
select public.generate_routine_tasks(current_date);

-- Tasks of P. Kept (k) or removed (x) by delete_plan(P, today), per BR-08.
insert into public.tasks
  (id, user_id, title, importance, scheduled_date, completed, plan_id, routine_id, is_milestone)
values
 -- k: completed routine task in the past (the case in Issue #28)
 ('a1100000-0000-0000-0000-000000000101', auth.uid(), 'R past done', '中', current_date - 1, true,
  'a1100000-0000-0000-0000-000000000011', 'a1100000-0000-0000-0000-000000000021', false),
 -- k: unfinished routine task in the past
 ('a1100000-0000-0000-0000-000000000102', auth.uid(), 'R past open', '中', current_date - 2, false,
  'a1100000-0000-0000-0000-000000000011', 'a1100000-0000-0000-0000-000000000021', false),
 -- k: completed routine task in the future
 ('a1100000-0000-0000-0000-000000000103', auth.uid(), 'R future done', '中', current_date + 2, true,
  'a1100000-0000-0000-0000-000000000011', 'a1100000-0000-0000-0000-000000000021', false),
 -- x: unfinished routine task in the future
 ('a1100000-0000-0000-0000-000000000104', auth.uid(), 'R future open', '中', current_date + 3, false,
  'a1100000-0000-0000-0000-000000000011', 'a1100000-0000-0000-0000-000000000021', false),
 -- x: unfinished milestone in the future
 ('a1100000-0000-0000-0000-000000000105', auth.uid(), 'P milestone open', '重', current_date + 4, false,
  'a1100000-0000-0000-0000-000000000011', null, true),
 -- k: completed milestone in the future
 ('a1100000-0000-0000-0000-000000000106', auth.uid(), 'P milestone done', '重', current_date + 5, true,
  'a1100000-0000-0000-0000-000000000011', null, true),
 -- k: task linked to R only (plan_id cleared earlier); not a task of P, kept
 ('a1100000-0000-0000-0000-000000000107', auth.uid(), 'R only', '軽', current_date + 6, false,
  null, 'a1100000-0000-0000-0000-000000000021', false),
 -- untouched: future unfinished task of Q, and a manual task
 ('a1100000-0000-0000-0000-000000000108', auth.uid(), 'Q future open', '中', current_date + 3, false,
  'a1100000-0000-0000-0000-000000000012', 'a1100000-0000-0000-0000-000000000022', false),
 ('a1100000-0000-0000-0000-000000000109', auth.uid(), 'manual', '中', current_date - 1, true,
  null, null, false);

-- A skip of Q's routine: deleting today's RQ task records it (ADR-0003).
delete from public.tasks
 where routine_id = 'a1100000-0000-0000-0000-000000000022' and scheduled_date = current_date;

-- Score of a past day, to check that deleting the plan does not change it.
insert into public.daily_reviews (user_id, date, fulfillment)
values (auth.uid(), current_date - 1, 3);

-- User B: cannot delete A's plan ---------------------------------------------
select set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000002', true);
do $$
declare n integer;
begin
  begin
    perform public.delete_plan('a1100000-0000-0000-0000-000000000011', current_date);
    raise exception 'DB-52: delete_plan on another owner plan succeeded';
  exception when no_data_found then null; end;

  delete from public.plans where id = 'a1100000-0000-0000-0000-000000000011';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'DB-52: direct delete of another owner plan removed % rows', n;
  end if;
end $$;

-- User A: delete P -----------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1100000-0000-0000-0000-000000000001', true);
do $$
declare
  p uuid := 'a1100000-0000-0000-0000-000000000011';
  r uuid := 'a1100000-0000-0000-0000-000000000021';
  score_before numeric;
  score_after numeric;
  n integer;
begin
  select completion_score into score_before
    from public.daily_reviews where user_id = auth.uid() and date = current_date - 1;

  -- Issue #28: used to fail with tasks_routine_id_fkey
  perform public.delete_plan(p, current_date);

  -- Plan, phases, routine and material are gone
  if exists (select 1 from public.plans where id = p)
     or exists (select 1 from public.phases where plan_id = p)
     or exists (select 1 from public.routines where id = r)
     or exists (select 1 from public.materials where plan_id = p) then
    raise exception 'BR-08: plan children not deleted';
  end if;

  -- Removed: future unfinished tasks of P
  if exists (select 1 from public.tasks
              where id in ('a1100000-0000-0000-0000-000000000104',
                           'a1100000-0000-0000-0000-000000000105')) then
    raise exception 'BR-08: future unfinished task of the plan kept';
  end if;

  -- Kept with the links cleared: past, today's and completed tasks of P,
  -- and the task linked to R only
  select count(*) into n from public.tasks
   where user_id = auth.uid()
     and plan_id is null and routine_id is null
     and (id in ('a1100000-0000-0000-0000-000000000101',
                 'a1100000-0000-0000-0000-000000000102',
                 'a1100000-0000-0000-0000-000000000103',
                 'a1100000-0000-0000-0000-000000000106',
                 'a1100000-0000-0000-0000-000000000107')
          or (title = 'R' and scheduled_date = current_date and completed = false));
  if n <> 6 then
    raise exception 'BR-08: expected 6 kept tasks with links cleared, got %', n;
  end if;
  if (select completed from public.tasks where id = 'a1100000-0000-0000-0000-000000000101') is not true
     or (select is_milestone from public.tasks where id = 'a1100000-0000-0000-0000-000000000106') is not true then
    raise exception 'BR-08: kept task data changed';
  end if;

  -- Untouched: Q's task and the manual task
  if not exists (select 1 from public.tasks
                  where id = 'a1100000-0000-0000-0000-000000000108'
                    and plan_id = 'a1100000-0000-0000-0000-000000000012'
                    and routine_id = 'a1100000-0000-0000-0000-000000000022')
     or not exists (select 1 from public.tasks
                     where id = 'a1100000-0000-0000-0000-000000000109'
                       and plan_id is null and routine_id is null) then
    raise exception 'delete_plan touched tasks of another plan';
  end if;

  -- Skips: none left for P (the one recorded when removing the future R task
  -- goes with the routine); Q's skip stays. Clearing the links is an update,
  -- so it records no skip.
  select count(*) into n from public.routine_skips where user_id = auth.uid();
  if n <> 1 or not exists (
       select 1 from public.routine_skips
        where routine_id = 'a1100000-0000-0000-0000-000000000022'
          and date = current_date) then
    raise exception 'routine_skips: expected only the Q skip, got % rows', n;
  end if;

  -- NFR-01: the past day's score does not change
  select completion_score into score_after
    from public.daily_reviews where user_id = auth.uid() and date = current_date - 1;
  if score_before is distinct from score_after then
    raise exception 'NFR-01: past score changed (% -> %)', score_before, score_after;
  end if;

  -- Q's routine is not touched
  if not exists (select 1 from public.routines
                  where id = 'a1100000-0000-0000-0000-000000000022') then
    raise exception 'delete_plan removed a routine of another plan';
  end if;
end $$;

reset role;
do $$ begin
  raise notice 'PASS: 0011 fix delete_plan';
end $$;
rollback;
