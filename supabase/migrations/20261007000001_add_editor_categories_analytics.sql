create table if not exists public.categories (
  name text primary key check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now()
);

insert into public.categories (name)
values ('Bridal style')
on conflict (name) do nothing;

alter table public.categories enable row level security;
grant select, insert, delete on public.categories to authenticated;

drop policy if exists "Editors can manage categories" on public.categories;
create policy "Editors can manage categories"
  on public.categories for all to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create table if not exists public.post_view_events (
  post_id uuid not null references public.posts(id) on delete cascade,
  visitor_id uuid not null,
  view_window bigint not null,
  viewed_at timestamptz not null default now(),
  primary key (post_id, visitor_id, view_window)
);

create index if not exists post_view_events_viewed_at_idx
  on public.post_view_events (viewed_at desc);

create table if not exists public.post_live_viewers (
  post_id uuid not null references public.posts(id) on delete cascade,
  visitor_id uuid not null,
  last_seen timestamptz not null default now(),
  primary key (post_id, visitor_id)
);

create index if not exists post_live_viewers_last_seen_idx
  on public.post_live_viewers (last_seen desc);

alter table public.post_view_events enable row level security;
alter table public.post_live_viewers enable row level security;

revoke all on public.post_view_events from anon, authenticated;
revoke all on public.post_live_viewers from anon, authenticated;

create or replace function public.record_post_view(p_post_id uuid, p_visitor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_total bigint;
  v_live bigint;
begin
  if p_post_id is null or p_visitor_id is null then
    raise exception 'A post and anonymous visitor id are required.';
  end if;
  if not exists (
    select 1 from public.posts where id = p_post_id and status = 'published'
  ) then
    raise exception 'Published post not found.';
  end if;

  insert into public.post_view_events (post_id, visitor_id, view_window)
  values (p_post_id, p_visitor_id, floor(extract(epoch from now()) / 1800)::bigint)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  insert into public.post_live_viewers (post_id, visitor_id, last_seen)
  values (p_post_id, p_visitor_id, now())
  on conflict (post_id, visitor_id)
  do update set last_seen = excluded.last_seen;

  delete from public.post_live_viewers
  where last_seen < now() - interval '90 seconds';

  select count(*) into v_total
  from public.post_view_events where post_id = p_post_id;

  select count(*) into v_live
  from public.post_live_viewers
  where post_id = p_post_id and last_seen >= now() - interval '90 seconds';

  return jsonb_build_object(
    'recorded', v_inserted > 0,
    'total_views', v_total,
    'active_viewers', v_live
  );
end;
$$;

create or replace function public.get_editor_analytics()
returns table (
  post_id uuid,
  total_views bigint,
  views_today bigint,
  active_viewers bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view article analytics.';
  end if;
  return query
    select
      p.id,
      count(distinct (e.view_window, e.visitor_id)) filter (
        where e.post_id is not null
      ),
      count(distinct (e.view_window, e.visitor_id)) filter (
        where e.post_id is not null
          and e.viewed_at >= date_trunc('day', now())
      ),
      count(distinct v.visitor_id) filter (
        where v.last_seen >= now() - interval '90 seconds'
      )
    from public.posts p
    left join public.post_view_events e on e.post_id = p.id
    left join public.post_live_viewers v on v.post_id = p.id
    where p.owner_id = auth.uid()
    group by p.id;
end;
$$;

revoke all on function public.record_post_view(uuid, uuid) from public;
grant execute on function public.record_post_view(uuid, uuid) to anon, authenticated;
revoke all on function public.get_editor_analytics() from public, anon;
grant execute on function public.get_editor_analytics() to authenticated;
