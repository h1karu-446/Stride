-- Run after migration 0019. Fixtures and all mutations are rolled back.
begin;
insert into auth.users (id, email) values
 ('a1900000-0000-0000-0000-000000000001', 'stride-test-0019-a@example.invalid'),
 ('a1900000-0000-0000-0000-000000000002', 'stride-test-0019-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000001', true);

insert into public.plans (id, user_id, name, color, status)
values ('a1900000-0000-0000-0000-000000000011', auth.uid(), 'Phase settings', 'blue', 'active');
insert into public.routines (id, user_id, phase_id, title, menu)
select 'a1900000-0000-0000-0000-000000000021', auth.uid(), id,
       'Old menu', 'Old detail'
  from public.phases
 where plan_id = 'a1900000-0000-0000-0000-000000000011' and is_implicit;
select public.generate_routine_tasks(current_date);

do $$
declare
  p uuid := 'a1900000-0000-0000-0000-000000000011';
  r uuid := 'a1900000-0000-0000-0000-000000000021';
  ph uuid;
  n integer;
begin
  -- Convert the implicit phase, update its routine and add another atomically.
  ph := public.save_phase_settings(p, null, 'Foundation', current_date - 1,
    current_date + 29, jsonb_build_array(
      jsonb_build_object('id', r, 'title', 'Listening', 'minutes', 30,
        'weekdays', jsonb_build_array(1,2,3,4,5,6,7), 'importance', '中',
        'menu', 'Test 2'),
      jsonb_build_object('title', 'Reading', 'minutes', 45,
        'weekdays', jsonb_build_array(1,3,5), 'importance', '重',
        'menu', null)));
  if not exists (select 1 from public.phases where id = ph and not is_implicit
      and name = 'Foundation') then
    raise exception 'implicit phase was not converted';
  end if;
  select count(*) into n from public.routines where phase_id = ph;
  if n <> 2 then raise exception 'expected two routines, got %', n; end if;
  if not exists (select 1 from public.tasks where routine_id = r
      and title = 'Old menu' and memo = 'Old detail') then
    raise exception 'generated task was rewritten';
  end if;

  -- A later invalid routine must roll back the preceding phase/routine edits.
  begin
    perform public.save_phase_settings(p, ph, 'Changed but rolled back',
      current_date - 1, current_date + 29, jsonb_build_array(
        jsonb_build_object('id', r, 'title', 'Changed but rolled back',
          'minutes', 30, 'weekdays', jsonb_build_array(1),
          'importance', '中', 'menu', null),
        jsonb_build_object('title', 'Invalid', 'minutes', 7,
          'weekdays', jsonb_build_array(1), 'importance', '中', 'menu', null)));
    raise exception 'invalid routine was accepted';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.phases where id = ph and name = 'Foundation')
     or not exists (select 1 from public.routines where id = r and title = 'Listening') then
    raise exception 'failed save left partial changes';
  end if;

  -- Omitting the old routine deletes it, but its generated task is retained.
  perform public.save_phase_settings(p, ph, 'Foundation', current_date - 1,
    current_date + 29, jsonb_build_array(
      jsonb_build_object('title', 'Reading 2', 'minutes', 45,
        'weekdays', jsonb_build_array(1,3,5), 'importance', '重', 'menu', null)));
  if exists (select 1 from public.routines where id = r)
     or not exists (select 1 from public.tasks where title = 'Old menu'
       and routine_id is null and memo = 'Old detail') then
    raise exception 'old task was not preserved when routine was removed';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a1900000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.save_phase_settings(
      'a1900000-0000-0000-0000-000000000011', null,
      'Other owner', current_date, current_date + 1, '[]'::jsonb);
    raise exception 'another user changed the plan';
  exception when no_data_found then null;
  end;
end $$;
reset role;
do $$ begin raise notice 'PASS: 0019 phase settings'; end $$;
rollback;
