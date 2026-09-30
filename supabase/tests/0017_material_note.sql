-- Verifies migration 0017 (Issue #53). Everything is rolled back.
-- The file runs 0017 itself (twice, via \ir) inside its transaction, so it
-- works whether or not 0017 has already been applied.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0017_material_note.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0017_material_note.sql and pipe the
-- result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
insert into auth.users (id, email) values
 ('a1700000-0000-0000-0000-000000000001', 'stride-test-0017-a@example.invalid'),
 ('a1700000-0000-0000-0000-000000000002', 'stride-test-0017-b@example.invalid');
insert into public.plans (id, user_id, name, color, status) values
 ('a1700000-0000-0000-0000-000000000011', 'a1700000-0000-0000-0000-000000000001', 'A plan', 'blue', 'active');
-- A material that exists before 0017 (when 0017 is not applied yet).
insert into public.materials (id, user_id, plan_id, title, status) values
 ('a1700000-0000-0000-0000-000000000021', 'a1700000-0000-0000-0000-000000000001',
  'a1700000-0000-0000-0000-000000000011', 'existing', 'in_progress');

\ir ../migrations/0017_material_note.sql
\ir ../migrations/0017_material_note.sql

do $$ begin
  if (select atttypid::regtype::text from pg_attribute
       where attrelid = 'public.materials'::regclass and attname = 'note' and not attisdropped)
     is distinct from 'text' then
    raise exception 'materials.note must be text';
  end if;
  if (select attnotnull from pg_attribute
       where attrelid = 'public.materials'::regclass and attname = 'note') then
    raise exception 'materials.note must be nullable';
  end if;
  if (select count(*) from pg_constraint
       where conrelid = 'public.materials'::regclass and conname = 'materials_note_length') <> 1 then
    raise exception 'materials_note_length must exist exactly once';
  end if;
  -- Existing rows are untouched.
  if (select note from public.materials where id = 'a1700000-0000-0000-0000-000000000021') is not null then
    raise exception 'existing material must keep note NULL';
  end if;
  -- GRANT and RLS stay as in 0008.
  if has_table_privilege('anon', 'public.materials', 'select') then raise exception 'anon can select materials'; end if;
  if not has_column_privilege('authenticated', 'public.materials', 'note', 'select,insert,update') then
    raise exception 'authenticated cannot read / write materials.note';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.materials'::regclass) then
    raise exception 'RLS disabled on materials';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'materials'
                  and policyname = 'materials_owner_all') then
    raise exception 'materials_owner_all lost';
  end if;
end $$;

set local role authenticated;

-- User A ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1700000-0000-0000-0000-000000000001', true);
do $$
declare v_id uuid;
begin
  insert into public.materials (user_id, plan_id, title, note)
  values (auth.uid(), 'a1700000-0000-0000-0000-000000000011', 'with note',
          E'第3章の非同期処理を理解する\n演習を解く')
  returning id into v_id;
  if (select note from public.materials where id = v_id) <> E'第3章の非同期処理を理解する\n演習を解く' then
    raise exception 'note not stored as sent';
  end if;

  -- 1000 characters (multibyte) is allowed, 1001 is rejected.
  update public.materials set note = repeat('あ', 1000) where id = v_id;
  begin
    update public.materials set note = repeat('あ', 1001) where id = v_id;
    raise exception 'note of 1001 characters allowed';
  exception when check_violation then null; end;
  update public.materials set note = null where id = v_id;

  -- completed_at still follows status (BR-05), note does not affect it.
  update public.materials set status = 'done', completed_at = date '2026-09-30', note = 'done'
   where id = 'a1700000-0000-0000-0000-000000000021';
  if (select completed_at from public.materials where id = 'a1700000-0000-0000-0000-000000000021')
     is distinct from date '2026-09-30' then
    raise exception 'completed_at not kept for done';
  end if;
  if not exists (select 1 from public.achievements where kind = 'material'
                  and id = 'a1700000-0000-0000-0000-000000000021') then
    raise exception 'done material missing from achievements';
  end if;
  update public.materials set status = 'todo' where id = 'a1700000-0000-0000-0000-000000000021';
  if (select completed_at from public.materials where id = 'a1700000-0000-0000-0000-000000000021') is not null then
    raise exception 'completed_at not cleared when leaving done';
  end if;
  if exists (select 1 from public.achievements where kind = 'material'
              and id = 'a1700000-0000-0000-0000-000000000021') then
    raise exception 'material left in achievements after leaving done';
  end if;
end $$;

-- User B cannot see or change A's note ------------------------------------
select set_config('request.jwt.claim.sub', 'a1700000-0000-0000-0000-000000000002', true);
do $$
declare n int;
begin
  if exists (select 1 from public.materials where id = 'a1700000-0000-0000-0000-000000000021') then
    raise exception 'B can see A material';
  end if;
  update public.materials set note = 'B was here' where id = 'a1700000-0000-0000-0000-000000000021';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A material note'; end if;
end $$;

reset role;
do $$ begin
  if (select note from public.materials where id = 'a1700000-0000-0000-0000-000000000021') <> 'done' then
    raise exception 'A note changed by B';
  end if;
end $$;

select '0017_material_note: all checks passed' as result;
rollback;
