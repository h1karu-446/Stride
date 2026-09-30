-- Allow a plan's phases to overlap. generate_routine_tasks already selects
-- routines from every phase covering the date, with one task per routine/day.
alter table public.phases drop constraint if exists phases_no_overlap;
