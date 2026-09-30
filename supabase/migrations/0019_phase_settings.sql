-- Save a phase and its complete routine menu as one transaction (#49, #52).
-- A failed routine leaves the phase and every existing routine unchanged.
create or replace function public.save_phase_settings(
  p_plan_id uuid,
  p_phase_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_routines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phase_id uuid;
  v_routine_id uuid;
  v_item jsonb;
  v_keep_ids uuid[] := '{}'::uuid[];
  v_weekdays smallint[];
begin
  if auth.uid() is null or not exists (
    select 1 from public.plans
     where id = p_plan_id and user_id = auth.uid() for update
  ) then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if p_routines is null or jsonb_typeof(p_routines) <> 'array' then
    raise exception 'routines must be an array' using errcode = '22023';
  end if;

  if p_phase_id is not null then
    select id into v_phase_id from public.phases
     where id = p_phase_id and plan_id = p_plan_id and user_id = auth.uid()
       and not is_implicit
     for update;
    if v_phase_id is null then
      raise exception 'phase not found' using errcode = 'P0002';
    end if;
    update public.phases
       set name = btrim(p_name), start_date = p_start_date, end_date = p_end_date
     where id = v_phase_id;
  else
    select id into v_phase_id from public.phases
     where plan_id = p_plan_id and user_id = auth.uid() and is_implicit
     for update;
    if v_phase_id is not null then
      update public.phases
         set is_implicit = false, name = btrim(p_name),
             start_date = p_start_date, end_date = p_end_date
       where id = v_phase_id;
    else
      insert into public.phases (user_id, plan_id, name, start_date, end_date)
      values (auth.uid(), p_plan_id, btrim(p_name), p_start_date, p_end_date)
      returning id into v_phase_id;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_routines) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item->'weekdays') <> 'array' then
      raise exception 'invalid routine' using errcode = '22023';
    end if;
    select array_agg(day::smallint order by day::smallint)
      into v_weekdays
      from jsonb_array_elements_text(v_item->'weekdays') as day;
    v_routine_id := nullif(v_item->>'id', '')::uuid;
    if v_routine_id is not null then
      if v_routine_id = any(v_keep_ids) then
        raise exception 'duplicate routine' using errcode = '22023';
      end if;
      update public.routines
         set title = btrim(v_item->>'title'),
             minutes = (v_item->>'minutes')::integer,
             weekdays = v_weekdays,
             importance = v_item->>'importance',
             menu = nullif(btrim(v_item->>'menu'), '')
       where id = v_routine_id and phase_id = v_phase_id and user_id = auth.uid();
      if not found then
        raise exception 'routine not found' using errcode = 'P0002';
      end if;
    else
      insert into public.routines (
        user_id, phase_id, title, minutes, weekdays, importance, menu
      ) values (
        auth.uid(), v_phase_id, btrim(v_item->>'title'),
        (v_item->>'minutes')::integer, v_weekdays,
        v_item->>'importance', nullif(btrim(v_item->>'menu'), '')
      ) returning id into v_routine_id;
    end if;
    v_keep_ids := array_append(v_keep_ids, v_routine_id);
  end loop;

  delete from public.routines
   where phase_id = v_phase_id and user_id = auth.uid()
     and not (id = any(v_keep_ids));
  return v_phase_id;
end;
$$;

revoke all on function public.save_phase_settings(uuid, uuid, text, date, date, jsonb) from public;
grant execute on function public.save_phase_settings(uuid, uuid, text, date, date, jsonb) to authenticated;
