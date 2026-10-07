alter table public.posts
  add column if not exists body_images jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_body_images_is_array'
  ) then
    alter table public.posts
      add constraint posts_body_images_is_array
      check (jsonb_typeof(body_images) = 'array');
  end if;
end
$$;

alter table public.posts
  alter column source_url drop not null;

alter table public.posts
  drop column if exists image_rights_confirmed;
