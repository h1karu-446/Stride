-- Run with psql -v ON_ERROR_STOP=1 after migrations 0001..0009.
-- All fixtures and mutations are rolled back; existing users are untouched.
begin;
insert into auth.users (id, email) values
 ('a9000000-0000-0000-0000-000000000001', 'stride-test-0009-a@example.invalid'),
 ('a9000000-0000-0000-0000-000000000002', 'stride-test-0009-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000001', true);
insert into public.wishes (id, user_id, title, achieved_at) values
 ('a9000000-0000-0000-0000-000000000011', auth.uid(), 'achieved wish', current_date),
 ('a9000000-0000-0000-0000-000000000012', auth.uid(), 'pending wish', null);
insert into public.plans (id, user_id, name, color, status) values
 ('a9000000-0000-0000-0000-000000000021', auth.uid(), 'done plan', 'blue', 'done'),
 ('a9000000-0000-0000-0000-000000000022', auth.uid(), 'active plan', 'pink', 'active');
insert into public.materials (id, user_id, plan_id, title, status) values
 ('a9000000-0000-0000-0000-000000000031', auth.uid(), 'a9000000-0000-0000-0000-000000000021', 'done material', 'done'),
 ('a9000000-0000-0000-0000-000000000032', auth.uid(), 'a9000000-0000-0000-0000-000000000021', 'pending material', 'todo');
insert into public.tasks (id, user_id, plan_id, title, importance, scheduled_date, completed, is_milestone) values
 ('a9000000-0000-0000-0000-000000000041', auth.uid(), 'a9000000-0000-0000-0000-000000000021', 'milestone', '中', current_date, true, true),
 ('a9000000-0000-0000-0000-000000000042', auth.uid(), 'a9000000-0000-0000-0000-000000000021', 'normal task', '中', current_date, true, false),
 ('a9000000-0000-0000-0000-000000000043', auth.uid(), 'a9000000-0000-0000-0000-000000000021', 'pending milestone', '中', current_date, false, true);
do $$ begin
 if (select count(*) from public.achievements) <> 4 then raise exception 'DB-60: expected four achievements'; end if;
 if (select count(distinct kind) from public.achievements) <> 4 then raise exception 'DB-60: expected four kinds'; end if;
 if not exists (select 1 from public.achievements where kind = 'plan' and started_on is not null and plan_name = 'done plan') then raise exception 'DB-60: plan metadata missing'; end if;
end $$;
update public.wishes set achieved_at = null where id = 'a9000000-0000-0000-0000-000000000011';
do $$ begin
 if exists (select 1 from public.achievements where kind = 'wish') then raise exception 'DB-61: reverted wish remains'; end if;
end $$;
update public.wishes set achieved_at = current_date where id = 'a9000000-0000-0000-0000-000000000011';
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000002', true);
do $$ begin
 if exists (select 1 from public.wishes) or exists (select 1 from public.achievements) then raise exception 'DB-50: another owner visible'; end if;
 begin
   insert into public.wishes (user_id, title) values ('a9000000-0000-0000-0000-000000000001', 'forged owner');
   raise exception 'forged owner insert allowed';
 exception when insufficient_privilege then null; end;
 update public.wishes set title = 'hijacked' where id = 'a9000000-0000-0000-0000-000000000011';
 if found then raise exception 'another owner update allowed'; end if;
 delete from public.wishes where id = 'a9000000-0000-0000-0000-000000000011';
 if found then raise exception 'another owner delete allowed'; end if;
end $$;
insert into public.wishes (id, user_id, title) values ('a9000000-0000-0000-0000-000000000013', auth.uid(), 'own wish');
do $$ begin
 begin
   update public.wishes set user_id = 'a9000000-0000-0000-0000-000000000001' where id = 'a9000000-0000-0000-0000-000000000013';
   raise exception 'owner reassignment allowed';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.wishes (user_id, title) values (auth.uid(), ' ');
   raise exception 'blank title allowed';
 exception when check_violation then null; end;
 begin
   insert into public.wishes (user_id, title) values (auth.uid(), repeat('x', 61));
   raise exception 'long title allowed';
 exception when check_violation then null; end;
 begin
   insert into public.wishes (user_id, title, note) values (auth.uid(), 'valid', repeat('x', 101));
   raise exception 'long note allowed';
 exception when check_violation then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
 begin
   perform * from public.wishes;
   raise exception 'DB-53: anon wishes access allowed';
 exception when insufficient_privilege then null; end;
 begin
   perform * from public.achievements;
   raise exception 'DB-53: anon achievements access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'PASS DB-50, DB-53, DB-60, DB-61 and wishes ownership/validation. DB-51/52 N/A: no parent foreign key or new RPC.'
