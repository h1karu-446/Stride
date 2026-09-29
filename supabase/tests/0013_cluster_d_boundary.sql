-- Run with psql -v ON_ERROR_STOP=1 after migrations 0001..0013 (Issue #35).
-- All fixtures are rolled back; existing users are untouched.
-- Before 0013 is applied, it can be checked in one transaction with:
--   (echo 'begin;'; cat supabase/migrations/0013_cluster_d_boundary.sql;
--    cat supabase/tests/0013_cluster_d_boundary.sql)
--   | docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
-- (psql warns that a transaction is already in progress; the final rollback
-- undoes the migration too.)
--
-- Scores, with tasks 重 + 重 + 軽 (done) + 軽 → completion 80 * 1/8 = 10,
-- fulfillment 5, bed on time 7.5:
--   D30  : wake on time        → 10 + 5 + 7.5 + 7.5 = 30.0 → D
--   E299 : wake 2 minutes late → 10 + 5 + 7.4 + 7.5 = 29.9 → E
begin;
insert into auth.users (id, email) values
 ('a1300000-0000-0000-0000-000000000001', 'stride-test-0013-a@example.invalid');

insert into public.tasks (user_id, title, importance, scheduled_date, completed)
select 'a1300000-0000-0000-0000-000000000001', t.title, t.importance, d.day, t.completed
  from (values (date '2026-01-10'), (date '2026-01-11')) as d(day)
 cross join (values ('heavy 1', '重', false),
                    ('heavy 2', '重', false),
                    ('light done', '軽', true),
                    ('light open', '軽', false)) as t(title, importance, completed);

insert into public.daily_reviews
  (user_id, date, fulfillment, wake_time, wake_target, bed_time, bed_target)
values
 ('a1300000-0000-0000-0000-000000000001', '2026-01-10', 5, '07:00', '07:00', '23:00', '23:00'),
 ('a1300000-0000-0000-0000-000000000001', '2026-01-11', 5, '07:02', '07:00', '23:00', '23:00');

do $$
declare
  r record;
begin
  -- The function itself (it returns unrounded numerics)
  select * into r from public.calculate_daily_score(
    'a1300000-0000-0000-0000-000000000001', '2026-01-10', 5,
    '07:00', '07:00', '23:00', '23:00');
  if round(r.total_score, 2) <> 30 or r.cluster <> 'D' then
    raise exception 'calculate_daily_score: expected 30 / D, got % / %', r.total_score, r.cluster;
  end if;

  select * into r from public.calculate_daily_score(
    'a1300000-0000-0000-0000-000000000001', '2026-01-11', 5,
    '07:02', '07:00', '23:00', '23:00');
  if round(r.total_score, 2) <> 29.9 or r.cluster <> 'E' then
    raise exception 'calculate_daily_score: expected 29.9 / E, got % / %', r.total_score, r.cluster;
  end if;

  -- Rows saved through trg_update_scores
  select total_score, cluster into r from public.daily_reviews
   where user_id = 'a1300000-0000-0000-0000-000000000001' and date = '2026-01-10';
  if r.total_score <> 30 or r.cluster <> 'D' then
    raise exception 'saved 30-point day: expected 30 / D, got % / %', r.total_score, r.cluster;
  end if;

  select total_score, cluster into r from public.daily_reviews
   where user_id = 'a1300000-0000-0000-0000-000000000001' and date = '2026-01-11';
  if r.total_score <> 29.9 or r.cluster <> 'E' then
    raise exception 'saved 29.9-point day: expected 29.9 / E, got % / %', r.total_score, r.cluster;
  end if;

  -- Stored rows fixed by 0013: no 30-point day is left outside D
  if exists (select 1 from public.daily_reviews
              where total_score = 30 and cluster is distinct from 'D') then
    raise exception 'a daily_reviews row with total_score = 30 is not D';
  end if;
end $$;

do $$ begin
  raise notice 'PASS: 0013 cluster D boundary';
end $$;
rollback;
