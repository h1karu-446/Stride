-- Run after migration 0020. Fixtures and generated tasks are rolled back.
begin;
insert into auth.users (id, email) values
 ('a2000000-0000-0000-0000-000000000001', 'stride-test-0020@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
insert into public.plans (id, user_id, name, color, status)
values ('a2000000-0000-0000-0000-000000000011', auth.uid(), 'Overlap', 'blue', 'active');

do $$
declare
  p uuid := 'a2000000-0000-0000-0000-000000000011';
  menu jsonb := jsonb_build_array(jsonb_build_object(
    'title', 'Menu A', 'minutes', 30, 'weekdays', jsonb_build_array(1,2,3,4,5,6,7),
    'importance', '中', 'menu', null));
begin
  perform public.save_phase_settings(p, null, 'Phase A', current_date - 1,
    current_date + 1, menu);
  perform public.save_phase_settings(p, null, 'Phase B', current_date,
    current_date + 2, jsonb_set(menu, '{0,title}', '"Menu B"'));
  if (select count(*) from public.phases where plan_id = p and not is_implicit) <> 2 then
    raise exception 'overlapping phases were not saved';
  end if;
  if public.generate_routine_tasks(current_date) <> 2 then
    raise exception 'both overlapping menus must generate';
  end if;
  if public.generate_routine_tasks(current_date) <> 0 then
    raise exception 'overlapping menus generated twice';
  end if;
  if (select count(*) from public.tasks where plan_id = p and scheduled_date = current_date) <> 2 then
    raise exception 'expected two tasks from the overlapping phases';
  end if;
end $$;
reset role;
do $$ begin raise notice 'PASS: 0020 overlapping phases'; end $$;
rollback;
