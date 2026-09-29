-- Stride: materials, milestones, and the date-change score fix (release 3)
-- Design: docs/design/study-plans.md (2.2, 4.2, 4.4)
-- - tasks.is_milestone
-- - materials / material_phases (+ RLS, explicit GRANT, triggers)
-- - touch_daily_review_after_task_change: also refresh the OLD date's review
--   when a task's scheduled_date changes (e.g. "move to today")
-- This migration only adds objects and replaces one trigger function body.
-- calculate_daily_score is not touched.

-- tasks: milestone mark -------------------------------------------------

alter table public.tasks
  add column if not exists is_milestone boolean not null default false;

-- Tables ---------------------------------------------------------------

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  url text check (url is null or url ~ '^https?://'),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done')),
  completed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists materials_plan_idx on public.materials (plan_id);

create table if not exists public.material_phases (
  material_id uuid not null references public.materials(id) on delete cascade,
  phase_id uuid not null references public.phases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (material_id, phase_id)
);

create index if not exists material_phases_phase_idx
  on public.material_phases (phase_id);

-- Grants ---------------------------------------------------------------
-- Newer Supabase stacks do not grant API roles on new tables by default.
-- RLS below still restricts every row to its owner. anon gets nothing.

grant select, insert, update, delete on
  public.materials, public.material_phases
  to authenticated;

-- RLS ------------------------------------------------------------------

alter table public.materials enable row level security;
alter table public.material_phases enable row level security;

-- Child rows also require that the parent rows belong to the caller.
drop policy if exists "materials_owner_all" on public.materials;
create policy "materials_owner_all" on public.materials for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.plans p
       where p.id = plan_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "material_phases_owner_all" on public.material_phases;
create policy "material_phases_owner_all" on public.material_phases for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.materials m
       where m.id = material_id and m.user_id = auth.uid()
    )
    and exists (
      select 1 from public.phases ph
       where ph.id = phase_id and ph.user_id = auth.uid()
    )
  );

-- Triggers -------------------------------------------------------------

drop trigger if exists set_updated_at on public.materials;
create trigger set_updated_at before update on public.materials
for each row execute function public.set_updated_at();

-- completed_at follows status (BR-05). The client sends its local date;
-- current_date (UTC) is only a fallback when none was sent.
create or replace function public.materials_set_completed_at()
returns trigger as $$
begin
  if new.status <> 'done' then
    new.completed_at := null;
  elsif new.completed_at is null then
    new.completed_at := current_date;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists materials_set_completed_at on public.materials;
create trigger materials_set_completed_at
before insert or update on public.materials
for each row execute function public.materials_set_completed_at();

-- Date-change score fix (design 2.2) ------------------------------------
-- Same behavior as 0001 (refresh the review of the row's current date), plus:
-- when an UPDATE moves a task to another date, refresh the old date too.
-- Only the function body is replaced; trg_touch_review_on_task is unchanged.

create or replace function public.touch_daily_review_after_task_change()
returns trigger as $$
declare
  target_user uuid;
  target_date date;
begin
  if (tg_op = 'DELETE') then
    target_user := old.user_id;
    target_date := old.scheduled_date;
  else
    target_user := new.user_id;
    target_date := new.scheduled_date;
  end if;

  if target_date is not null then
    -- Bump updated_at on the matching review (if any) to retrigger scoring.
    update public.daily_reviews
       set updated_at = now()
     where user_id = target_user
       and date = target_date;
  end if;

  if tg_op = 'UPDATE'
     and old.scheduled_date is not null
     and old.scheduled_date is distinct from new.scheduled_date then
    update public.daily_reviews
       set updated_at = now()
     where user_id = old.user_id
       and date = old.scheduled_date;
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql;
