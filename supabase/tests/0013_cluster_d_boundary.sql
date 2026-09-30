-- Verifies migration 0013 (Issue #35). Everything is rolled back.
-- The file runs 0013 itself (twice, via \ir) inside its transaction, so it
-- works whether or not 0013 has already been applied.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0013_cluster_d_boundary.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0013_cluster_d_boundary.sql and pipe the
-- result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
--
-- Days used (tasks 重 + 重 + 軽 (done) + 軽 → completion 80 * 1/8 = 10):
--   2026-01-10: fulfillment 5, wake/bed on time      → 30.0 → D
--   2026-01-11: fulfillment 5, wake 2 minutes late   → 29.9 → E
-- (tasks 重 (done) + 重 x4 + 軽 → completion 80 * 3/16 = 15):
--   2026-01-12 and 2026-02-01: fulfillment 5, wake 100 minutes late (2.5),
--   bed on time → 30 in exact arithmetic, 29.999…975 in numeric → stored 30.00
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

insert into public.tasks (user_id, title, importance, scheduled_date, completed)
select 'a1300000-0000-0000-0000-000000000001', t.title, t.importance, d.day, t.completed
  from (values (date '2026-01-12'), (date '2026-02-01')) as d(day)
 cross join (values ('heavy done', '重', true),
                    ('heavy 2', '重', false),
                    ('heavy 3', '重', false),
                    ('heavy 4', '重', false),
                    ('heavy 5', '重', false),
                    ('light open', '軽', false)) as t(title, importance, completed);

-- Stored rows written before 0013 (trigger off, explicit values) -------------
alter table public.daily_reviews disable trigger trg_update_scores;
insert into public.daily_reviews
  (user_id, date, fulfillment, wake_time, wake_target, bed_time, bed_target,
   completion_score, fulfillment_score, wake_score, bed_score,
   total_score, cluster, updated_at)
values
 -- 30.00 stored as E (the old `> 30`, or the unrounded 29.999…975) → D
 ('a1300000-0000-0000-0000-000000000001', '2026-02-01', 5, '08:40', '07:00', '23:00', '23:00',
  15, 5, 2.5, 7.5, 30.00, 'E', '2026-01-01 00:00+00'),
 -- 29.995 is stored as 30.00 → D
 ('a1300000-0000-0000-0000-000000000001', '2026-02-02', null, null, null, null, null,
  null, null, null, null, 29.995, 'E', '2026-01-01 00:00+00'),
 -- 29.99 stays E (untouched)
 ('a1300000-0000-0000-0000-000000000001', '2026-02-03', null, null, null, null, null,
  null, null, null, null, 29.99, 'E', '2026-01-01 00:00+00'),
 -- 49.995 is stored as 50.00, stored as D → C
 ('a1300000-0000-0000-0000-000000000001', '2026-02-04', null, null, null, null, null,
  null, null, null, null, 49.995, 'D', '2026-01-01 00:00+00'),
 -- 85.00 stored as B → A
 ('a1300000-0000-0000-0000-000000000001', '2026-02-05', null, null, null, null, null,
  null, null, null, null, 85, 'B', '2026-01-01 00:00+00'),
 -- 72.00 / B is already right (untouched)
 ('a1300000-0000-0000-0000-000000000001', '2026-02-06', null, null, null, null, null,
  null, null, null, null, 72, 'B', '2026-01-01 00:00+00');
alter table public.daily_reviews enable trigger trg_update_scores;

create temp table t_before on commit drop as
select date, ctid::text as tid, total_score, completion_score, wake_score
  from public.daily_reviews
 where user_id = 'a1300000-0000-0000-0000-000000000001';

-- 0013, first run --------------------------------------------------------------
\ir ../migrations/0013_cluster_d_boundary.sql

do $$
declare
  r record;
begin
  for r in
    select d.date, d.total_score, d.cluster, d.updated_at, d.ctid::text as tid,
           b.tid as tid_before, b.total_score as total_before,
           b.completion_score as completion_before, b.wake_score as wake_before,
           d.completion_score, d.wake_score,
           case d.date
             when '2026-02-01' then 'D' when '2026-02-02' then 'D'
             when '2026-02-03' then 'E' when '2026-02-04' then 'C'
             when '2026-02-05' then 'A' when '2026-02-06' then 'B'
           end as expected
      from public.daily_reviews d
      join t_before b using (date)
     where d.user_id = 'a1300000-0000-0000-0000-000000000001'
  loop
    if r.cluster is distinct from r.expected then
      raise exception 'stored row %: expected %, got %', r.date, r.expected, r.cluster;
    end if;
    if r.updated_at <> '2026-01-01 00:00+00' then
      raise exception 'stored row %: updated_at changed to %', r.date, r.updated_at;
    end if;
    if r.total_score is distinct from r.total_before
       or r.completion_score is distinct from r.completion_before
       or r.wake_score is distinct from r.wake_before then
      raise exception 'stored row %: scores were recomputed', r.date;
    end if;
    if r.date in ('2026-02-03', '2026-02-06') and r.tid <> r.tid_before then
      raise exception 'stored row %: already right but was updated', r.date;
    end if;
  end loop;

  if (select tgenabled from pg_trigger
       where tgname = 'trg_update_scores'
         and tgrelid = 'public.daily_reviews'::regclass) <> 'O' then
    raise exception 'trg_update_scores was left disabled';
  end if;
end $$;

-- 0013, second run: updates nothing ------------------------------------------
create temp table t_all_before on commit drop as
select id, ctid::text as tid from public.daily_reviews;

\ir ../migrations/0013_cluster_d_boundary.sql

do $$
declare
  n int;
begin
  select count(*) into n
    from public.daily_reviews d join t_all_before b using (id)
   where d.ctid::text <> b.tid;
  if n <> 0 then
    raise exception 'second run of 0013 updated % rows', n;
  end if;
end $$;

-- Recomputing the stored 30.00 day keeps it D --------------------------------
update public.daily_reviews set memo = memo
 where user_id = 'a1300000-0000-0000-0000-000000000001' and date = '2026-02-01';

-- Rows saved through trg_update_scores ---------------------------------------
insert into public.daily_reviews
  (user_id, date, fulfillment, wake_time, wake_target, bed_time, bed_target)
values
 ('a1300000-0000-0000-0000-000000000001', '2026-01-10', 5, '07:00', '07:00', '23:00', '23:00'),
 ('a1300000-0000-0000-0000-000000000001', '2026-01-11', 5, '07:02', '07:00', '23:00', '23:00'),
 ('a1300000-0000-0000-0000-000000000001', '2026-01-12', 5, '08:40', '07:00', '23:00', '23:00');

do $$
declare
  r record;
begin
  select total_score, cluster, updated_at into r from public.daily_reviews
   where user_id = 'a1300000-0000-0000-0000-000000000001' and date = '2026-02-01';
  if r.total_score <> 30 or r.cluster <> 'D' or r.updated_at = '2026-01-01 00:00+00' then
    raise exception 'recomputed 30.00 day: expected a recompute to 30 / D, got % / % (updated_at %)',
      r.total_score, r.cluster, r.updated_at;
  end if;

  -- The function itself: returns the rounded total and ranks it
  select * into r from public.calculate_daily_score(
    'a1300000-0000-0000-0000-000000000001', '2026-01-10', 5,
    '07:00', '07:00', '23:00', '23:00');
  if r.total_score <> 30 or r.cluster <> 'D' then
    raise exception 'calculate_daily_score: expected 30 / D, got % / %', r.total_score, r.cluster;
  end if;

  select * into r from public.calculate_daily_score(
    'a1300000-0000-0000-0000-000000000001', '2026-01-11', 5,
    '07:02', '07:00', '23:00', '23:00');
  if r.total_score <> 29.9 or r.cluster <> 'E' then
    raise exception 'calculate_daily_score: expected 29.9 / E, got % / %', r.total_score, r.cluster;
  end if;

  select * into r from public.calculate_daily_score(
    'a1300000-0000-0000-0000-000000000001', '2026-01-12', 5,
    '08:40', '07:00', '23:00', '23:00');
  if r.total_score <> 30 or r.cluster <> 'D' then
    raise exception 'calculate_daily_score (29.999…975): expected 30 / D, got % / %',
      r.total_score, r.cluster;
  end if;

  for r in
    select date, total_score, cluster,
           case date when '2026-01-10' then 'D' when '2026-01-11' then 'E'
                     when '2026-01-12' then 'D' end as expected,
           case date when '2026-01-10' then 30 when '2026-01-11' then 29.9
                     when '2026-01-12' then 30 end as expected_total
      from public.daily_reviews
     where user_id = 'a1300000-0000-0000-0000-000000000001'
       and date in ('2026-01-10', '2026-01-11', '2026-01-12')
  loop
    if r.total_score <> r.expected_total or r.cluster <> r.expected then
      raise exception 'saved day %: expected % / %, got % / %',
        r.date, r.expected_total, r.expected, r.total_score, r.cluster;
    end if;
  end loop;

  -- No stored row disagrees with the rank of its stored total
  if exists (select 1 from public.daily_reviews
              where total_score is not null
                and cluster is distinct from case
                  when total_score >= 85 then 'A'
                  when total_score >= 70 then 'B'
                  when total_score >= 50 then 'C'
                  when total_score >= 30 then 'D'
                  else 'E' end) then
    raise exception 'a daily_reviews row has a cluster that does not match its total_score';
  end if;
end $$;

do $$ begin
  raise notice 'PASS: 0013 cluster D boundary';
end $$;
rollback;
