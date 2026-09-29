-- Apply only to the local Docker database after migrations 0001-0006.
-- The original migrations rely on the old Supabase default API grants.
-- Current Supabase projects do not grant table access automatically.
-- RLS in 0001 still limits authenticated users to their own rows.
grant select, insert, update, delete
on table public.tasks, public.daily_reviews
to authenticated;
