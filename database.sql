-- Votee Night Play — Supabase database setup (multi-night + names)
-- Run this entire file in Supabase: SQL Editor > New query > Run.
--
-- IMPORTANT: This script replaces the earlier one-night anonymous schema and
-- clears any earlier test votes. The public website can read only aggregated
-- totals and the currently signed-in browser's own submission.

begin;

-- Remove the earlier version, if it exists.
drop function if exists public.cast_vote(date);
drop function if exists public.get_my_vote();
drop function if exists public.get_vote_summary();
drop function if exists public.submit_availability(text, text, date[]);
drop function if exists public.get_my_submission();
drop view if exists public.admin_vote_details;
drop table if exists public.vote_choices cascade;
drop table if exists public.voter_submissions cascade;
drop table if exists public.votes cascade;

create table public.voter_submissions (
  voter_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  constraint first_name_length check (char_length(first_name) between 1 and 50),
  constraint last_name_length check (char_length(last_name) between 1 and 50)
);

create table public.vote_choices (
  voter_id uuid not null references public.voter_submissions(voter_id) on delete cascade,
  event_date date not null,
  selected_at timestamptz not null default now(),
  primary key (voter_id, event_date)
);

alter table public.voter_submissions enable row level security;
alter table public.vote_choices enable row level security;

-- Do not allow direct browser reads or writes to personal records.
revoke all on table public.voter_submissions from public, anon, authenticated;
revoke all on table public.vote_choices from public, anon, authenticated;

-- Public-facing totals only. No names or voter identifiers are returned.
create or replace function public.get_vote_summary()
returns table (
  event_date date,
  vote_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.event_date, count(*)::bigint as vote_count
  from public.vote_choices as c
  where c.event_date >= (timezone('America/New_York', now()))::date
    and c.event_date <= (timezone('America/New_York', now()))::date + 6
    and extract(isodow from c.event_date) <> 5
  group by c.event_date
  order by c.event_date;
$$;

-- Returns only the current anonymous browser user's own saved submission.
create or replace function public.get_my_submission()
returns table (
  first_name text,
  last_name text,
  event_dates date[],
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.first_name,
    s.last_name,
    coalesce(array_agg(c.event_date order by c.event_date)
      filter (where c.event_date is not null), array[]::date[]) as event_dates,
    s.submitted_at
  from public.voter_submissions as s
  left join public.vote_choices as c on c.voter_id = s.voter_id
  where s.voter_id = auth.uid()
  group by s.voter_id, s.first_name, s.last_name, s.submitted_at;
$$;

-- Replaces this browser user's saved availability with the submitted choices.
create or replace function public.submit_availability(
  p_first_name text,
  p_last_name text,
  p_event_dates date[]
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  local_today date := (timezone('America/New_York', now()))::date;
  clean_first_name text := btrim(coalesce(p_first_name, ''));
  clean_last_name text := btrim(coalesce(p_last_name, ''));
  clean_dates date[];
  submitted_time timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if char_length(clean_first_name) < 1 or char_length(clean_first_name) > 50 then
    raise exception 'Please enter a valid first name.';
  end if;

  if char_length(clean_last_name) < 1 or char_length(clean_last_name) > 50 then
    raise exception 'Please enter a valid last name.';
  end if;

  select coalesce(array_agg(distinct selected_date order by selected_date), array[]::date[])
  into clean_dates
  from unnest(coalesce(p_event_dates, array[]::date[])) as d(selected_date);

  if cardinality(clean_dates) < 1 then
    raise exception 'Please select at least one night.';
  end if;

  if cardinality(clean_dates) > 6 then
    raise exception 'Too many nights were selected.';
  end if;

  if exists (
    select 1
    from unnest(clean_dates) as d(selected_date)
    where selected_date < local_today
       or selected_date > local_today + 6
       or extract(isodow from selected_date) = 5
  ) then
    raise exception 'One or more selected nights are unavailable.';
  end if;

  insert into public.voter_submissions (
    voter_id, first_name, last_name, submitted_at
  ) values (
    auth.uid(), clean_first_name, clean_last_name, submitted_time
  )
  on conflict (voter_id)
  do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    submitted_at = excluded.submitted_at;

  delete from public.vote_choices
  where voter_id = auth.uid();

  insert into public.vote_choices (voter_id, event_date, selected_at)
  select auth.uid(), selected_date, submitted_time
  from unnest(clean_dates) as d(selected_date);

  return submitted_time;
end;
$$;

-- Organizer-only convenience view. It is visible in the Supabase dashboard,
-- but browser roles receive no permission to query it.
create view public.admin_vote_details as
select
  s.first_name,
  s.last_name,
  c.event_date,
  s.submitted_at,
  c.selected_at
from public.voter_submissions as s
join public.vote_choices as c on c.voter_id = s.voter_id
order by c.event_date, s.last_name, s.first_name;

revoke all on function public.get_vote_summary() from public, anon;
revoke all on function public.get_my_submission() from public, anon;
revoke all on function public.submit_availability(text, text, date[]) from public, anon;
revoke all on table public.admin_vote_details from public, anon, authenticated;

grant usage on schema public to authenticated;
grant execute on function public.get_vote_summary() to authenticated;
grant execute on function public.get_my_submission() to authenticated;
grant execute on function public.submit_availability(text, text, date[]) to authenticated;

commit;
